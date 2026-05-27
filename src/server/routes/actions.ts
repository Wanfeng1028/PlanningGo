/**
 * Actions 路由
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { listActions, quoteAction, confirmAction, cancelAction } from "../services/store.js";
import { ForbiddenError, NotFoundError, RateLimitError } from "../common/errors.js";

export async function registerActionRoutes(app: FastifyInstance) {
  app.get("/api/actions", { preHandler: [app.authGuard] }, async (request) => {
    const query = z.object({ planId: z.string().optional() }).parse(request.query);
    return { items: listActions(query.planId, request.userId) };
  });

  app.post("/api/actions/:id/quote", { preHandler: [app.authGuard] }, async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    try {
      const result = quoteAction(params.id, request.userId!);
      if (!result) return reply.status(404).send({ ok: false, error: "ACTION_NOT_FOUND" });
      return result;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("FORBIDDEN")) throw new ForbiddenError("无权操作此 Action");
      if (message.includes("EXPIRED")) return reply.status(410).send({ ok: false, error: "ACTION_EXPIRED" });
      throw err;
    }
  });

  app.post("/api/actions/:id/confirm", { preHandler: [app.authGuard] }, async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({ userConfirmed: z.boolean().default(true) }).parse(request.body ?? {});
    if (!body.userConfirmed) return reply.status(400).send({ ok: false, error: "CONFIRM_REQUIRED" });
    try {
      const result = confirmAction(params.id, request.userId!);
      if (!result) return reply.status(404).send({ ok: false, error: "ACTION_NOT_FOUND" });
      return result;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("FORBIDDEN")) throw new ForbiddenError("无权操作此 Action");
      if (message.includes("EXPIRED")) return reply.status(410).send({ ok: false, error: "ACTION_EXPIRED" });
      if (message.includes("PAYMENT_DISABLED")) return reply.status(403).send({ ok: false, error: "PAYMENT_DISABLED" });
      throw err;
    }
  });

  app.post("/api/actions/:id/cancel", { preHandler: [app.authGuard] }, async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    try {
      const result = cancelAction(params.id, request.userId!);
      if (!result) return reply.status(404).send({ ok: false, error: "ACTION_NOT_FOUND" });
      return result;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("FORBIDDEN")) throw new ForbiddenError("无权操作此 Action");
      throw err;
    }
  });
}
