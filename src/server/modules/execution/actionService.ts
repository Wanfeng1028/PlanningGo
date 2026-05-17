import { createId, createIdempotencyKey } from "../../common/id";
import type { ActivityPlan, ExecutionAction, UserIntent } from "../planning/schemas";

/**
 * 为方案生成可执行动作（预约、锁座、日历、分享等）。
 * 所有不可逆动作默认 waiting_confirm，需用户确认后执行。
 */
export function createActionsForPlans(input: {
  planId: string;
  options: ActivityPlan[];
  intent: UserIntent;
}): ExecutionAction[] {
  const actions: ExecutionAction[] = [];

  for (const option of input.options) {
    for (const step of option.timeline) {
      if (step.bookingNeeded) {
        actions.push(createBookingAction(input.planId, option.id, step, input.intent));
      }
    }

    actions.push(createNavigationAction(input.planId, option.id, option));
    actions.push(createCalendarAction(input.planId, option.id, option));
    actions.push(createShareAction(input.planId, option.id, option, input.intent));
  }

  return actions;
}

function createBookingAction(
  planId: string,
  optionId: string,
  step: ActivityPlan["timeline"][number],
  intent: UserIntent,
): ExecutionAction {
  const isMeal = step.type === "meal";
  const type = isMeal ? "restaurant_reservation" : "ticket_lock";

  return {
    id: createId(isMeal ? "act_restaurant" : "act_ticket"),
    planId,
    optionId,
    type,
    status: "waiting_confirm",
    title: isMeal ? `预约 ${step.poiName}` : `锁定 ${step.poiName}`,
    description: isMeal
      ? `${step.startTime} 为 ${intent.partySize} 人预约，提交前需要你确认。`
      : `${step.startTime} 场次先锁定库存，不自动付款。`,
    confirmationRequired: true,
    idempotencyKey: createIdempotencyKey([planId, optionId, step.poiId, type]),
    priceEstimate: isMeal ? "到店点餐" : `约 ￥${intent.partySize * 49}`,
    expiresAt: isMeal ? undefined : new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    payload: {
      poiId: step.poiId,
      poiName: step.poiName,
      startTime: step.startTime,
      partySize: intent.partySize,
    },
  };
}

function createNavigationAction(planId: string, optionId: string, option: ActivityPlan): ExecutionAction {
  return {
    id: createId("act_nav"),
    planId,
    optionId,
    type: "navigation",
    status: "draft",
    title: "生成导航路线",
    description: `为「${option.title}」生成多点导航。`,
    confirmationRequired: false,
    idempotencyKey: createIdempotencyKey([planId, optionId, "navigation"]),
    payload: {
      points: option.timeline.filter((step) => step.poiName).map((step) => step.poiName),
    },
  };
}

function createCalendarAction(planId: string, optionId: string, option: ActivityPlan): ExecutionAction {
  return {
    id: createId("act_calendar"),
    planId,
    optionId,
    type: "calendar_event",
    status: "waiting_confirm",
    title: "写入日历提醒",
    description: `把「${option.title}」写入日历，并在出发前提醒。`,
    confirmationRequired: true,
    idempotencyKey: createIdempotencyKey([planId, optionId, "calendar"]),
    payload: {
      title: option.title,
      startTime: option.timeline[0]?.startTime,
      endTime: option.timeline[option.timeline.length - 1]?.endTime,
    },
  };
}

function createShareAction(
  planId: string,
  optionId: string,
  option: ActivityPlan,
  intent: UserIntent,
): ExecutionAction {
  return {
    id: createId("act_share"),
    planId,
    optionId,
    type: "share_message",
    status: "waiting_confirm",
    title: intent.participantMode === "friends" ? "发给朋友投票" : "发给家人确认",
    description: `生成「${option.title}」的简版行程卡，发送前需要确认。`,
    confirmationRequired: true,
    idempotencyKey: createIdempotencyKey([planId, optionId, "share"]),
    payload: {
      text: buildShareText(option),
    },
  };
}

function buildShareText(option: ActivityPlan): string {
  const lines = option.timeline.map((step) => `${step.startTime}-${step.endTime} ${step.title}`);
  return [`我让周末有谱排了一个方案：${option.title}`, ...lines, "你看可以吗？"].join("\n");
}
