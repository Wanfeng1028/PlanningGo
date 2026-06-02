import { env } from "../../config/env";
import { getPrismaClient } from "../../common/prisma";
import type { Prisma } from "../../../generated/prisma/client.js";

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

  const prisma = getPrismaClient();
  if (!prisma) return;

  try {
    await prisma.userEvent.create({
      data: {
        userId: params.userId,
        guestId: params.guestId,
        conversationId: params.conversationId,
        eventName: params.eventName,
        eventPayloadJson: params.eventPayload as unknown as Prisma.InputJsonValue,
        page: params.page || "",
        traceId: params.traceId || "",
      },
    });
  } catch (error) {
    console.error("Failed to track event:", error);
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

  const prisma = getPrismaClient();
  if (!prisma) return;

  try {
    await prisma.errorLog.create({
      data: {
        userId: params.userId,
        guestId: params.guestId,
        traceId: params.traceId || "",
        route: params.route,
        message: params.message,
        stack: params.stack,
        payloadJson: params.payload as unknown as Prisma.InputJsonValue,
      },
    });
  } catch (error) {
    console.error("Failed to report client error:", error);
  }
}
