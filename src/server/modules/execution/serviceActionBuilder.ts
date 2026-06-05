/**
 * Service Action Builder — 根据 timeline step 自动生成服务入口
 *
 * 核心规则：
 * 1. 不写"预约成功""下单成功""支付成功"
 * 2. 只写"已生成下单草稿""已为你整理好预约信息""请前往平台确认"
 * 3. 所有 action 状态只能是 prepared / redirect_required / redirected_to_payment / waiting_external_confirm
 * 4. 所有用户可点击入口必须有反馈（toast / modal / 跳转 / 复制成功或错误提示）
 * 5. 真实 API 后续接入时，只替换 connector，不大改前端和业务流程
 */

import { createId } from "../../common/id.js";
import { generateDeepLink } from "../tools/deepLinks.js";
import type { TimelineStep } from "../planning/schemas.js";
import type { ServiceActionDraft } from "../connectors/types.js";

// ============================================================================
// Risk notice — 统一风险提示文案
// ============================================================================

const RISK_NOTICE = "价格、库存、配送费、优惠券和预约结果以第三方平台最终页面为准。";

// ============================================================================
// Action type → provider mapping
// ============================================================================

function mapActionTypeToProvider(actionType: string): ServiceActionDraft["provider"] {
  switch (actionType) {
    case "restaurant_reservation":
    case "group_buy":
      return "meituan";
    case "coffee_order":
    case "food_delivery":
      return "eleme";
    case "movie_ticket":
      return "dianping";
    case "navigation":
      return "open";
    case "calendar_event":
      return "calendar";
    case "copy_booking_info":
      return "mock";
    default:
      return "mock";
  }
}

// ============================================================================
// Step type → action rules
// ============================================================================

interface StepActionRule {
  actionType: ServiceActionDraft["actionType"];
  title: string;
  description: string;
  userConfirmText: string;
  hasRedirectUrl?: boolean;
  hasCopyText?: boolean;
}

const MEAL_RULES: StepActionRule[] = [
  {
    actionType: "restaurant_reservation",
    title: "查看美团",
    description: "查看该餐厅在美团上的团购、排队和预约信息",
    userConfirmText: "去美团确认",
    hasRedirectUrl: true,
  },
  {
    actionType: "group_buy",
    title: "去大众点评看看",
    description: "查看该餐厅在大众点评上的评分、团购和排队情况",
    userConfirmText: "去点评看看",
    hasRedirectUrl: true,
  },
  {
    actionType: "copy_booking_info",
    title: "复制预约信息",
    description: "复制餐厅名称、地址、电话等信息，方便你手动预约",
    userConfirmText: "复制信息",
    hasCopyText: true,
  },
];

const COFFEE_RULES: StepActionRule[] = [
  {
    actionType: "coffee_order",
    title: "查看附近咖啡/奶茶",
    description: "查看附近咖啡和奶茶店的优惠和排队情况",
    userConfirmText: "去查看",
    hasRedirectUrl: true,
  },
  {
    actionType: "food_delivery",
    title: "生成饮品下单草稿",
    description: "根据你的偏好生成饮品下单草稿，已为你选好推荐商品",
    userConfirmText: "查看下单草稿",
    hasCopyText: true,
  },
];

const MOVIE_RULES: StepActionRule[] = [
  {
    actionType: "movie_ticket",
    title: "查看电影票",
    description: "查看该影院在猫眼/淘票票上的排片和优惠票",
    userConfirmText: "去选座购票",
    hasRedirectUrl: true,
  },
  {
    actionType: "navigation",
    title: "打开地图导航",
    description: "导航到影院，方便你规划路线",
    userConfirmText: "开始导航",
    hasRedirectUrl: true,
  },
];

const ACTIVITY_RULES: StepActionRule[] = [
  {
    actionType: "navigation",
    title: "打开地图导航",
    description: "导航到活动地点，方便你规划路线",
    userConfirmText: "开始导航",
    hasRedirectUrl: true,
  },
  {
    actionType: "group_buy",
    title: "查看团购/门票",
    description: "查看该地点的团购优惠和门票信息",
    userConfirmText: "查看团购",
    hasRedirectUrl: true,
  },
];

// ============================================================================
// Build actions for a single step
// ============================================================================

