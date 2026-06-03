/**
 * Plans 路由 — GET /api/plans/demo, POST /api/plans/select, POST /api/plans/save
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getSelectedPlanId, selectPlan } from "../services/store.js";
import { planOptions } from "../data/mockData.js";
import { NotFoundError } from "../common/errors.js";
import { sendOk } from "../common/response.js";
import { optionalUserId } from "../common/uid.js";

export async function registerPlanRoutes(app: FastifyInstance) {
  app.get("/api/plans/demo", { preHandler: [app.optionalAuthGuard] }, async (request) => ({
    selectedPlanId: getSelectedPlanId(request.userId ?? "_anon"),
    options: planOptions,
  }));

  app.post("/api/plans/select", { preHandler: [app.optionalAuthGuard] }, async (request, reply) => {
    const input = z.object({ planId: z.string() }).parse(request.body);
    if (!planOptions.some((plan) => plan.id === input.planId)) {
      throw new NotFoundError("PLAN_NOT_FOUND");
    }
    return sendOk(reply, selectPlan(request.userId ?? "_anon", input.planId));
  });

  app.post("/api/plans/save", { preHandler: [app.optionalAuthGuard] }, async (request, reply) => {
    const input = z.object({
      conversationId: z.string().uuid().optional(),
      planId: z.string(),
      optionId: z.string(),
    }).parse(request.body);

    const userId = optionalUserId(request);
    if (!userId) {
      return reply.status(401).send({ error: "需要登录才能保存方案" });
    }

    const db = app.db;
    if (!db) {
      return reply.status(503).send({ error: "数据库不可用" });
    }

    // Idempotent: check if already saved (by userId + matching intent JSON)
    const existing = await db.plan.findFirst({
      where: {
        userId,
        intent: { path: ["optionId"], equals: input.optionId },
      },
    });

    if (existing) {
      return sendOk(reply, { planId: existing.id, message: "方案已保存（重复）" });
    }

    // Create plan record
    const plan = await db.plan.create({
      data: {
        userId,
        conversationId: input.conversationId ?? null,
        title: `方案 ${input.optionId.slice(0, 8)}`,
        status: "saved",
        intent: { conversationId: input.conversationId, planId: input.planId, optionId: input.optionId },
      },
    });

    return sendOk(reply, { planId: plan.id, message: "方案已保存" });
  });
}
