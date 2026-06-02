/**
 * actionTools.ts — prepare_action 工具
 *
 * 准备执行动作（导航、预约、日历等），返回待确认的 action 信息。
 */
import type { PendingAction } from "../../../shared/agentResponse.js";
import { randomUUID } from "node:crypto";

export interface PrepareActionInput {
  actionType: string;
  title: string;
  description: string;
  planId?: string;
  optionId?: string;
}

export interface PrepareActionResult {
  action: PendingAction;
  message: string;
}

/**
 * Execute prepare_action: create a pending action for user confirmation.
 */
export function executePrepareAction(input: PrepareActionInput): PrepareActionResult {
  const actionId = randomUUID();
  const action: PendingAction = {
    id: actionId,
    title: input.title,
    description: input.description,
  };

  return {
    action,
    message: `已准备动作「${input.title}」：${input.description}。请用户确认后执行。`,
  };
}

/**
 * OpenAI function definition for prepare_action
 */
export const prepareActionToolDef = {
  type: "function" as const,
  function: {
    name: "prepare_action",
    description: "准备一个待执行的动作（如打开导航、预约餐厅、生成日历事件等），等待用户确认。涉及支付或预约时必须调用此工具。",
    parameters: {
      type: "object",
      properties: {
        actionType: {
          type: "string",
          description: "动作类型，如'navigation'、'reservation'、'calendar'、'share'",
        },
        title: {
          type: "string",
          description: "动作标题，如'打开高德导航到西湖'",
        },
        description: {
          type: "string",
          description: "动作详细描述，如'将为你打开从朝阳区到西湖的驾车导航路线'",
        },
      },
      required: ["actionType", "title", "description"],
    },
  },
};

/**
 * OpenAI function definition for generate_weekend_plan
 * (The actual plan generation is handled by the runtime via orchestrator)
 */
export const generateWeekendPlanToolDef = {
  type: "function" as const,
  function: {
    name: "generate_weekend_plan",
    description: "当已收集足够的出行信息（出发地、预算、人数等）后，调用此工具生成完整的周末行程方案。不要在信息不足时调用。",
    parameters: {
      type: "object",
      properties: {
        city: { type: "string", description: "目的地城市" },
        origin: { type: "string", description: "出发地" },
        destination: { type: "string", description: "具体目的地，如西湖、灵隐寺" },
        budget: { type: "number", description: "预算上限（元）" },
        partySize: { type: "number", description: "出行人数" },
        companions: { type: "string", description: "同行人类型，如 family/friends/couple/solo" },
        preference: { type: "string", description: "偏好描述" },
        preferences: { type: "array", items: { type: "string" }, description: "多个偏好，如 [咖啡厅, 火锅, 午饭]" },
        time: { type: "string", description: "具体时间，如明天上午9点" },
      },
      required: ["city"],
    },
  },
};

