/**
 * Plans 路由 — GET /api/plans/demo, POST /api/plans/select
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getSelectedPlanId, selectPlan } from "../services/store.js";
import { planOptions } from "../data/mockData.js";

export async function registerPlanRoutes(app: FastifyInstance) {
  app.get("/api/plans/demo", { preHandler: [app.optionalAuthGuard] }, async (request) => ({
    selectedPlanId: getSelectedPlanId(request.userId ?? "_anon"),
    options: planOptions,
  }));

  app.post("/api/plans/select", { preHandler: [app.optionalAuthGuard] }, async (request, reply) => {
    const input = z.object({ planId: z.string() }).parse(request.body);
    if (!planOptions.some((plan) => plan.id === input.planId)) {
      return reply.status(404).send({ error: "PLAN_NOT_FOUND" });
    }
    return selectPlan(request.userId ?? "_anon", input.planId);
  });
}
