/**
 * Service Action Entrance Smoke Test
 *
 * 覆盖：
 * 1. prepare 美团 action 返回 redirect_required 或 prepared
 * 2. prepare 饿了么 action 返回 redirect_required 或 prepared
 * 3. prepare 高德导航返回 redirect_required
 * 4. 所有返回文案不包含"预约成功""下单成功""支付成功""已购买"
 * 5. redirectUrl 不允许包含 null / undefined
 * 6. provider 必须显式写入
 */

import { describe, it, expect } from "vitest";
import { buildServiceActionsForStep } from "./serviceActionBuilder.js";
import { generateDeepLink } from "../tools/deepLinks.js";

// ============================================================================
// Forbidden text patterns — 禁止出现的文案
// ============================================================================

const FORBIDDEN_PATTERNS = [
  "预约成功",
  "下单成功",
  "支付成功",
  "已购买",
  "已锁定",
  "confirmed",
  "succeeded",
];

function assertNoForbiddenText(text: string, _context: string) {
  for (const pattern of FORBIDDEN_PATTERNS) {
    expect(text.toLowerCase()).not.toContain(
      pattern.toLowerCase(),
    );
  }
}

// ============================================================================
// buildServiceActionsForStep tests
// ============================================================================

describe("buildServiceActionsForStep", () => {
  it("should generate service actions for meal step", () => {
    const step = {
      id: "step_meal_1",
      startTime: "12:00",
      endTime: "13:00",
      type: "meal" as const,
      title: "午餐",
      poiId: "poi_meal_1",
      poiName: "海底捞",
      poiAddress: "杭州市西湖区文三路",
      durationMinutes: 60,
      transport: "none" as const,
      reasoning: "附近评分高的餐厅",
      bookingNeeded: true,
      actionId: null,
    };

    const actions = buildServiceActionsForStep(step);

    expect(actions.length).toBeGreaterThan(0);

    // 检查每个 action 的必填字段
    for (const action of actions) {
      expect(action.id).toBeDefined();
      expect(action.provider).toBeDefined();
      expect(action.actionType).toBeDefined();
      expect(action.title).toBeDefined();
      expect(action.description).toBeDefined();
      expect(action.userConfirmText).toBeDefined();
      expect(action.riskNotice).toBeDefined();
      expect(action.status).toMatch(/^(prepared|redirect_required|redirected_to_payment|waiting_external_confirm)$/);

      // 检查禁止文案
      assertNoForbiddenText(action.title, `action.title: ${action.id}`);
      assertNoForbiddenText(action.description, `action.description: ${action.id}`);
      assertNoForbiddenText(action.userConfirmText, `action.userConfirmText: ${action.id}`);
      assertNoForbiddenText(action.riskNotice, `action.riskNotice: ${action.id}`);

      // redirectUrl 不包含 null/undefined
      if (action.redirectUrl) {
        expect(action.redirectUrl).not.toContain("null");
        expect(action.redirectUrl).not.toContain("undefined");
      }
    }

    // 检查 actionType 覆盖
    const actionTypes = actions.map((a) => a.actionType);
    expect(actionTypes).toContain("restaurant_reservation");
    expect(actionTypes).toContain("group_buy");
    expect(actionTypes).toContain("copy_booking_info");
  });

  it("should generate service actions for coffee/rest step", () => {
    const step = {
      id: "step_coffee_1",
      startTime: "15:00",
      endTime: "15:30",
      type: "rest" as const,
      title: "下午茶",
      poiId: "poi_coffee_1",
      poiName: "星巴克",
      durationMinutes: 30,
      transport: "none" as const,
      reasoning: "休息",
      bookingNeeded: false,
      actionId: null,
    };

    const actions = buildServiceActionsForStep(step);

    expect(actions.length).toBeGreaterThan(0);

    const actionTypes = actions.map((a) => a.actionType);
    expect(actionTypes).toContain("coffee_order");
  });

  it("should generate service actions for movie step", () => {
    const step = {
      id: "step_movie_1",
      startTime: "19:00",
      endTime: "21:00",
      type: "movie" as const,
      title: "看电影",
      poiId: "poi_movie_1",
      poiName: "CGV影院",
      durationMinutes: 120,
      transport: "none" as const,
      reasoning: "晚间活动",
      bookingNeeded: false,
      actionId: null,
    };

    const actions = buildServiceActionsForStep(step);

    expect(actions.length).toBeGreaterThan(0);

    const actionTypes = actions.map((a) => a.actionType);
    expect(actionTypes).toContain("movie_ticket");
    expect(actionTypes).toContain("navigation");
  });

  it("should generate service actions for activity step", () => {
    const step = {
      id: "step_activity_1",
      startTime: "10:00",
      endTime: "12:00",
      type: "activity" as const,
      title: "逛西湖",
      poiId: "poi_activity_1",
      poiName: "西湖",
      durationMinutes: 120,
      transport: "walk" as const,
      reasoning: "户外活动",
      bookingNeeded: false,
      actionId: null,
    };

    const actions = buildServiceActionsForStep(step);

    expect(actions.length).toBeGreaterThan(0);

    const actionTypes = actions.map((a) => a.actionType);
    expect(actionTypes).toContain("navigation");
    expect(actionTypes).toContain("group_buy");
  });

  it("should generate service actions for any step with poiName", () => {
    const step = {
      id: "step_generic_1",
      startTime: "14:00",
      endTime: "14:30",
      type: "travel" as const,
      title: "前往目的地",
      poiId: "poi_generic_1",
      poiName: "雷峰塔",
      durationMinutes: 30,
      transport: "taxi" as const,
      reasoning: "交通",
      bookingNeeded: false,
      actionId: null,
    };

    const actions = buildServiceActionsForStep(step);

    expect(actions.length).toBeGreaterThan(0);

    const actionTypes = actions.map((a) => a.actionType);
    expect(actionTypes).toContain("navigation");
    expect(actionTypes).toContain("copy_booking_info");
  });

  it("should return empty array when poiName is missing", () => {
    const step = {
      id: "step_no_poi_1",
      startTime: "09:00",
      endTime: "09:30",
      type: "travel" as const,
      title: "出发",
      poiId: null,
      poiName: null,
      durationMinutes: 30,
      transport: "none" as const,
      reasoning: "开始行程",
      bookingNeeded: false,
      actionId: null,
    };

    const actions = buildServiceActionsForStep(step);
    expect(actions).toHaveLength(0);
  });

  it("should return empty array when poiName is 'null' string", () => {
    const step = {
      id: "step_null_poi_1",
      startTime: "09:00",
      endTime: "09:30",
      type: "travel" as const,
      title: "出发",
      poiId: "poi_null_1",
      poiName: "null",
      durationMinutes: 30,
      transport: "none" as const,
      reasoning: "开始行程",
      bookingNeeded: false,
      actionId: null,
    };

    const actions = buildServiceActionsForStep(step);
    expect(actions).toHaveLength(0);
  });

  it("should generate copyText for copy_booking_info actions", () => {
    const step = {
      id: "step_copy_1",
      startTime: "12:00",
      endTime: "13:00",
      type: "meal" as const,
      title: "午餐",
      poiId: "poi_copy_1",
      poiName: "海底捞",
      address: "杭州市西湖区文三路100号",
      durationMinutes: 60,
      transport: "none" as const,
      reasoning: "午餐",
      bookingNeeded: false,
      actionId: null,
    };

    const actions = buildServiceActionsForStep(step);
    const copyAction = actions.find((a) => a.actionType === "copy_booking_info");

    expect(copyAction).toBeDefined();
    expect(copyAction!.copyText).toBeDefined();
    expect(copyAction!.copyText).toContain("海底捞");
    expect(copyAction!.copyText).toContain("杭州市西湖区文三路100号");
  });
});

