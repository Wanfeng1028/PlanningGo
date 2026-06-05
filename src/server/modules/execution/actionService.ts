import { createId, createIdempotencyKey } from "../../common/id";
import type { ActivityPlan, ExecutionAction, UserIntent } from "../planning/schemas";
import type { PlanningAction } from "../../../shared/agentResponse.js";
import { buildNavigationUrl } from "../maps/navigationLinks.js";

/**
 * 为方案生成可执行动作（预约、锁座、日历、分享等）。
 * 所有不可逆动作默认 waiting_confirm，需用户确认后执行。
 * 包含 action guard：缺失必要字段时跳过对应 action，不生成无效动作。
 * V4: 新增咖啡下单草稿、餐厅预约草稿、打车深链、美团/大众点评搜索、电话预约等动作。
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

      // V4: 咖啡下单草稿 — buffer/rest 步骤且有咖啡店 POI
      if ((step.type === "buffer" || step.type === "rest") && step.poiName && step.poiName !== "null") {
        actions.push(createCoffeeOrderDraft(input.planId, option.id, step, userId));
      }

      // V4: 餐厅预约草稿 — meal 步骤且有具体餐厅
      if (step.type === "meal" && step.poiName && step.poiName !== "null") {
        actions.push(createRestaurantReservationDraft(input.planId, option.id, step, input.intent, userId));

        // V4: 美团搜索 — 所有 meal 步骤
        actions.push(createMeituanSearchAction(input.planId, option.id, step, userId));

        // V4: 大众点评搜索 — 所有 meal 步骤
        actions.push(createDianpingSearchAction(input.planId, option.id, step, userId));

        // V4: 电话预约 — 如果有电话号码
        if ((step as Record<string, unknown>).tel) {
          actions.push(createCallRestaurantAction(input.planId, option.id, step, userId));
        }
      }

      // V4: 打车深链 — travel/return 步骤
      if ((step.type === "travel" || step.type === "return") && step.poiName && step.poiName !== "null") {
        actions.push(createTaxiDeeplinkAction(input.planId, option.id, step, userId));
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

  // 去重：同类型 + 同 POI 的 action 只保留一个
  const seen = new Set<string>();
  return actions.filter((a) => {
    const key = `${a.type}:${(a.payload as Record<string, unknown>)?.poiName ?? ""}:${a.optionId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
    provider: isMeal ? "meituan" : "mock",
    status: "waiting_user_confirm",
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
      recovery: buildRecovery(step, isMeal ? "no_seat" : "no_ticket"),
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
    provider: "open",
    status: "proposed",
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
    provider: "calendar",
    status: "waiting_user_confirm",
    title: "写入日历提醒",
    description: `把「${option.title}」写入日历，并在出发前提醒。`,
    confirmationRequired: true,
    idempotencyKey: createIdempotencyKey([planId, optionId, "calendar"]),
    payload: {
      title: option.title,
      startTime: option.timeline[0]?.startTime,
      endTime: option.timeline[option.timeline.length - 1]?.endTime,
      // V3: 携带完整 timeline 供 Calendar Connector 生成多 VEVENT
      timeline: option.timeline.map((step) => ({
        id: step.id,
        title: step.title,
        startTime: step.startTime,
        endTime: step.endTime,
        poiName: step.poiName,
        type: step.type,
      })),
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
    provider: "mock",
    status: "waiting_user_confirm",
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

// ─── V4: New Action Creators ─────────────────────────────

/** 咖啡下单草稿 — "已帮你准备好，点击去第三方确认下单" */
function createCoffeeOrderDraft(
  planId: string,
  optionId: string,
  step: ActivityPlan["timeline"][number],
  userId: string,
): ExecutionAction {
  const poiLabel = step.poiName ?? "咖啡店";
  const items = step.recommendedItems?.length ? step.recommendedItems.join("、") : "看看菜单选一杯";

  return {
    id: createId("act_coffee"),
    planId,
    optionId,
    userId,
    type: "coffee_order_draft",
    provider: "meituan_order",
    status: "waiting_user_confirm",
    title: `去${poiLabel}点杯咖啡`,
    description: `推荐：${items}${step.estimatedCost ? `，${step.estimatedCost}` : ""}。点击打开下单页面确认。`,
    confirmationRequired: true,
    idempotencyKey: createIdempotencyKey([planId, optionId, step.poiId, "coffee_order_draft"]),
    priceEstimate: step.estimatedCost,
    payload: {
      poiId: step.poiId,
      poiName: step.poiName,
      startTime: step.startTime,
      recommendedItems: step.recommendedItems ?? [],
      deepLink: (step as Record<string, unknown>).deepLink ?? undefined,
    },
  };
}

