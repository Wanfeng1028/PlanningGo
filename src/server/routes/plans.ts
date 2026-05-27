/**
 * Plans 路由 — GET /api/plans/demo, POST /api/plans/select
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getSelectedPlanId, selectPlan } from "../services/store.js";
import { planOptions } from "../data/mockData.js";
import { NotFoundError } from "../common/errors.js";
import { sendOk } from "../common/response.js";

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
}