// ============================================================================
// deepLinks tests (URL safety)
// ============================================================================

describe("deepLinks URL safety", () => {
  it("should not contain null or undefined in any generated URL", () => {
    const testCases = [
      { provider: "meituan" as const, poiName: "测试POI" },
      { provider: "dianping" as const, poiName: "测试POI" },
      { provider: "eleme" as const, poiName: "测试POI" },
      { provider: "amap" as const, poiName: "测试POI", lat: 30.2, lng: 120.1, action: "navigate" as const },
      { provider: "amap" as const, poiName: "测试POI", action: "search" as const },
    ];

    for (const tc of testCases) {
      const link = generateDeepLink(tc as Record<string, unknown>);
      expect(link.url).not.toContain("null");
      expect(link.url).not.toContain("undefined");
    }
  });

  it("should handle empty poiName without null/undefined in URL", () => {
    const link = generateDeepLink({
      provider: "meituan",
      poiName: "",
      action: "search",
    });
    expect(link.url).not.toContain("null");
    expect(link.url).not.toContain("undefined");
  });
});

// ============================================================================
// Status validation
// ============================================================================

describe("action status validation", () => {
  it("should never return succeeded or confirmed status", () => {
    const step = {
      id: "step_status_1",
      startTime: "12:00",
      endTime: "13:00",
      type: "meal" as const,
      title: "午餐",
      poiId: "poi_status_1",
      poiName: "海底捞",
      durationMinutes: 60,
      transport: "none" as const,
      reasoning: "午餐",
      bookingNeeded: false,
      actionId: null,
    };

    const actions = buildServiceActionsForStep(step);

    for (const action of actions) {
      expect(action.status).not.toBe("succeeded");
      expect(action.status).not.toBe("confirmed");
      expect(action.status).not.toBe("external_confirmed");
      expect(action.status).not.toBe("executing");
    }
  });
});

describe("transaction draft wording", () => {
  it("keeps restaurant and ordering actions in draft/redirect language", () => {
    const step = {
      id: "step_transaction_1",
      startTime: "19:00",
      endTime: "20:30",
      type: "meal" as const,
      title: "海底捞晚餐",
      poiId: "poi_transaction_1",
      poiName: "海底捞",
      address: "杭州市西湖区",
      durationMinutes: 90,
      transport: "walk" as const,
      reasoning: "晚餐",
      bookingNeeded: true,
      actionId: null,
      description: "预约草稿，需前往平台确认支付",
    };

    const actions = buildServiceActionsForStep(step);
    const combined = actions.map((action) => [
      action.title,
      action.description,
      action.userConfirmText,
      action.riskNotice,
      action.copyText,
      action.redirectUrl,
      action.status,
    ].filter(Boolean).join(" ")).join(" ");

    assertNoForbiddenText(combined, "transaction action copy");
    expect(combined).toContain("确认");
    expect(combined).toContain("第三方平台");
    expect(actions.some((action) => action.status === "prepared" || action.status === "redirect_required")).toBe(true);
  });
});
