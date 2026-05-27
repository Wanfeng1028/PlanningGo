/**
 * Events & Client Errors 路由 — /api/events, /api/client-errors
 */

import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "../../generated/prisma/client.js";
import { z } from "zod";
import { sendOk, sendCreated, sendError } from "../common/response.js";
import * as mem from "../services/memoryStore.js";

interface AuthenticatedRequest {
  userId?: string;
  traceId?: string;
}

export async function registerEventRoutes(app: FastifyInstance) {
  // ── 记录用户事件 ──
  app.post("/api/events", { preHandler: [app.optionalAuthGuard] }, async (request, reply) => {
    const body = z
      .object({
        eventName: z.string().min(1).max(100),
        payload: z.any().optional(),
        page: z.string().max(200).optional(),
        guestId: z.string().optional(),
        conversationId: z.string().optional(),
      })
      .parse(request.body);

    const userId = (request as AuthenticatedRequest).userId as string | undefined;
    const db: PrismaClient | null = app.db;

    if (db) {
      try {
        const evt = await db.userEvent.create({
          data: {
            userId: userId ?? undefined,
            guestId: !userId ? (body.guestId ?? null) : null,
            conversationId: body.conversationId ?? null,
            eventName: body.eventName,
            eventPayloadJson: body.payload ?? {},
            page: body.page ?? "",
            traceId: (request as AuthenticatedRequest).traceId ?? "",
          },
        });
        return sendCreated(reply, { id: evt.id });
      } catch (err) {
        app.log.warn({ err }, "DB event tracking failed, falling back to memory");
      }
    }

    const evt = mem.trackEvent({
      userId,
      guestId: !userId ? body.guestId : undefined,
      conversationId: body.conversationId,
      eventName: body.eventName,
      eventPayloadJson: body.payload,
      page: body.page,
      traceId: (request as any).traceId,
    });
    return sendCreated(reply, { id: evt.id });
  });

  // ── 批量记录事件（可选） ──
  app.post("/api/events/batch", { preHandler: [app.optionalAuthGuard] }, async (request, reply) => {
    const body = z
      .object({
        events: z.array(z.object({
          eventName: z.string().min(1).max(100),
          payload: z.any().optional(),
          page: z.string().max(200).optional(),
          guestId: z.string().optional(),
          conversationId: z.string().optional(),
        })).min(1).max(50),
      })
      .parse(request.body);

    const userId = (request as AuthenticatedRequest).userId as string | undefined;
    const db: PrismaClient | null = app.db;
    const ids: string[] = [];

    if (db) {
      try {
        const data = body.events.map((evt) => ({
          userId: userId ?? undefined,
          guestId: !userId ? (evt.guestId ?? null) : null,
          conversationId: evt.conversationId ?? null,
          eventName: evt.eventName,
          eventPayloadJson: evt.payload ?? {},
          page: evt.page ?? "",
          traceId: (request as AuthenticatedRequest).traceId ?? "",
        }));
        await db.userEvent.createMany({ data });
        const created = await db.userEvent.findMany({
          where: { userId: userId ?? undefined, traceId: (request as AuthenticatedRequest).traceId ?? "" },
          orderBy: { createdAt: "desc" },
          take: body.events.length,
          select: { id: true },
        });
        ids.push(...created.map((e) => e.id));
      } catch (err) {
        app.log.warn({ err }, "DB batch event failed, falling back to memory");
      }
    }

    if (ids.length === 0) {
      for (const evt of body.events) {
        const created = mem.trackEvent({
          userId,
          guestId: !userId ? evt.guestId : undefined,
          conversationId: evt.conversationId,
          eventName: evt.eventName,
          eventPayloadJson: evt.payload,
          page: evt.page,
          traceId: (request as any).traceId,
        });
        ids.push(created.id);
      }
    }

    return sendCreated(reply, { ids, count: ids.length });
  });

  // ── 客户端错误日志 ──
  app.post("/api/client-errors", { preHandler: [app.optionalAuthGuard] }, async (request, reply) => {
    const body = z
      .object({
        message: z.string().min(1).max(2000),
        stack: z.string().max(5000).optional(),
        route: z.string().max(200).optional(),
        guestId: z.string().optional(),
        payload: z.any().optional(),
      })
      .parse(request.body);

    const userId = (request as AuthenticatedRequest).userId as string | undefined;
    const db: PrismaClient | null = app.db;

    if (db) {
      try {
        const log = await db.errorLog.create({
          data: {
            userId: userId ?? undefined,
            guestId: !userId ? (body.guestId ?? null) : null,
            traceId: (request as AuthenticatedRequest).traceId ?? "",
            route: body.route ?? "",
            message: body.message,
            stack: body.stack ?? null,
            payloadJson: body.payload ?? null,
          },
        });
        return sendCreated(reply, { id: log.id });
      } catch (err) {
        app.log.warn({ err }, "DB client error logging failed, falling back to memory");
      }
    }

    const log = mem.logClientError({
      userId,
      guestId: !userId ? body.guestId : undefined,
      traceId: (request as any).traceId,
      route: body.route,
      message: body.message,
      stack: body.stack,
      payloadJson: body.payload,
    });
    return sendCreated(reply, { id: log.id });
  });
}
