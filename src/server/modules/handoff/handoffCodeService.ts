/**
 * HandoffCode 短期一次性接力码服务
 *
 * 安全设计：
 * - 二维码只包含短 code（6 位字母数字），不含 accessToken / refreshToken
 * - code 有效期 10 分钟
 * - code 一次性使用，claimed 后即失效
 */
import { randomBytes } from "node:crypto";
import { getPrismaClient } from "../../common/prisma";
import { env } from "../../config/env";
import QRCode from "qrcode";

const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const CODE_LENGTH = 6;

/**
 * Minimal type for the handoffCode Prisma model.
 * The generated types may not include this model due to prisma generate compatibility issues.
 */
interface HandoffCodeRecord {
  id: string;
  code: string;
  conversationId: string;
  planId: string | null;
  userId: string | null;
  guestId: string | null;
  status: string;
  expiresAt: Date;
  claimedDeviceId?: string;
  claimedAt?: Date;
}

interface HandoffCodeModel {
  create(args: { data: Record<string, unknown> }): Promise<HandoffCodeRecord>;
  findUnique(args: { where: Record<string, unknown> }): Promise<HandoffCodeRecord | null>;
  update(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<HandoffCodeRecord>;
}

interface HandoffCodePrisma {
  handoffCode: HandoffCodeModel;
}

/** Generate a URL-safe short code */
function generateShortCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no O/0/1/I ambiguity
  const bytes = randomBytes(CODE_LENGTH);
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return code;
}

export interface CreateHandoffCodeInput {
  conversationId: string;
  planId?: string;
  userId?: string;
  guestId?: string;
}

export interface HandoffCodeResult {
  code: string;
  continueUrl: string;
  qrSvg: string;
  expiresAt: string;
}

/**
 * Create a short-lived handoff code + QR SVG
 */
export async function createHandoffCode(input: CreateHandoffCodeInput): Promise<HandoffCodeResult> {
  const prisma = getPrismaClient();
  if (!prisma) throw new Error("Database not available");

  const code = generateShortCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);

  // Persist handoff code
  await (prisma as unknown as HandoffCodePrisma).handoffCode.create({
    data: {
      code,
      conversationId: input.conversationId,
      planId: input.planId ?? null,
      userId: input.userId ?? null,
      guestId: input.guestId ?? null,
      status: "active",
      expiresAt,
    },
  });

  // Build continue URL — only contains the short code, NO auth tokens
  const baseUrl = env.PUBLIC_APP_URL || "http://localhost:5173";
  const continueUrl = `${baseUrl}/handoff/${code}`;

  // Generate real scannable QR code SVG
  const qrSvg = await QRCode.toString(continueUrl, {
    type: "svg",
    width: 200,
    margin: 2,
    errorCorrectionLevel: "M",
  });

  return {
    code,
    continueUrl,
    qrSvg,
    expiresAt: expiresAt.toISOString(),
  };
}

/**
 * Query a handoff code (check existence, expiration, status)
 */
export async function getHandoffCode(code: string): Promise<{
  code: string;
  conversationId: string;
  planId: string | null;
  userId: string | null;
  guestId: string | null;
  status: string;
  expiresAt: string;
} | null> {
  const prisma = getPrismaClient();
  if (!prisma) throw new Error("Database not available");

  const record = await (prisma as unknown as HandoffCodePrisma).handoffCode.findUnique({
    where: { code: code.toUpperCase() },
  });

  if (!record) return null;

  // Check expiration
  if (new Date() > record.expiresAt) {
    return null;
  }

  // Check if already claimed
  if (record.status !== "active") {
    return null;
  }

  return {
    code: record.code,
    conversationId: record.conversationId,
    planId: record.planId,
    userId: record.userId,
    guestId: record.guestId,
    status: record.status,
    expiresAt: record.expiresAt.toISOString(),
  };
}

/**
 * Claim a handoff code (mobile device scans QR)
 * One-time use: marks code as claimed, returns conversation context
 */
export async function claimHandoffCode(params: {
  code: string;
  deviceId: string;
}): Promise<{
  success: boolean;
  conversationId: string;
  planId: string | null;
}> {
  const prisma = getPrismaClient();
  if (!prisma) throw new Error("Database not available");

  const record = await (prisma as unknown as HandoffCodePrisma).handoffCode.findUnique({
    where: { code: params.code.toUpperCase() },
  });

  if (!record) {
    throw new Error("Handoff code not found");
  }

  if (record.status !== "active") {
    throw new Error("Handoff code already claimed");
  }

  if (new Date() > record.expiresAt) {
    throw new Error("Handoff code expired");
  }

  // Mark as claimed (one-time use)
  await (prisma as unknown as HandoffCodePrisma).handoffCode.update({
    where: { id: record.id },
    data: {
      status: "claimed",
      claimedDeviceId: params.deviceId,
      claimedAt: new Date(),
    },
  });

  return {
    success: true,
    conversationId: record.conversationId,
    planId: record.planId,
  };
}
