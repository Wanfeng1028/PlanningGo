import type { PlanningRequest } from "../../types";
import { env } from "../../config/env";
import { createTraceId, createId } from "../../common/id";
import { extractIntent } from "./intent";
import { buildPlanningContext } from "../planning/contextBuilder";
import { generateCandidates } from "../planning/candidateGenerator";
import { rankCandidates } from "../planning/ranking";
import { generateMockPlans, generateLlmPlans } from "./planner";
import { validatePlans } from "../planning/validator";
import { createActionsForPlans } from "../execution/actionService";
import { scoreAndFilterCandidates } from "../planning/poiScorer";
import { enrichPlanWithPoiDetails } from "../planning/poiEnricher";
import { calculateRouteTimes } from "../planning/routeCalculator";
import { generateSuggestions } from "../suggestions/suggestionEngine";
import { getAmapClient } from "../tools/amap/client";
import type { AmapClient } from "../tools/amap/client";
import type { PlanningResponse, PlanningProviders } from "../planning/schemas";

/**
 * 主规划 Pipeline：intent -> context -> candidates -> score -> plan -> enrich -> route -> validate -> suggestions -> actions
 *
 * 根据 PLANNING_MODE 环境变量决定使用 mock/llm/hybrid 模式。
 */
export async function runPlanningPipeline(
  input: PlanningRequest & { modelMode?: "flash" | "pro"; providers?: PlanningProviders; userId?: string },
): Promise<PlanningResponse & { summary: string; selectedPlanId: string; suggestions?: ReturnType<typeof generateSuggestions> }> {
  const traceId = createTraceId();
  const planId = createId("plan");
  const mode = env.PLANNING_MODE;

  // 1. 抽取意图
  const intent = await extractIntent(input);

  // 非规划请求（问候、闲聊等）：跳过方案生成，直接返回对话回复
  if (!intent.isPlanningRequest) {
    const chatSummary = `你好！我是出行规划助手，请告诉我你想去哪里、和谁一起、预算多少，我来帮你规划。`;
    return {
      traceId,
      planId,
      mode,
      intent,
      options: [],
      selectedOptionId: undefined,
      validation: { status: "pass" as const, score: 100, blockingErrors: [], warnings: [], repairHints: [] },
      executableActions: [],
      toolLogs: [],
      nextActions: [],
      summary: chatSummary,
      selectedPlanId: "",
      responseType: "chat" as const,
    };
  }

  // 2. 构造上下文（注入 providers）

  // Guard: if required slots are missing, refuse to plan
  if (intent.mustAsk && intent.mustAsk.length > 0) {
    throw new Error(`MISSING_REQUIRED_SLOTS:${intent.mustAsk.join(",")}`);
  }
  const context = await buildPlanningContext({ traceId, planId, intent, providers: input.providers, userId: input.userId });

  // 3. 生成候选 POI 池（通过 providers.map 获取真实数据）
  const candidates = await generateCandidates(context);

  // 4. 评分过滤候选（fallback to rankCandidates if scoring produces empty results）
  const scoredCandidates = scoreAndFilterCandidates(candidates, intent);
  const effectiveCandidates =
    scoredCandidates.activities.length === 0 &&
    scoredCandidates.restaurants.length === 0 &&
    scoredCandidates.events.length === 0
      ? rankCandidates(intent, candidates)
      : scoredCandidates;

  // 5. 生成方案
  const plannerInput = { traceId, planId, intent, context, candidates: effectiveCandidates, providers: input.providers };
  let options;

  if (mode === "llm") {
    try {
      options = await generateLlmPlans(plannerInput);
    } catch (error) {
      if (shouldFallbackToMock(error)) {
        options = generateMockPlans(plannerInput);
      } else {
        throw error;
      }
    }
  } else if (mode === "hybrid") {
    try {
      options = await generateLlmPlans(plannerInput);
    } catch (error) {
      console.warn(`[orchestrator] LLM 生成失败，fallback 到 mock: ${error instanceof Error ? error.message : String(error)}`);
      options = generateMockPlans(plannerInput);
    }
  } else {
    options = generateMockPlans(plannerInput);
  }

  // 6. 补全 POI 详情
  const enrichedOptions = enrichPlanWithPoiDetails(options, effectiveCandidates);

  // 7. 计算路线交通时间
  const routedOptions = await calculateRouteTimes(enrichedOptions, effectiveCandidates, input.providers?.map ? getAmapClientIfAvailable(input.providers.map) : undefined);

  // 8. 校验方案
  const validation = validatePlans({ intent, candidates: effectiveCandidates, options: routedOptions });

  // 9. 为最优方案生成推荐（静态推理 + 真实 POI 增强）
  const bestPlan = routedOptions[0];
  let suggestions: ReturnType<typeof generateSuggestions> | undefined;
  if (bestPlan) {
    const staticSuggestions = generateSuggestions({
      steps: bestPlan.timeline.map((step) => ({
        type: step.type,
        title: step.title,
        poiName: step.poiName ?? null,
        startTime: step.startTime,
        endTime: step.endTime,
      })),
      participantMode: intent.participantMode,
      city: intent.city,
    });
    // Enrich with real POI data if Amap is available
    try {
      const { enrichSuggestionsWithPoi } = await import("../suggestions/suggestionEngine.js");
      suggestions = await enrichSuggestionsWithPoi(staticSuggestions, getAmapClientIfAvailable(input.providers?.map), intent.city);
    } catch {
      suggestions = staticSuggestions;
    }
  }

  // 10. 生成可执行动作（绑定 userId）
  const executableActions = createActionsForPlans({ planId, options: routedOptions, intent, userId: input.userId });

  // 10.5 画像沉淀：方案生成后异步更新用户画像
  if (input.userId && routedOptions[0]) {
    try {
      const { syncProfileToDb } = await import("./memoryExtractor.js");
      await syncProfileToDb(input.userId, routedOptions[0], intent);
    } catch (err) {
      console.warn("[orchestrator] Profile sync failed:", err instanceof Error ? err.message : err);
    }
  }

  // 11. 组装响应
  return {
    traceId,
    planId,
    mode,
    intent,
    options: routedOptions,
    selectedOptionId: routedOptions[0]?.id,
    validation,
    executableActions,
    toolLogs: [],
    nextActions: ["选择方案", "查看风险", "确认预约", "写入日历", "分享给同行人"],
    summary: routedOptions[0]?.summary ?? "已生成可执行方案",
    selectedPlanId: routedOptions[0]?.id ?? "",
    suggestions,
  } as PlanningResponse & { summary: string; selectedPlanId: string; suggestions?: ReturnType<typeof generateSuggestions> };
}

function shouldFallbackToMock(error: unknown): boolean {
  if (!env.ENABLE_LLM_FALLBACK) return false;
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return message.includes("timeout") || message.includes("超时") || message.includes("timed out");
}

function getAmapClientIfAvailable(_mapProvider: unknown): AmapClient | undefined {
  try {
    const client = getAmapClient();
    return client.isConfigured() ? client : undefined;
  } catch {
    return undefined;
  }
}
