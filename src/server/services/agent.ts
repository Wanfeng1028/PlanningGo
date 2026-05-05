import { z } from "zod";
import { baseToolLogs, demoProfile, planOptions } from "../data/mockData";
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
