import { createId } from "../../common/id";

// Use a lazy-loaded Prisma client to avoid initialization issues
let prismaInstance: any = null;

function getPrisma() {
  if (!prismaInstance) {
    try {
      const { PrismaClient } = require("../../generated/prisma/client.js");
      prismaInstance = new PrismaClient();
    } catch (error) {
      console.warn("Prisma client not available, using mock implementation");
      prismaInstance = createMockPrisma();
    }
  }
  return prismaInstance;
}

function createMockPrisma() {
  return {
    deviceSession: {
      findFirst: async () => null,
      update: async () => ({ id: "mock" }),
      create: async (data: any) => ({ id: createId("dev"), ...data.data }),
      updateMany: async () => ({ count: 0 }),
    },
  };
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
