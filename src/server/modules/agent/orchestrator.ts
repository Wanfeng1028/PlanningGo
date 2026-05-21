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
import type { PlanningResponse, PlanningProviders } from "../planning/schemas";

/**
 * 主规划 Pipeline：intent -> context -> candidates -> rank -> plan -> validate -> actions
 *
 * 根据 PLANNING_MODE 环境变量决定使用 mock/llm/hybrid 模式。
 */
export async function runPlanningPipeline(
  input: PlanningRequest & { modelMode?: "flash" | "pro"; providers?: PlanningProviders; userId?: string },
): Promise<PlanningResponse & { summary: string; selectedPlanId: string }> {
  const traceId = createTraceId();
  const planId = createId("plan");
  const mode = env.PLANNING_MODE;

  // 1. 抽取意图
  const intent = await extractIntent(input);

  // 2. 构造上下文（注入 providers）
  const context = await buildPlanningContext({ traceId, planId, intent, providers: input.providers });

  // 3. 生成候选 POI 池（通过 providers.map 获取真实数据）
  const candidates = await generateCandidates(context);

  // 4. 排序候选
  const ranked = rankCandidates(intent, candidates);

  // 5. 生成方案
  const plannerInput = { traceId, planId, intent, context, candidates: ranked, providers: input.providers };
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

  // 6. 校验方案
  const validation = validatePlans({ intent, candidates: ranked, options });

  // 7. 生成可执行动作（绑定 userId）
  const executableActions = createActionsForPlans({ planId, options, intent, userId: input.userId });

  // 8. 组装响应
  return {
    traceId,
    planId,
    mode,
    intent,
    options,
    selectedOptionId: options[0]?.id,
    validation,
    executableActions,
    toolLogs: [],
    nextActions: ["选择方案", "查看风险", "确认预约", "写入日历", "分享给同行人"],
    summary: options[0]?.summary ?? "已生成可执行方案",
    selectedPlanId: options[0]?.id ?? "",
  } as PlanningResponse & { summary: string; selectedPlanId: string };
}

function shouldFallbackToMock(error: unknown): boolean {
  if (!env.ENABLE_LLM_FALLBACK) return false;
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return message.includes("timeout") || message.includes("超时") || message.includes("timed out");
}
