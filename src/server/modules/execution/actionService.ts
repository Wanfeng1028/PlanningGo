import { createId, createIdempotencyKey } from "../../common/id";
import type { ActivityPlan, ExecutionAction, UserIntent } from "../planning/schemas";
import type { PlanningAction } from "../../../shared/agentResponse.js";

/**
 * 为方案生成可执行动作（预约、锁座、日历、分享等）。
 * 所有不可逆动作默认 waiting_confirm，需用户确认后执行。
 * 包含 action guard：缺失必要字段时跳过对应 action，不生成无效动作。
 */
export function createActionsForPlans(input: {
  planId: string;
  options: ActivityPlan[];
  intent: UserIntent;
  userId?: string;
}): ExecutionAction[] {
  const userId = input.userId ?? "anonymous";
  const actions: ExecutionAction[] = [];
  const hasOrigin = !!input.intent.origin?.label;

  for (const option of input.options) {
    for (const step of option.timeline) {
      // Guard: 缺少 poiName 时不生成 "预约 null"
      if (step.bookingNeeded && step.poiName && step.poiName !== "null") {
        actions.push(createBookingAction(input.planId, option.id, step, input.intent, userId));
      }
    }

    // Guard: 缺少 origin 或有效 points 时不生成导航 action
    if (hasOrigin) {
      actions.push(createNavigationAction(input.planId, option.id, option, userId));
    }

    // Guard: 缺少 startTime 时不生成日历 action
    const startTime = option.timeline[0]?.startTime;
    const endTime = option.timeline[option.timeline.length - 1]?.endTime;
    if (startTime && endTime) {
      actions.push(createCalendarAction(input.planId, option.id, option, userId));
    }

    actions.push(createShareAction(input.planId, option.id, option, input.intent, userId));
  }

  return actions;
}

function createBookingAction(
  planId: string,
  optionId: string,
  step: ActivityPlan["timeline"][number],
  intent: UserIntent,
  userId: string,
): ExecutionAction {
  const isMeal = step.type === "meal";
  const type = isMeal ? "restaurant_reservation" : "ticket_lock";
  const poiLabel = step.poiName ?? "待选择";

  return {
    id: createId(isMeal ? "act_restaurant" : "act_ticket"),
    planId,
    optionId,
    userId,
    type,
    status: "waiting_confirm",
    title: isMeal ? `预约 ${poiLabel}` : `锁定 ${poiLabel}`,
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

function createNavigationAction(planId: string, optionId: string, option: ActivityPlan, userId: string): ExecutionAction {
  // Filter out null/empty POI names and deduplicate consecutive identical points
  const points = option.timeline
    .map((step) => step.poiName)
    .filter((name): name is string => !!name && name !== "null");
  const dedupedPoints = points.filter((name, i) => i === 0 || name !== points[i - 1]);

  return {
    id: createId("act_nav"),
    planId,
    optionId,
    userId,
    type: "navigation",
    status: "draft",
    title: "生成导航路线",
    description: `为「${option.title}」生成多点导航。`,
    confirmationRequired: false,
    idempotencyKey: createIdempotencyKey([planId, optionId, "navigation"]),
    payload: {
      points: dedupedPoints.length > 0 ? dedupedPoints : undefined,
    },
  };
}

function createCalendarAction(planId: string, optionId: string, option: ActivityPlan, userId: string): ExecutionAction {
  return {
    id: createId("act_calendar"),
    planId,
    optionId,
    userId,
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
  userId: string,
): ExecutionAction {
  return {
    id: createId("act_share"),
    planId,
    optionId,
    userId,
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
  return [`我让周末去哪儿排了一个方案：${option.title}`, ...lines, "你看可以吗？"].join("\n");
}

// ─── Unified PlanningAction[] Generator ─────────────────────

/**
 * Generate a unified PlanningAction[] array for a plan result.
 * These actions are frontend-renderable action cards (map, navigation, copy, calendar, handoff).
 */
export function createPlanningActions(input: {
  planId: string;
  conversationId?: string;
  options: ActivityPlan[];
  intent: UserIntent;
}): PlanningAction[] {
  const actions: PlanningAction[] = [];
  const firstOption = input.options[0];
  if (!firstOption) return actions;

  // Derive destination and city from intent
  const destination = input.intent.city || "目的地";
  const city = input.intent.city;

  // 1. map_search — open map to search the destination/POIs
  actions.push({
    type: "map_search",
    label: `打开高德搜索${destination}`,
    provider: "amap",
    query: destination,
    city,
  });

  // 2. navigation — navigate to the first POI
  // Guard: require both a valid POI AND a valid origin; skip if origin is missing
  const firstPOI = firstOption.timeline.find((step) => step.poiName && step.poiName !== "null" && step.poiName !== "未知出发地")?.poiName;
  const originLabel = input.intent.origin?.label;
  if (firstPOI && firstPOI !== originLabel && originLabel) {
    actions.push({
      type: "navigation",
      label: `导航到${firstPOI}`,
      provider: "amap",
      origin: originLabel,
      destination: firstPOI,
    });
  }

  // 3. copy_text — copy the full plan text
  const shareText = buildShareText(firstOption);
  actions.push({
    type: "copy_text",
    label: "复制完整行程",
    text: shareText,
  });

  // 4. calendar — generate a calendar event for the plan
  // Guard: only generate if we have valid start/end times
  const startTime = firstOption.timeline[0]?.startTime;
  const endTime = firstOption.timeline[firstOption.timeline.length - 1]?.endTime;
  if (startTime && endTime && startTime !== "undefined" && endTime !== "undefined") {
    actions.push({
      type: "calendar",
      label: "生成日程",
      title: firstOption.title,
      startTime,
      endTime,
    });
  }

  // 5. mobile_handoff — QR code to continue on mobile
  if (input.conversationId) {
    actions.push({
      type: "mobile_handoff",
      label: "手机继续查看",
      conversationId: input.conversationId,
      planId: input.planId,
    });
  }

  return actions;
}
