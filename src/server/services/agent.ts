import { z } from "zod";
import { baseToolLogs, demoProfile, planOptions, trafficRoutes, weather } from "../data/mockData";
import type { AgentResult, PlanningRequest } from "../types";

export const planningRequestSchema = z.object({
  prompt: z.string().min(1, "prompt is required"),
  city: z.string().optional(),
  startPoint: z.string().optional(),
  companions: z.enum(["family", "friends", "couple", "solo"]).optional(),
  budget: z.number().positive().optional(),
  departAt: z.string().optional(),
});

export function runPlanningAgent(input: PlanningRequest): AgentResult {
  const startPoint = input.startPoint ?? demoProfile.startPoint;
  const city = input.city ?? demoProfile.city;
  const budget = input.budget ? `预算约 ￥${input.budget}` : "预算约 ￥420";
  const selectedPlanId = input.companions === "friends" ? "plan_b" : "plan_a";

  return {
    traceId: `trace_${Date.now()}`,
    startPoint,
    destination: `${city}西湖 / 湖滨`,
    summary: `已根据「${input.prompt}」生成三套周末方案。当前推荐亲子低负担路线，${budget}，支付需用户本人确认。`,
    toolLogs: baseToolLogs,
    options: planOptions,
    selectedPlanId,
    authorization: ["定位用于距离判断", "餐厅预约需用户确认", "票务仅锁单不付款", "日历和分享可单独授权"],
    nextActions: ["确认起点", "选择方案", "授权预约", "发送给家人确认", "写入日历提醒"],
  };
}

export function parseDemand(input: PlanningRequest) {
  return {
    raw: input.prompt,
    city: input.city ?? demoProfile.city,
    startPoint: input.startPoint ?? demoProfile.startPoint,
    companions: input.companions ?? "family",
    constraints: [
      "40 分钟内优先",
      "孩子步行负担低",
      "晚餐减脂友好",
      input.budget ? `预算上限 ￥${input.budget}` : "预算 300-500",
    ],
    missingSlots: input.startPoint ? [] : ["location-confirmation"],
  };
}

export function simulateWhatIf(planId: string, scenario: "rain" | "late" | "budget" | "traffic") {
  const base = planOptions.find((plan) => plan.id === planId) ?? planOptions[0];
  const strategies = {
    rain: {
      title: "雨天室内兜底",
      changes: ["缩短白堤散步", "切换室内亲子展", "保留海底捞晚餐"],
      score: 88,
    },
    late: {
      title: "晚出发压缩",
      changes: ["取消断桥停留", "湖滨休息前置", "晚餐时间延后 20 分钟"],
      score: 84,
    },
    budget: {
      title: "预算压缩",
      changes: ["地铁替代打车", "取消可选电影", "餐厅换为轻餐"],
      score: 81,
    },
    traffic: {
      title: "交通拥堵重规划",
      changes: ["切换地铁路线", "调整入口到龙翔桥", "推迟餐厅预约"],
      score: 86,
    },
  };

  return {
    basePlan: base.title,
    weather,
    trafficRoutes,
    scenario,
    ...strategies[scenario],
  };
}
