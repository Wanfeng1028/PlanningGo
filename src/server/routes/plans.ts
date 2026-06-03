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

/**
 * ExecutableAction 的 Zod schema，用于验证前端传入的 action 数据
 */
const executableActionSchema = z.object({
  id: z.string(),
  planId: z.string(),
  optionId: z.string(),
  userId: z.string(),
  type: z.string(),
  status: z.string(),
  title: z.string(),
  description: z.string(),
  confirmationRequired: z.boolean(),
  idempotencyKey: z.string().optional(),
  priceEstimate: z.string().optional(),
  expiresAt: z.string().optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
});

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
      conversationId: z.string().optional(),
      planId: z.string().optional(),
      optionId: z.string(),
      planData: z.object({
        title: z.string(),
        summary: z.string().optional(),
        targetGroup: z.string().optional(),
        score: z.number().optional(),
        totalDurationMinutes: z.number().optional(),
        totalCostMin: z.number().optional(),
        totalCostMax: z.number().optional(),
        walkingKm: z.number().optional(),
        assumptions: z.array(z.string()).optional(),
        risks: z.array(z.string()).optional(),
        highlights: z.array(z.string()).optional(),
        timeline: z.array(z.object({
          id: z.string(),
          startTime: z.string(),
          endTime: z.string(),
          type: z.string(),
          title: z.string(),
          poiName: z.string().nullable().optional(),
          durationMinutes: z.number().optional(),
          transport: z.string().optional(),
          bookingNeeded: z.boolean().optional(),
          description: z.string().optional(),
          estimatedCost: z.string().optional(),
          bookingHint: z.string().optional(),
          suggestions: z.array(z.string()).optional(),
        })).optional(),
      }).optional(),
      executableActions: z.array(executableActionSchema).optional(),
    }).parse(request.body);

    const userId = optionalUserId(request);
    if (!userId) {
      return reply.status(401).send({ error: "需要登录才能保存方案" });
    }

    const db = app.db;
    if (!db) {
      return reply.status(503).send({ error: "数据库不可用" });
    }

    // Idempotent: check if already saved for this conversation + plan + option
    const existing = await db.plan.findFirst({
      where: {
        userId,
        conversationId: input.conversationId ?? undefined,
        intent: { path: ["optionId"], equals: input.optionId },
      },
    });

    if (existing) {
      return sendOk(reply, { planId: existing.id, message: "方案已保存（重复）" });
    }

    const pd = input.planData;
    const actions = input.executableActions;

    // Create Plan
    const plan = await db.plan.create({
      data: {
        userId,
        conversationId: input.conversationId ?? null,
        title: pd?.title ?? `方案 ${input.optionId.slice(0, 8)}`,
        summary: pd?.summary ?? "",
        status: "saved",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        intent: { planId: input.planId, optionId: input.optionId } as Record<string, unknown> as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        contextSnapshot: {} as Record<string, unknown> as any,
      },
    });

    // Create PlanOption if planData provided
    if (pd) {
      const option = await db.planOption.create({
        data: {
          planId: plan.id,
          title: pd.title,
          targetGroup: pd.targetGroup ?? "unknown",
          score: pd.score ?? 0,
          totalDurationMin: pd.totalDurationMinutes ?? 0,
          costMin: pd.totalCostMin ?? 0,
          costMax: pd.totalCostMax ?? 0,
          summary: pd.summary ?? "",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          assumptions: (pd.assumptions ?? []) as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          risks: (pd.risks ?? []) as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          backupPlan: {} as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          validationReport: {} as any,
        },
      });

      // Create PlanSteps for each timeline step
      if (pd.timeline && pd.timeline.length > 0) {
        for (let i = 0; i < pd.timeline.length; i++) {
          const step = pd.timeline[i]!;
          const stepData: Record<string, unknown> = {
            planOptionId: option.id,
            orderIndex: i,
            startTime: step.startTime,
            endTime: step.endTime,
            type: step.type,
            placeName: step.poiName ?? null,
            action: step.title,
            durationMin: step.durationMinutes ?? 0,
            transport: step.transport ?? "none",
            bookingNeeded: step.bookingNeeded ?? false,
            description: step.description ?? null,
            estimatedCost: step.estimatedCost ?? null,
            bookingHint: step.bookingHint ?? null,
            suggestions: (step.suggestions ?? []) as unknown,
            metadata: {} as unknown,
          };
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await db.planStep.create({ data: stepData as any });
        }
      }
    }

    // Create ExecutableActions if provided
    if (actions && actions.length > 0) {
      for (const action of actions) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await db.executionAction.create({
          data: {
            planId: plan.id,
            type: action.type,
            title: action.title,
            description: action.description,
            status: action.status,
            priceEstimate: action.priceEstimate ?? null,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            metadata: (action.payload ?? {}) as any,
          },
        });
      }
    }

    return sendOk(reply, { planId: plan.id, message: "方案已保存" });
  });
}
