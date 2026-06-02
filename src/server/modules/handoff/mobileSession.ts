/**
 * @deprecated 未注册到路由 — DeviceSession 模型未在 Prisma schema 中定义
 * 保留供未来跨设备会话功能参考，当前为死代码
 */
import { getPrismaClient } from "../../common/prisma";

function getPrisma() {
  const prisma = getPrismaClient();
  if (!prisma) throw new Error("Database not available");
  return prisma as any; // DeviceSession model not in schema — dead code pending schema migration
}

/**
 * Create or update a device session
 */
export async function upsertDeviceSession(params: {
  userId?: string;
  guestId?: string;
  deviceType: string;
  platform: string;
  userAgent: string;
  city?: string;
  lat?: number;
  lng?: number;
}): Promise<{ sessionId: string }> {
  const prisma = getPrisma();

  // Try to find existing session for this user/guest
  const existing = await prisma.deviceSession.findFirst({
    where: {
      OR: [
        { userId: params.userId },
        { guestId: params.guestId },
      ],
    },
  });

  if (existing) {
    // Update existing session
    await prisma.deviceSession.update({
      where: { id: existing.id },
      data: {
        lastCity: params.city,
        lastLat: params.lat,
        lastLng: params.lng,
        lastSeenAt: new Date(),
      },
    });

    return { sessionId: existing.id };
  }

  // Create new session
  const session = await prisma.deviceSession.create({
    data: {
      userId: params.userId,
      guestId: params.guestId,
      deviceType: params.deviceType,
      platform: params.platform,
      userAgent: params.userAgent,
      lastCity: params.city,
      lastLat: params.lat,
      lastLng: params.lng,
      lastSeenAt: new Date(),
    },
  });

  return { sessionId: session.id };
}

/**
 * Get device session
 */
export async function getDeviceSession(sessionId: string): Promise<{
  userId?: string;
  guestId?: string;
  deviceType: string;
  platform: string;
  lastCity?: string;
  lastLat?: number;
  lastLng?: number;
} | null> {
  const prisma = getPrisma();

  const session = await prisma.deviceSession.findUnique({
    where: { id: sessionId },
  });

  if (!session) {
    return null;
  }

  return {
    userId: session.userId || undefined,
    guestId: session.guestId || undefined,
    deviceType: session.deviceType,
    platform: session.platform,
    lastCity: session.lastCity || undefined,
    lastLat: session.lastLat || undefined,
    lastLng: session.lastLng || undefined,
  };
}

/**
 * Update device location
 */
export async function updateDeviceLocation(params: {
  sessionId: string;
  city: string;
  lat: number;
  lng: number;
}): Promise<void> {
  const prisma = getPrisma();

  await prisma.deviceSession.update({
    where: { id: params.sessionId },
    data: {
      lastCity: params.city,
      lastLat: params.lat,
      lastLng: params.lng,
      lastSeenAt: new Date(),
    },
  });
}

/**
 * Sync session between desktop and mobile
 */
export async function syncSessions(params: {
  desktopSessionId: string;
  mobileSessionId: string;
  conversationId: string;
}): Promise<void> {
  const prisma = getPrisma();

  // In production, this would establish a link between desktop and mobile sessions
  // For now, we just update the last seen time
  await prisma.deviceSession.updateMany({
    where: {
      id: { in: [params.desktopSessionId, params.mobileSessionId] },
    },
    data: {
      lastSeenAt: new Date(),
    },
  });
}
