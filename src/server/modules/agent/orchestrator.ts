import type { PlanningRequest } from "../../types";
import { env } from "../../config/env";
import { createTraceId, createId } from "../../common/id";
import { extractIntent } from "./intent";
import { buildPlanningContext } from "../planning/contextBuilder";
import { generateCandidates } from "../planning/candidateGenerator";
import { rankCandidates } from "../planning/ranking";
import { generateMockPlans, generateLlmPlans } from "./planner";
import { validatePlans } from "../planning/validator";
import { repairPlans } from "../planning/repairer";
import { createActionsForPlans } from "../execution/actionService";
import { buildServiceActionsForPlan } from "../execution/serviceActionBuilder.js";
import { scoreAndFilterCandidates } from "../planning/poiScorer";
import { enrichPlanWithPoiDetails } from "../planning/poiEnricher";
import { calculateRouteTimes } from "../planning/routeCalculator";
import { generateSuggestions } from "../suggestions/suggestionEngine";
import { getAmapClient } from "../tools/amap/client";
import type { AmapClient } from "../tools/amap/client";
import type { PlanningResponse, PlanningProviders } from "../planning/schemas";

/**
 * 进度回调接口 — 用于真流式 SSE 分阶段推送
 */
export interface PlanningProgressCallback {
  onStatus: (status: string) => void;
  onCandidates: (data: { activities: number; restaurants: number; cafes: number; events: number }) => void;
  onPartialPlan: (data: { title: string; stepsCount: number }) => void;
  onActions: (data: { count: number }) => void;
}

/**
 * 主规划 Pipeline：intent -> context -> candidates -> score -> plan -> enrich -> route -> validate -> suggestions -> actions
 *
 * 根据 PLANNING_MODE 环境变量决定使用 mock/llm/hybrid 模式。
 * V4: 支持 progress 回调实现真流式 SSE
 */
export async function runPlanningPipeline(
  input: PlanningRequest & { modelMode?: "flash" | "pro"; providers?: PlanningProviders; userId?: string; progress?: PlanningProgressCallback; signal?: AbortSignal },
): Promise<PlanningResponse & { summary: string; selectedPlanId: string; suggestions?: ReturnType<typeof generateSuggestions> }> {
  const traceId = createTraceId();
  const planId = createId("plan");
  const mode = env.PLANNING_MODE;
  const progress = input.progress;
  const signal = input.signal ? AbortSignal.any([input.signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000);

  // 1. 抽取意图
  progress?.onStatus("正在理解你的需求...");
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
  progress?.onStatus("正在分析出行条件...");

  // Guard: if required slots are missing, refuse to plan
  if (intent.mustAsk && intent.mustAsk.length > 0) {
    throw new Error(`MISSING_REQUIRED_SLOTS:${intent.mustAsk.join(",")}`);
  }
  const context = await buildPlanningContext({ traceId, planId, intent, providers: input.providers, userId: input.userId });

  // 3. 生成候选 POI 池（通过 providers.map 获取真实数据）
  progress?.onStatus(`正在搜索${intent.city || "目的地"}附近的景点、餐厅和咖啡店...`);
  const candidates = await generateCandidates(context, signal);

  // V4: 推送候选 POI 数量
  progress?.onCandidates({
    activities: candidates.activities.length,
    restaurants: candidates.restaurants.length,
    cafes: candidates.cafes.length,
    events: candidates.events.length,
  });

  // 4. 评分过滤候选（fallback to rankCandidates if scoring produces empty results）
  const scoredCandidates = scoreAndFilterCandidates(candidates, intent);
  const effectiveCandidates =
    scoredCandidates.activities.length === 0 &&
    scoredCandidates.restaurants.length === 0 &&
    scoredCandidates.events.length === 0
      ? rankCandidates(intent, candidates)
      : scoredCandidates;

  // 5. 生成方案
  progress?.onStatus("正在规划行程方案...");
  const plannerInput = { traceId, planId, intent, context, candidates: effectiveCandidates, providers: input.providers, signal };
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
  progress?.onStatus("正在补全店铺详情和推荐...");
  const enrichedOptions = enrichPlanWithPoiDetails(options, effectiveCandidates);

  // 7. 计算路线交通时间
  progress?.onStatus("正在计算路线和交通时间...");
  const routedOptions = await calculateRouteTimes(enrichedOptions, effectiveCandidates, input.providers?.map ? getAmapClientIfAvailable(input.providers.map) : undefined, signal);

  // 7.5. 程序化修复硬约束：时间窗、完整链路、无座/无票、预算等
  progress?.onStatus("正在校验并修复约束...");
  const repairedOptions = repairPlans({ intent, candidates: effectiveCandidates, options: routedOptions });

  // 7.6. 为每个方案生成 serviceActions（外部服务入口）
  const serviceEnhancedOptions = repairedOptions.map((option) => {
    const result = buildServiceActionsForPlan(option);
    // 将 serviceActions 挂载到每个 timeline step 上
    return {
      ...option,
      timeline: result.timeline,
    };
  });

  // 8. 校验修复后的方案
  const validation = validatePlans({ intent, candidates: effectiveCandidates, options: serviceEnhancedOptions });

  // 9. 为最优方案生成推荐（静态推理 + 真实 POI 增强）
  progress?.onStatus("正在生成周边推荐...");
  const bestPlan = serviceEnhancedOptions[0];
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
    // V4: 先返回静态推荐，真实 POI 增强放后台（懒加载优化）
    suggestions = staticSuggestions;
    // 后台异步增强（不阻塞首屏返回）
    if (input.providers?.map) {
      import("../suggestions/suggestionEngine.js").then(async ({ enrichSuggestionsWithPoi }) => {
        try {
          suggestions = await enrichSuggestionsWithPoi(staticSuggestions, getAmapClientIfAvailable(input.providers?.map), intent.city);
        } catch {
          // 增强失败不影响主流程
        }
      }).catch(() => {});
    }
  }

  // 10. 生成可执行动作（绑定 userId）
  progress?.onStatus("正在生成预约、导航和打车动作...");
  const executableActions = createActionsForPlans({ planId, options: serviceEnhancedOptions, intent, userId: input.userId });

  // V4: 推送动作数量
  progress?.onActions({ count: executableActions.length });

  // V4: 推送方案骨架
  if (serviceEnhancedOptions[0]) {
    progress?.onPartialPlan({
      title: serviceEnhancedOptions[0].title,
      stepsCount: serviceEnhancedOptions[0].timeline.length,
    });
  }

  // Client disconnect now aborts pipeline via AbortSignal threaded through:
  // generateCandidates → amap API, generateLlmPlans → LLM client,
  // calculateRouteTimes → amap API

  // 10.5 画像沉淀：方案生成后异步更新用户画像
  if (input.userId && serviceEnhancedOptions[0]) {
    try {
      const { syncProfileToDb } = await import("./memoryExtractor.js");
      await syncProfileToDb(input.userId, serviceEnhancedOptions[0], intent);
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
    options: serviceEnhancedOptions,
    selectedOptionId: serviceEnhancedOptions[0]?.id,
    validation,
    executableActions,
    toolLogs: [],
    nextActions: ["选择方案", "查看风险", "确认预约", "写入日历", "分享给同行人"],
    summary: serviceEnhancedOptions[0]?.summary ?? "已生成可执行方案",
    selectedPlanId: serviceEnhancedOptions[0]?.id ?? "",
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
