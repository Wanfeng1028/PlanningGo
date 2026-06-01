/**
 * slotTools.ts — update_planning_draft 工具
 *
 * 记录用户补充的规划信息（槽位），返回当前已知信息和缺失信息。
 */
import type { PlanningSlots, PlanningSlotKey } from "../../../shared/agentResponse.js";
import { mergeSlots, getMissingSlots } from "./chatRouter.js";

export interface UpdateDraftInput {
  origin?: string;
  destinationCity?: string;
  budget?: number;
  partySize?: number;
  date?: string;
  timeWindow?: string;
  preference?: string | string[];
  companions?: string;
}

export interface UpdateDraftResult {
  knownSlots: PlanningSlots;
  missingSlots: PlanningSlotKey[];
  isReady: boolean;
  message: string;
}

/**
 * Execute update_planning_draft: merge new slots into existing draft.
 */
export function executeUpdatePlanningDraft(
  currentDraft: PlanningSlots | undefined,
  input: UpdateDraftInput,
): UpdateDraftResult {
  const incoming: PlanningSlots = {};

  if (input.origin) incoming.origin = input.origin;
  if (input.destinationCity) incoming.destinationCity = input.destinationCity;
  if (input.budget) incoming.budget = input.budget;
  if (input.partySize) incoming.partySize = input.partySize;
  if (input.date) incoming.date = input.date;
  if (input.timeWindow) incoming.timeWindow = input.timeWindow;
  if (input.preference) {
    if (Array.isArray(input.preference)) {
      incoming.preference = input.preference;
    } else {
      incoming.preference = [input.preference];
    }
  }
  if (input.companions) incoming.companions = input.companions;

  const merged = mergeSlots(currentDraft ?? {}, incoming);
  const missing = getMissingSlots(merged);

  const isReady = missing.length === 0 && Boolean(merged.origin);

  const messages: string[] = [];
  if (merged.origin) messages.push(`出发地：${merged.origin}`);
  if (merged.destinationCity) messages.push(`目的地：${merged.destinationCity}`);
  if (merged.budget) messages.push(`预算：${merged.budget}元`);
  if (merged.partySize) messages.push(`人数：${merged.partySize}人`);
  if (merged.date) messages.push(`日期：${merged.date}`);
  if (merged.timeWindow) messages.push(`时间：${merged.timeWindow}`);
  if (merged.preference) messages.push(`偏好：${Array.isArray(merged.preference) ? merged.preference.join("、") : merged.preference}`);
  if (merged.companions) messages.push(`同行人：${merged.companions}`);

  return {
    knownSlots: merged,
    missingSlots: missing,
    isReady,
    message: isReady
      ? `信息已收集完整：${messages.join("；")}`
      : `已记录：${messages.join("；")}。还需要：${missing.join("、")}`,
  };
}

/**
 * OpenAI function definition for update_planning_draft
 */
export const updatePlanningDraftToolDef = {
  type: "function" as const,
  function: {
    name: "update_planning_draft",
    description: "记录用户提供的出行规划信息。当用户提到出发地、目的地、预算、人数、日期、偏好等信息时调用此工具。",
    parameters: {
      type: "object",
      properties: {
        origin: { type: "string", description: "出发地，如'朝阳区'、'公司'" },
        destinationCity: { type: "string", description: "目的地城市，如'杭州'、'上海'" },
        budget: { type: "number", description: "预算上限（元），如 500" },
        partySize: { type: "number", description: "出行人数，如 3" },
        date: { type: "string", description: "出行日期，如'本周六'、'6月1日'" },
        timeWindow: { type: "string", description: "时间段，如'下午'、'14:00-18:00'" },
        preference: {
          type: "string",
          description: "出行偏好，如'亲子'、'文艺'、'美食'、'户外'",
        },
        companions: { type: "string", description: "同行人描述，如'带娃'、'情侣'、'朋友'" },
      },
      required: [],
    },
  },
};