/** 餐厅预约草稿 — 包含推荐菜品、预约方式 */
function createRestaurantReservationDraft(
  planId: string,
  optionId: string,
  step: ActivityPlan["timeline"][number],
  intent: UserIntent,
  userId: string,
): ExecutionAction {
  const poiLabel = step.poiName ?? "餐厅";
  const items = step.recommendedItems?.length ? `推荐菜品：${step.recommendedItems.join("、")}` : "";

  return {
    id: createId("act_reserve_draft"),
    planId,
    optionId,
    userId,
    type: "restaurant_reservation_draft",
    provider: "meituan",
    status: "waiting_user_confirm",
    title: `预约${poiLabel} ${intent.partySize}人餐位`,
    description: `${step.startTime} ${intent.partySize}人用餐。${items}${step.bookingAdvice ? ` ${step.bookingAdvice}` : ""}`,
    confirmationRequired: true,
    idempotencyKey: createIdempotencyKey([planId, optionId, step.poiId, "restaurant_reservation_draft"]),
    priceEstimate: step.estimatedCost,
    payload: {
      poiId: step.poiId,
      poiName: step.poiName,
      startTime: step.startTime,
      partySize: intent.partySize,
      recommendedItems: step.recommendedItems ?? [],
      bookingAdvice: step.bookingAdvice,
      queueRisk: step.queueRisk,
      recovery: buildRecovery(step, "no_seat"),
    },
  };
}

function buildRecovery(step: ActivityPlan["timeline"][number], type: "no_seat" | "no_ticket" | "conflict") {
  const highRisk = step.queueRisk === "high" || /无座|无票|售罄|冲突|排队/.test(
    [step.bookingHint, step.bookingAdvice, ...(step.suggestions ?? []), ...(step.fallbackPois ?? [])].filter(Boolean).join(" "),
  );
  if (!highRisk && type !== "conflict") return undefined;

  const reason = type === "no_seat"
    ? `${step.poiName ?? step.title} 可能无座或排队较久`
    : type === "no_ticket"
      ? `${step.poiName ?? step.title} 可能无票或库存不足`
      : `${step.title} 存在时间冲突`;
  return {
    type,
    reason,
    alternatives: step.fallbackPois ?? [],
    actions: type === "no_seat"
      ? ["改选备选餐厅", "调整到错峰时间", "打开第三方平台确认"]
      : type === "no_ticket"
        ? ["切换室内备选", "改到其他时段", "打开第三方平台确认"]
        : ["插入缓冲", "压缩低优先级活动", "重新生成方案"],
  };
}

/** 打车/导航入口 — 默认打开当前可用的开源地图导航 */
function createTaxiDeeplinkAction(
  planId: string,
  optionId: string,
  step: ActivityPlan["timeline"][number],
  userId: string,
): ExecutionAction {
  const destLabel = step.poiName ?? "目的地";

  return {
    id: createId("act_taxi"),
    planId,
    optionId,
    userId,
    type: "open_taxi_deeplink",
    provider: "open",
    status: "proposed",
    title: `打车去${destLabel}`,
    description: `打开地图导航，一键规划前往${destLabel}。${step.estimatedCost ? `预估${step.estimatedCost}` : ""}`,
    confirmationRequired: false,
    idempotencyKey: createIdempotencyKey([planId, optionId, step.poiId, "taxi_deeplink"]),
    priceEstimate: step.estimatedCost,
    payload: {
      poiName: step.poiName,
      lat: step.lat,
      lng: step.lng,
      address: step.address,
      transport: step.transport,
    },
  };
}

