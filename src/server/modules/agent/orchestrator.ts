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
import type { PlanningResponse } from "../planning/schemas";

/**
 * 主规划 Pipeline：intent -> context -> candidates -> rank -> plan -> validate -> actions
 *
 * 根据 PLANNING_MODE 环境变量决定使用 mock/llm/hybrid 模式。
 */
export async function runPlanningPipeline(input: PlanningRequest): Promise<
  PlanningResponse & { summary: string; selectedPlanId: string }
> {
  const traceId = createTraceId();
  const planId = createId("plan");
  const mode = env.PLANNING_MODE;

  // 1. 抽取意图
  const intent = await extractIntent(input);

  // 2. 构造上下文
  const context = await buildPlanningContext({ traceId, planId, intent });

  // 3. 生成候选 POI 池
  const candidates = await generateCandidates(context);

  // 4. 排序候选
  const ranked = rankCandidates(intent, candidates);

  // 5. 生成方案
  let options;
  if (mode === "llm") {
    options = await generateLlmPlans({ traceId, planId, intent, context, candidates: ranked });
  } else if (mode === "hybrid") {
    try {
      options = await generateLlmPlans({ traceId, planId, intent, context, candidates: ranked });
    } catch {
      options = generateMockPlans({ traceId, planId, intent, context, candidates: ranked });
    }
  } else {
    options = generateMockPlans({ traceId, planId, intent, context, candidates: ranked });
  }

  // 6. 校验方案
  const validation = validatePlans({ intent, candidates: ranked, options });

  // 7. 生成可执行动作
  const executableActions = createActionsForPlans({ planId, options, intent });

  // 8. 组装响应（兼容旧字段）
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
    // 兼容旧前端
    summary: options[0]?.summary ?? "已生成可执行方案",
    selectedPlanId: options[0]?.id ?? "",
  };
}
