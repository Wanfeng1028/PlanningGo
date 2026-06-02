/**
 * QR 码跨设备接力服务
 * 桌面端生成二维码 → 手机扫码 → 进入同一 conversation/plan
 *
 * 安全设计：QR URL 只包含 handoff tokenId，不包含 accessToken / refreshToken
 *
 * 注意：HandoffSession 模型已添加到 schema.prisma，但因 Prisma 7 与 Node 20.18
 * 存在 ESM 兼容性问题导致 `prisma generate` 暂时失败。
 * 这里使用 $executeRaw / $queryRaw 操作，无需依赖生成的模型类型。
 */
import { createId } from "../../common/id";
import { env } from "../../config/env";
import { getPrismaClient } from "../../common/prisma";
import { createHandoffToken, hashToken, type HandoffTokenPayload } from "./handoffToken";
import type { PermissionScope } from "../agent/middleware/permissionGuard";
import QRCode from "qrcode";

/**
 * Create a mobile handoff session
 */
export async function createMobileHandoff(params: {
  conversationId: string;
  planId: string;
  selectedOptionId?: string;
  userId?: string;
  guestId?: string;
  scopes: PermissionScope[];
}): Promise<{
  handoffId: string;
  continueUrl: string;
  qrSvg: string;
  expiresAt: string;
}> {
  const prisma = getPrismaClient();
  if (!prisma) throw new Error("Database not available");

  const handoffId = createId("hnd");
  const tokenPayload = createHandoffToken(params);
  // tokenId is hashed for storage so the raw value is not persisted
  const tokenHash = hashToken(tokenPayload.tokenId);
  const expiresAt = new Date(Date.now() + env.HANDOFF_TOKEN_TTL_SECONDS * 1000);
  const now = new Date();

  // Use raw SQL since the HandoffSession model may not yet be in generated client
  await (prisma as any).$executeRawUnsafe(`
    INSERT INTO handoff_sessions (id, token_hash, conversation_id, plan_id, selected_option_id,
      user_id, guest_id, scopes, status, expires_at, created_at)
    VALUES ($1, $2, $3::uuid, $4::uuid, $5, $6::uuid, $7, $8::jsonb, $9, $10, $11)
  `, handoffId, tokenHash, params.conversationId, params.planId,
     params.selectedOptionId ?? null, params.userId ?? null, params.guestId ?? null,
     JSON.stringify(params.scopes), "waiting_scan", expiresAt, now);

  // Continue URL only contains the handoff tokenId — NO auth tokens
  const baseUrl = env.PUBLIC_APP_URL || "http://localhost:5173";
  const continueUrl = `${baseUrl}/m/continue/${tokenPayload.tokenId}`;

  // Generate real scannable QR code SVG
  const qrSvg = await QRCode.toString(continueUrl, {
    type: "svg",
    width: 200,
    margin: 2,
    errorCorrectionLevel: "M",
  });

  return {
    handoffId,
    continueUrl,
    qrSvg,
    expiresAt: expiresAt.toISOString(),
  };
}

/**
 * Get handoff session by token (tokenId from URL)
 */
export async function getHandoffByToken(tokenId: string): Promise<HandoffTokenPayload | null> {
  const prisma = getPrismaClient();
  if (!prisma) throw new Error("Database not available");

  const tokenHash = hashToken(tokenId);

  const rows: any[] = await (prisma as any).$queryRawUnsafe(`
    SELECT id, token_hash, conversation_id, plan_id, selected_option_id,
           user_id, guest_id, scopes, status, consumed_at, expires_at
    FROM handoff_sessions
    WHERE token_hash = $1
    LIMIT 1
  `, tokenHash);

  if (!rows.length) return null;
  const session = rows[0];

  // Check if already consumed
  if (session.consumed_at) return null;

  // Check expiration
  if (new Date() > new Date(session.expires_at)) return null;

  return {
    tokenId,
    conversationId: session.conversation_id,
    planId: session.plan_id || "",
    selectedOptionId: session.selected_option_id || undefined,
    userId: session.user_id || undefined,
    guestId: session.guest_id || undefined,
    scopes: (session.scopes ?? []) as PermissionScope[],
    expiresAt: new Date(session.expires_at).toISOString(),
    nonce: "",
  };
}

/**
 * Claim a handoff session (mobile device scans QR code)
 */
export async function claimHandoff(params: {
  token: string;
  deviceId: string;
  guestId?: string;
  grantedScopes: PermissionScope[];
}): Promise<{ success: boolean; handoffId: string }> {
  const prisma = getPrismaClient();
  if (!prisma) throw new Error("Database not available");

  const tokenHash = hashToken(params.token);

  const rows: any[] = await (prisma as any).$queryRawUnsafe(`
    SELECT id, consumed_at, expires_at
    FROM handoff_sessions
    WHERE token_hash = $1
    LIMIT 1
  `, tokenHash);

  if (!rows.length) throw new Error("Handoff session not found");
  const session = rows[0];

  if (session.consumed_at) throw new Error("Handoff session already consumed");
  if (new Date() > new Date(session.expires_at)) throw new Error("Handoff session expired");

  await (prisma as any).$executeRawUnsafe(`
    UPDATE handoff_sessions
    SET status = 'claimed', claimed_device_id = $1, claimed_at = $2
    WHERE id = $3
  `, params.deviceId, new Date(), session.id);

  return {
    success: true,
    handoffId: session.id,
  };
}

/**
 * Get handoff status
 */
export async function getHandoffStatus(handoffId: string): Promise<{
  status: string;
  claimedDeviceId?: string;
  claimedAt?: string;
}> {
  const prisma = getPrismaClient();
  if (!prisma) throw new Error("Database not available");

  const rows: any[] = await (prisma as any).$queryRawUnsafe(`
    SELECT status, claimed_device_id, claimed_at
    FROM handoff_sessions
    WHERE id = $1
    LIMIT 1
  `, handoffId);

  if (!rows.length) throw new Error("Handoff session not found");
  const session = rows[0];

  return {
    status: session.status,
    claimedDeviceId: session.claimed_device_id || undefined,
    claimedAt: session.claimed_at ? new Date(session.claimed_at).toISOString() : undefined,
  };
}

/**
 * Consume a handoff session (mark as used)
 */
export async function consumeHandoff(tokenId: string): Promise<void> {
  const prisma = getPrismaClient();
  if (!prisma) throw new Error("Database not available");

  const tokenHash = hashToken(tokenId);

  await (prisma as any).$executeRawUnsafe(`
    UPDATE handoff_sessions
    SET consumed_at = $1, status = 'consumed'
    WHERE token_hash = $2
  `, new Date(), tokenHash);
}
