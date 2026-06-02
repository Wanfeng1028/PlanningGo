/**
 * Actions 路由
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { listActions, quoteAction, confirmAction, cancelAction } from "../services/store.js";
import { ForbiddenError, NotFoundError, RateLimitError } from "../common/errors.js";
import { sendOk } from "../common/response.js";
import { optionalUserId } from "../common/uid.js";

export async function registerActionRoutes(app: FastifyInstance) {
  app.get("/api/actions", { preHandler: [app.authGuard] }, async (request, reply) => {
    const query = z.object({ planId: z.string().optional() }).parse(request.query);
    return sendOk(reply, { items: listActions(query.planId, request.userId) });
  });

  app.post("/api/actions/:id/quote", { preHandler: [app.authGuard] }, async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    try {
      const result = quoteAction(params.id, request.userId!);
      if (!result) throw new NotFoundError("ACTION_NOT_FOUND");
      return sendOk(reply, result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("FORBIDDEN")) throw new ForbiddenError("无权操作此 Action");
      if (message.includes("EXPIRED")) throw new NotFoundError("ACTION_EXPIRED");
      throw err;
    }
  });

  app.post("/api/actions/:id/confirm", { preHandler: [app.authGuard] }, async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({ userConfirmed: z.boolean().default(true) }).parse(request.body ?? {});
    if (!body.userConfirmed) throw new NotFoundError("CONFIRM_REQUIRED");
    try {
      const result = confirmAction(params.id, request.userId!);
      if (!result) throw new NotFoundError("ACTION_NOT_FOUND");
      return sendOk(reply, result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("FORBIDDEN")) throw new ForbiddenError("无权操作此 Action");
      if (message.includes("EXPIRED")) throw new NotFoundError("ACTION_EXPIRED");
      if (message.includes("PAYMENT_DISABLED")) throw new ForbiddenError("PAYMENT_DISABLED");
      throw err;
    }
  });

  app.post("/api/actions/:id/cancel", { preHandler: [app.authGuard] }, async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    try {
      const result = cancelAction(params.id, request.userId!);
      if (!result) throw new NotFoundError("ACTION_NOT_FOUND");
      return sendOk(reply, result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("FORBIDDEN")) throw new ForbiddenError("无权操作此 Action");
      throw err;
    }
  });

  // ── Track action clicks (works for both logged-in and guest users) ──
  app.post("/api/actions/track", { preHandler: [app.optionalAuthGuard] }, async (request, reply) => {
    const body = z
      .object({
        conversationId: z.string().optional(),
        planId: z.string().optional(),
        actionType: z.string(),
        label: z.string(),
      })
      .parse(request.body);

    const userId = optionalUserId(request);
    app.log.info({ userId, ...body }, "[actions:track] action clicked");

    // If DB available and user is logged in, store in memory table as an event log
    const db = app.db;
    if (db && userId) {
      try {
        await db.memory.create({
          data: {
            userId,
            category: "action_click",
            title: body.actionType,
            detail: JSON.stringify({
              conversationId: body.conversationId ?? null,
              planId: body.planId ?? null,
              label: body.label,
              clickedAt: new Date().toISOString(),
            }),
            weight: 0.3,
            source: "auto",
          },
        });
      } catch (err) {
        app.log.warn({ err }, "[actions:track] failed to persist click event");
      }
    }

    return sendOk(reply, { success: true });
  });
}
