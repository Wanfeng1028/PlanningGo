import { weather, trafficRoutes, demoProfile } from "../../data/mockData";
import type { UserIntent } from "./schemas";

export interface PlanningContextInput {
  traceId: string;
  planId: string;
  intent: UserIntent;
}

export interface PlanningContext {
  traceId: string;
  planId: string;
  intent: UserIntent;
  userProfile: typeof demoProfile;
  environment: {
    weather: typeof weather;
    routes: typeof trafficRoutes;
  };
  policies: {
    paymentAutoExecute: false;
    requireConfirmForReservation: true;
    requireConfirmForShare: true;
    maxAutoPayAmount: 0;
  };
}

/**
 * 构造规划上下文，聚合用户画像、环境数据和安全策略。
 */
export async function buildPlanningContext(input: PlanningContextInput): Promise<PlanningContext> {
  return {
    traceId: input.traceId,
    planId: input.planId,
    intent: input.intent,
    userProfile: demoProfile,
    environment: {
      weather,
      routes: trafficRoutes,
    },
    policies: {
      paymentAutoExecute: false,
      requireConfirmForReservation: true,
      requireConfirmForShare: true,
      maxAutoPayAmount: 0,
    },
  };
}
