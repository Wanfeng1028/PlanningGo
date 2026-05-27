import { createId } from "../../common/id";
import { env } from "../../config/env";
import { getPrismaClient } from "../../common/prisma";
import { createHandoffToken, hashToken, type HandoffTokenPayload } from "./handoffToken";
import type { PermissionScope } from "../agent/middleware/permissionGuard";

function getPrisma() {
  const prisma = getPrismaClient();
  if (!prisma) throw new Error("Database not available");
  return prisma as any; // HandoffSession model not in schema — dead code pending schema migration
}

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
  const prisma = getPrisma();

  const handoffId = createId("hnd");
  const tokenPayload = createHandoffToken(params);
  const tokenHash = hashToken(tokenPayload.tokenId);
  const expiresAt = new Date(Date.now() + env.HANDOFF_TOKEN_TTL_SECONDS * 1000);

  // Store handoff session in database
  await prisma.handoffSession.create({
    data: {
      id: handoffId,
      tokenHash,
      conversationId: params.conversationId,
      planId: params.planId,
      selectedOptionId: params.selectedOptionId,
      userId: params.userId,
      guestId: params.guestId,
      scopes: params.scopes as any,
      status: "waiting_scan",
      expiresAt,
    },
  });

  // Generate continue URL
  const continueUrl = `${env.PUBLIC_APP_URL}/m/continue/${tokenPayload.tokenId}`;

  // Generate QR code SVG (simplified - in production use qrcode library)
  const qrSvg = generateQrSvg(continueUrl);

  return {
    handoffId,
    continueUrl,
    qrSvg,
    expiresAt: expiresAt.toISOString(),
  };
}

/**
 * Get handoff session by token
 */
export async function getHandoffByToken(token: string): Promise<HandoffTokenPayload | null> {
  const prisma = getPrisma();
  const tokenHash = hashToken(token);

  const session = await prisma.handoffSession.findUnique({
    where: { tokenHash },
  });

  if (!session) {
    return null;
  }

  // Check if already consumed
  if (session.consumedAt) {
    return null;
  }

  // Check expiration
  if (new Date() > session.expiresAt) {
    return null;
  }

  return {
    tokenId: token,
    conversationId: session.conversationId,
    planId: session.planId || "",
    selectedOptionId: session.selectedOptionId || undefined,
    userId: session.userId || undefined,
    guestId: session.guestId || undefined,
    scopes: session.scopes as PermissionScope[],
    expiresAt: session.expiresAt.toISOString(),
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
  const prisma = getPrisma();
  const tokenHash = hashToken(params.token);

  const session = await prisma.handoffSession.findUnique({
    where: { tokenHash },
  });

  if (!session) {
    throw new Error("Handoff session not found");
  }

  if (session.consumedAt) {
    throw new Error("Handoff session already consumed");
  }

  if (new Date() > session.expiresAt) {
    throw new Error("Handoff session expired");
  }

  // Update session as claimed
  await prisma.handoffSession.update({
    where: { id: session.id },
    data: {
      status: "claimed",
      claimedDeviceId: params.deviceId,
      claimedAt: new Date(),
    },
  });

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
  const prisma = getPrisma();

  const session = await prisma.handoffSession.findUnique({
    where: { id: handoffId },
  });

  if (!session) {
    throw new Error("Handoff session not found");
  }

  return {
    status: session.status,
    claimedDeviceId: session.claimedDeviceId || undefined,
    claimedAt: session.claimedAt?.toISOString(),
  };
}

/**
 * Consume a handoff session (mark as used)
 */
export async function consumeHandoff(token: string): Promise<void> {
  const prisma = getPrisma();
  const tokenHash = hashToken(token);

  await prisma.handoffSession.updateMany({
    where: { tokenHash },
    data: {
      consumedAt: new Date(),
      status: "consumed",
    },
  });
}

/**
 * Generate simple QR code SVG (placeholder - in production use qrcode library)
 */
function generateQrSvg(url: string): string {
  // This is a placeholder - in production, use the qrcode npm package
  // For now, return a simple SVG with the URL as text
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
  <rect width="200" height="200" fill="white"/>
  <rect x="10" y="10" width="60" height="60" fill="black"/>
  <rect x="130" y="10" width="60" height="60" fill="black"/>
  <rect x="10" y="130" width="60" height="60" fill="black"/>
  <text x="100" y="100" font-size="8" text-anchor="middle" fill="black">${url.substring(0, 30)}...</text>
</svg>
  `.trim();
}
