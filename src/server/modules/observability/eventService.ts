import type { PermissionScope, UserPermissionSnapshot } from "../agent/middleware/permissionGuard";
import { env } from "../../config/env";

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
    userEvent: {
      create: async () => ({ id: "mock" }),
    },
    errorLog: {
      create: async () => ({ id: "mock" }),
    },
  };
}

/**
 * Log a user event
 */
export async function trackEvent(params: {
  userId?: string;
  guestId?: string;
  conversationId?: string;
  eventName: string;
  eventPayload?: Record<string, unknown>;
  page?: string;
  traceId?: string;
}): Promise<void> {
  if (!env.ENABLE_USER_EVENTS) {
    return;
  }

  const prisma = getPrisma();

  try {
    await prisma.userEvent.create({
      data: {
        userId: params.userId,
        guestId: params.guestId,
        conversationId: params.conversationId,
        eventName: params.eventName,
        eventPayloadJson: params.eventPayload as any,
        page: params.page || "",
        traceId: params.traceId || "",
      },
    });
  } catch (error) {
    console.error("Failed to track event:", error);
    // Don't throw - event tracking failures shouldn't break the pipeline
  }
}

/**
 * Log a client error
 */
export async function reportClientError(params: {
  userId?: string;
  guestId?: string;
  traceId?: string;
  route: string;
  message: string;
  stack?: string;
  payload?: Record<string, unknown>;
}): Promise<void> {
  if (!env.ENABLE_CLIENT_ERRORS) {
    return;
  }

  const prisma = getPrisma();

  try {
    await prisma.errorLog.create({
      data: {
        userId: params.userId,
        guestId: params.guestId,
        traceId: params.traceId || "",
        route: params.route,
        message: params.message,
        stack: params.stack,
        payloadJson: params.payload as any,
      },
    });
  } catch (error) {
    console.error("Failed to report client error:", error);
    // Don't throw - error reporting failures shouldn't break the pipeline
  }
}
