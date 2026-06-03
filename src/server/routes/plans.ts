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
 * 从 DB messages 中按 conversationId 恢复方案数据
 * 返回 { planId, optionId, planData, executableActions } 或 null
 */
async function restorePlanFromMessages(
  db: NonNullable<FastifyInstance["db"]>,
  conversationId: string,
  targetOptionId?: string,
) {
  const messages = await db.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    select: { role: true, payloadJson: true },
  });

  // 找到最近的 plan 消息 (type: "plan")
  let planPayload: unknown = null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]!;
    if (msg.role === "assistant" && msg.payloadJson) {
      const pj = msg.payloadJson as Record<string, unknown>;
      if (pj.type === "plan" && pj.data) {
        planPayload = pj.data;
        break;
      }
    }
  }

  if (!planPayload || typeof planPayload !== "object") return null;

  const data = planPayload as Record<string, unknown>;
  const options = (data.options as Array<Record<string, unknown>> | undefined) ?? [];

  // 找到目标 option
  const targetOption = targetOptionId
    ? options.find((o) => o.id === targetOptionId)
    : options[0];

  if (!targetOption) return null;

  const timeline = (targetOption.timeline as Array<Record<string, unknown>> | undefined) ?? [];
  const executableActions = (targetOption.executableActions as Array<Record<string, unknown>> | undefined) ?? [];

  return {
    planId: (targetOption.planId as string) || `plan-${Date.now()}`,
    optionId: (targetOption.id as string) || "",
    planData: {
      title: (targetOption.title as string) || "方案",
      summary: (targetOption.summary as string) ?? "",
      targetGroup: (targetOption.targetGroup as string) ?? "unknown",
      score: (targetOption.score as number) ?? 0,
      totalDurationMinutes: (targetOption.totalDurationMinutes as number) ?? 0,
      totalCostMin: (targetOption.totalCostMin as number) ?? 0,
      totalCostMax: (targetOption.totalCostMax as number) ?? 0,
      walkingKm: (targetOption.walkingKm as number) ?? 0,
      assumptions: (targetOption.assumptions as string[]) ?? [],
      risks: (targetOption.risks as string[]) ?? [],
      highlights: (targetOption.highlights as string[]) ?? [],
      timeline: timeline.map((s) => ({
        id: s.id as string,
        startTime: s.startTime as string,
        endTime: s.endTime as string,
        type: s.type as string,
        title: s.title as string,
        poiName: s.poiName ?? null,
        durationMinutes: (s.durationMinutes as number) ?? 0,
        transport: (s.transport as string) ?? "none",
        bookingNeeded: (s.bookingNeeded as boolean) ?? false,
        description: (s.description as string) ?? null,
        estimatedCost: (s.estimatedCost as string) ?? null,
        bookingHint: (s.bookingHint as string) ?? null,
        suggestions: (s.suggestions as string[]) ?? [],
      })),
    },
    executableActions: executableActions.map((a) => ({
      id: a.id as string,
      planId: a.planId as string,
      optionId: a.optionId as string,
      userId: a.userId as string,
      type: a.type as string,
      status: a.status as string,
      title: a.title as string,
      description: a.description as string,
      confirmationRequired: (a.confirmationRequired as boolean) ?? false,
      idempotencyKey: (a.idempotencyKey as string) || `idem-${a.id}`,
      priceEstimate: (a.priceEstimate as string) ?? null,
      expiresAt: (a.expiresAt as string) ?? undefined,
      payload: (a.payload as Record<string, unknown>) ?? {},
    })),
  };
}

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
      // planData 和 executableActions 作为 fallback，前端传了就用，没传就从 DB 恢复
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

    // ── V3: 优先从 DB messages 恢复方案（source of truth）──
    let restored = null;
    if (input.conversationId) {
      restored = await restorePlanFromMessages(db, input.conversationId, input.optionId);
    }

    // 如果恢复成功，用恢复的数据覆盖前端传来的数据
    const usePlanData = restored?.planData ?? input.planData;
    const useActions = restored?.executableActions ?? input.executableActions;
    const usePlanId = restored?.planId ?? input.planId;
    const useOptionId = restored?.optionId ?? input.optionId;

    // Idempotent: check if already saved for this conversation + plan + option
    const existing = await db.plan.findFirst({
      where: {
        userId,
        conversationId: input.conversationId ?? undefined,
        intent: { path: ["optionId"], equals: useOptionId },
      },
    });

    if (existing) {
      return sendOk(reply, { planId: existing.id, message: "方案已保存（重复）" });
    }

    // Create Plan
    const plan = await db.plan.create({
      data: {
        userId,
        conversationId: input.conversationId ?? null,
        title: usePlanData?.title ?? `方案 ${useOptionId?.slice?.(0, 8) ?? "unknown"}`,
        summary: usePlanData?.summary ?? "",
        status: "saved",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        intent: { planId: usePlanId, optionId: useOptionId } as Record<string, unknown> as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        contextSnapshot: {} as Record<string, unknown> as any,
      },
    });

    // Create PlanOption if planData provided
    if (usePlanData) {
      const option = await db.planOption.create({
        data: {
          planId: plan.id,
          title: usePlanData.title,
          targetGroup: usePlanData.targetGroup ?? "unknown",
          score: usePlanData.score ?? 0,
          totalDurationMin: usePlanData.totalDurationMinutes ?? 0,
          costMin: usePlanData.totalCostMin ?? 0,
          costMax: usePlanData.totalCostMax ?? 0,
          summary: usePlanData.summary ?? "",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          assumptions: (usePlanData.assumptions ?? []) as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          risks: (usePlanData.risks ?? []) as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          backupPlan: {} as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          validationReport: {} as any,
        },
      });

      // Create PlanSteps for each timeline step
      if (usePlanData.timeline && usePlanData.timeline.length > 0) {
        for (let i = 0; i < usePlanData.timeline.length; i++) {
          const step = usePlanData.timeline[i]!;
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
    if (useActions && useActions.length > 0) {
      for (const action of useActions) {
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