/** 美团搜索 — 打开美团查看店铺详情 */
function createMeituanSearchAction(
  planId: string,
  optionId: string,
  step: ActivityPlan["timeline"][number],
  userId: string,
): ExecutionAction {
  const poiLabel = step.poiName ?? "餐厅";

  return {
    id: createId("act_meituan"),
    planId,
    optionId,
    userId,
    type: "open_meituan_search",
    provider: "meituan",
    status: "proposed",
    title: `美团查看${poiLabel}`,
    description: `打开美团搜索${poiLabel}，查看菜单、评价和优惠。`,
    confirmationRequired: false,
    idempotencyKey: createIdempotencyKey([planId, optionId, step.poiId, "meituan_search"]),
    payload: {
      poiName: step.poiName,
      keyword: poiLabel,
    },
  };
}

/** 大众点评搜索 — 打开大众点评查看店铺 */
function createDianpingSearchAction(
  planId: string,
  optionId: string,
  step: ActivityPlan["timeline"][number],
  userId: string,
): ExecutionAction {
  const poiLabel = step.poiName ?? "餐厅";

  return {
    id: createId("act_dianping"),
    planId,
    optionId,
    userId,
    type: "open_dianping_search",
    provider: "dianping",
    status: "proposed",
    title: `大众点评查看${poiLabel}`,
    description: `打开大众点评搜索${poiLabel}，查看详细评价和推荐菜品。`,
    confirmationRequired: false,
    idempotencyKey: createIdempotencyKey([planId, optionId, step.poiId, "dianping_search"]),
    payload: {
      poiName: step.poiName,
      keyword: poiLabel,
    },
  };
}

/** 电话预约餐厅 — 直接拨打餐厅电话 */
function createCallRestaurantAction(
  planId: string,
  optionId: string,
  step: ActivityPlan["timeline"][number],
  userId: string,
): ExecutionAction {
  const poiLabel = step.poiName ?? "餐厅";
  const tel = (step as Record<string, unknown>).tel as string | undefined;

  return {
    id: createId("act_call"),
    planId,
    optionId,
    userId,
    type: "call_restaurant",
    provider: "mock",
    status: "proposed",
    title: tel ? `拨打${poiLabel}电话` : `查看${poiLabel}电话`,
    description: tel ? `点击拨打${tel}预约餐位。` : `查看${poiLabel}联系方式并电话预约。`,
    confirmationRequired: false,
    idempotencyKey: createIdempotencyKey([planId, optionId, step.poiId, "call_restaurant"]),
    payload: {
      poiName: step.poiName,
      tel: tel ?? "",
    },
  };
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
    label: `打开地图搜索${destination}`,
    provider: "open",
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
      provider: "open",
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

  // V4: 从方案 timeline 中提取深链动作
  for (const step of firstOption.timeline) {
    if (!step.poiName || step.poiName === "null") continue;

    // 咖啡店步骤 — 添加下单深链
    if ((step.type === "buffer" || step.type === "rest") && step.recommendedItems?.length) {
      actions.push({
        type: "open_url",
        label: `去${step.poiName}点杯${step.recommendedItems[0] ?? "咖啡"}`,
        provider: "meituan_order",
        url: `https://waimai.meituan.com/search?q=${encodeURIComponent(step.poiName)}`,
      });
    }

    // 餐厅步骤 — 添加美团/大众点评深链
    if (step.type === "meal") {
      actions.push({
        type: "open_url",
        label: `美团查看${step.poiName}`,
        provider: "meituan",
        url: `https://www.meituan.com/search?q=${encodeURIComponent(step.poiName)}`,
      });
      actions.push({
        type: "open_url",
        label: `大众点评查看${step.poiName}`,
        provider: "dianping",
        url: `https://www.dianping.com/search?keyword=${encodeURIComponent(step.poiName)}`,
      });
    }

    // 出行步骤 — 添加打车深链
    if ((step.type === "travel" || step.type === "return") && step.transport === "taxi") {
      actions.push({
        type: "open_url",
        label: `打车去${step.poiName}`,
        provider: "open",
        url: buildNavigationUrl({ provider: "open", destination: step.poiName }),
      });
    }
  }

  return actions;
}
