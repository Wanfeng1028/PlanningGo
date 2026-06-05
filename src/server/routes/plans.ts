/**
 * Plans 路由 — GET /api/plans/demo, POST /api/plans/select, POST /api/plans/save
 *
 * V3 核心原则:
 *   - 后端 message payload 是方案数据的唯一可信来源
 *   - 生产环境禁止前端 planData fallback
 *   - 所有 action status 入库前必须 normalize 到 V3 状态
 *   - 统一使用 Action 表（不是 ExecutionAction）
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getSelectedPlanId, saveActions, selectPlan } from "../services/store.js";
import { planOptions } from "../data/mockData.js";
import { NotFoundError } from "../common/errors.js";
import { sendOk } from "../common/response.js";
import { optionalUserId } from "../common/uid.js";
import { normalizeActionStatus } from "../modules/execution/statusNormalizer.js";

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
        poiName: typeof s.poiName === "string" ? s.poiName : (s.poiName as string | null),
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
      provider: (a.provider as string) || "mock",
      status: normalizeActionStatus(a.status as string),
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
  provider: z.string().optional(),
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

    // ── V3: 优先从 DB messages 恢复方案（source of truth）──
    let restored = null;
    if (db && input.conversationId) {
      restored = await restorePlanFromMessages(db, input.conversationId, input.optionId);
    }

    // ── 生产环境: 禁止前端 planData fallback ──
    const isProduction = process.env.NODE_ENV === "production";
    const allowFallback = process.env.ALLOW_CLIENT_PLAN_FALLBACK === "true";

    let usePlanData: typeof input.planData;
    let useActions: typeof input.executableActions;
    let usePlanId: string | undefined;
    let useOptionId: string;

    if (restored) {
      // 恢复成功，用恢复的数据
      usePlanData = restored.planData;
      useActions = restored.executableActions;
      usePlanId = restored.planId;
      useOptionId = restored.optionId;
    } else if (isProduction && !allowFallback) {
      // 生产环境: 恢复失败 + 没有前端 planData → 拒绝
      if (!input.planData) {
        return reply.status(400).send({ error: "无法从后端恢复方案数据，请重新生成方案" });
      }
      // 有前端 planData 但恢复失败 → 仍然拒绝（不信任前端数据）
      return reply.status(400).send({ error: "生产环境不允许使用前端 planData 作为方案数据源" });
    } else {
      // 开发环境或明确允许 fallback → 使用前端数据
      usePlanData = input.planData;
      useActions = input.executableActions;
      usePlanId = input.planId;
      useOptionId = input.optionId;
    }

    if (!db) {
      // Memory fallback (Mock mode / no PostgreSQL): still allow saving executableActions
      // so the execution chain can run end-to-end in demo/tests.
      const memoryPlanId = usePlanId ?? input.conversationId ?? `plan_${Date.now()}`;

      if (useActions && useActions.length > 0) {
        saveActions(useActions.map((a) => ({
          id: a.id,
          planId: memoryPlanId,
          optionId: useOptionId,
          userId,
          type: a.type as any,
          provider: ((a.provider as string) || "mock") as any,
          status: normalizeActionStatus(a.status) as any,
          title: a.title,
          description: a.description,
          confirmationRequired: Boolean(a.confirmationRequired),
          idempotencyKey: a.idempotencyKey || `idem-${a.id}`,
          priceEstimate: a.priceEstimate ?? undefined,
          expiresAt: a.expiresAt ?? undefined,
          payload: (a.payload ?? {}) as Record<string, unknown>,
        })));
      }

      return sendOk(reply, { planId: memoryPlanId, message: "方案已保存（内存模式）" });
    }

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

    // Create Actions (统一使用 Action 表，不是 ExecutionAction)
    if (useActions && useActions.length > 0) {
      for (const action of useActions) {
        await db.action.create({
          data: {
            userId,
            planId: plan.id,
            type: action.type,
            provider: action.provider || "mock",
            status: normalizeActionStatus(action.status),
            confirmationRequired: action.confirmationRequired,
            idempotencyKey: action.idempotencyKey || `idem-${action.id}`,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            payload: (action.payload ?? {}) as any,
          },
        });
      }
    }

    return sendOk(reply, { planId: plan.id, message: "方案已保存" });
  });
}