function buildActionsForStep(step: TimelineStep): ServiceActionDraft[] {
  const actions: ServiceActionDraft[] = [];
  const poiName = step.poiName;

  // 缺少 poiName 时不生成任何服务入口
  if (!poiName || poiName === "null" || poiName === "未知出发地") {
    return actions;
  }

  const stepType = step.type;
  let rules: StepActionRule[] = [];

  // 根据 step type 选择规则
  if (stepType === "meal") {
    // meal / restaurant / lunch / dinner 类型
    rules = MEAL_RULES;
  } else if (stepType === "rest") {
    // coffee / rest 类型
    rules = COFFEE_RULES;
  } else if (stepType === "movie") {
    // movie / cinema 类型
    rules = MOVIE_RULES;
  } else if (stepType === "activity" || stepType === "event") {
    // activity / event 类型
    rules = ACTIVITY_RULES;
  } else {
    // 所有有 poiName 的步骤：通用规则
    rules = [
      {
        actionType: "navigation",
        title: "打开地图导航",
        description: `导航到${poiName}，方便你规划路线`,
        userConfirmText: "开始导航",
        hasRedirectUrl: true,
      },
      {
        actionType: "copy_booking_info",
        title: "复制地点信息",
        description: `复制${poiName}的地址等信息，方便你手动搜索`,
        userConfirmText: "复制信息",
        hasCopyText: true,
      },
    ];
  }

  // 如果是外卖场景，额外生成"生成外卖下单草稿"
  const isFoodDelivery = stepType === "meal" && step.description?.toLowerCase().includes("外卖");
  if (isFoodDelivery) {
    rules.push({
      actionType: "food_delivery",
      title: "生成外卖下单草稿",
      description: "根据你的偏好生成外卖下单草稿，已为你选好推荐商品",
      userConfirmText: "查看下单草稿",
      hasCopyText: true,
    });
  }

  // 根据规则生成 action
  for (const rule of rules) {
    const provider = mapActionTypeToProvider(rule.actionType);
    const actionId = createId(`svc_${rule.actionType}`);

    let redirectUrl: string | undefined;
    let copyText: string | undefined;

    if (rule.hasRedirectUrl) {
      if (rule.actionType === "navigation") {
        const deepLink = generateDeepLink({
          provider: "open",
          poiName: poiName,
          lat: step.type === "travel" ? undefined : undefined,
          lng: undefined,
          action: "navigate",
        });
        redirectUrl = deepLink.url;
      } else {
        // 美团/点评/饿了么搜索 deep link
        const deepLink = generateDeepLink({
          provider: provider as "meituan" | "dianping" | "eleme",
          poiName: poiName,
          action: "search",
        });
        redirectUrl = deepLink.url;
      }
    }

    if (rule.hasCopyText) {
      // 生成复制文案
      const lines = [poiName];
      if (step.address) lines.push(`地址：${step.address}`);
      if (step.type === "meal") lines.push(`类型：${step.title}`);
      if (step.startTime) lines.push(`时间：${step.startTime}–${step.endTime}`);
      copyText = lines.join("\n");
    }

    actions.push({
      id: actionId,
      provider,
      actionType: rule.actionType,
      title: rule.title,
      description: rule.description,
      poiName,
      poiAddress: step.address,
      lat: undefined, // TODO: 从 POI 详情中获取
      lng: undefined,
      userConfirmText: rule.userConfirmText,
      riskNotice: RISK_NOTICE,
      redirectUrl: redirectUrl || undefined,
      copyText: copyText || undefined,
      status: redirectUrl ? "redirect_required" : "prepared",
    });
  }

  return actions;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * 为单个 plan 的所有 timeline step 生成 serviceActions
 * @param plan 包含 timeline 的方案
 * @returns 每个 step 的 serviceActions 数组（已挂载到原 plan 上）
 */
export function buildServiceActionsForPlan(plan: {
  id: string;
  timeline: TimelineStep[];
}): { id: string; timeline: (TimelineStep & { serviceActions: ServiceActionDraft[] })[] } {
  const resultTimeline: (TimelineStep & { serviceActions: ServiceActionDraft[] })[] = [];

  for (const step of plan.timeline) {
    const serviceActions = buildActionsForStep(step);
    resultTimeline.push({
      ...step,
      serviceActions,
    });
  }

  return {
    id: plan.id,
    timeline: resultTimeline,
  };
}

/**
 * 为单个 step 生成 serviceActions（供单元测试使用）
 */
export function buildServiceActionsForStep(step: TimelineStep): ServiceActionDraft[] {
  return buildActionsForStep(step);
}
