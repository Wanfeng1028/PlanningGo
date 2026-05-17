import { createId } from "../../common/id";
import type { ActivityPlan, UserIntent } from "../planning/schemas";
import type { PlanningContext } from "../planning/contextBuilder";
import type { CandidatePool } from "../planning/candidateGenerator";

export interface PlannerInput {
  traceId: string;
  planId: string;
  intent: UserIntent;
  context: PlanningContext;
  candidates: CandidatePool;
}

/**
 * 根据用户意图生成确定性 Mock 方案，保证演示和压测结果稳定。
 */
export function generateMockPlans(input: PlannerInput): ActivityPlan[] {
  if (input.intent.participantMode === "friends") {
    return [buildFriendsPlan(input), buildIndoorBackupPlan(input)];
  }

  return [buildFamilyPlan(input), buildIndoorBackupPlan(input)];
}

function buildFamilyPlan(input: PlannerInput): ActivityPlan {
  const activity = input.candidates.activities[0];
  const restaurant = input.candidates.restaurants[0];
  const optionId = createId("option_family");

  return {
    id: optionId,
    planId: input.planId,
    title: "亲子低负担半日游",
    targetGroup: "family",
    score: 92,
    summary: "按 40 分钟交通圈生成亲子低负担方案，保留雨天室内兜底，餐厅预约需确认。",
    totalDurationMinutes: 270,
    totalCostMin: 320,
    totalCostMax: 480,
    walkingKm: 2.2,
    assumptions: ["默认下午 14:00 出发", "默认一家三口", "默认不自动付款"],
    highlights: ["孩子步行压力低", "晚餐可提前锁位", "雨天可切换室内"],
    risks: ["晚餐高峰可能等位", "湖滨晚高峰可能拥堵"],
    timeline: [
      {
        id: createId("step"),
        startTime: "14:00",
        endTime: "14:40",
        type: "travel",
        title: "从起点出发",
        poiId: null,
        poiName: input.intent.origin.label,
        durationMinutes: 40,
        transport: "taxi",
        reasoning: "控制亲子出行强度，优先打车降低孩子步行负担。",
        bookingNeeded: false,
        actionId: null,
      },
      {
        id: createId("step"),
        startTime: "14:40",
        endTime: "16:20",
        type: "activity",
        title: activity?.name ?? "亲子活动",
        poiId: activity?.id ?? null,
        poiName: activity?.name ?? null,
        durationMinutes: 100,
        transport: "none",
        reasoning: "亲子友好、节奏低负担，适合 5 岁孩子。",
        bookingNeeded: activity?.bookingRequired ?? false,
        actionId: null,
      },
      {
        id: createId("step"),
        startTime: "16:20",
        endTime: "17:00",
        type: "buffer",
        title: "休息与转场",
        poiId: null,
        poiName: null,
        durationMinutes: 40,
        transport: "walk",
        reasoning: "亲子路线预留缓冲，避免赶场。",
        bookingNeeded: false,
        actionId: null,
      },
      {
        id: createId("step"),
        startTime: "17:00",
        endTime: "18:10",
        type: "meal",
        title: restaurant?.name ?? "家庭晚餐",
        poiId: restaurant?.id ?? null,
        poiName: restaurant?.name ?? null,
        durationMinutes: 70,
        transport: "none",
        reasoning: "安排较早晚餐，减少孩子疲劳；餐厅可备注低油和儿童椅。",
        bookingNeeded: true,
        actionId: null,
      },
      {
        id: createId("step"),
        startTime: "18:10",
        endTime: "18:40",
        type: "return",
        title: "返程回家",
        poiId: null,
        poiName: input.intent.origin.label,
        durationMinutes: 30,
        transport: "taxi",
        reasoning: "晚餐后直接返程，保证总时长在 4-6 小时内。",
        bookingNeeded: false,
        actionId: null,
      },
    ],
    backupPlan: "如果下雨或孩子疲劳，直接切换到湖滨室内亲子展 + 同商圈晚餐。",
  };
}

function buildFriendsPlan(input: PlannerInput): ActivityPlan {
  const activity = input.candidates.events[0] ?? input.candidates.activities[0];
  const restaurant = input.candidates.restaurants[0];
  const movie = input.candidates.movies[0];
  const optionId = createId("option_friends");

  return {
    id: optionId,
    planId: input.planId,
    title: "朋友小聚轻社交方案",
    targetGroup: "friends",
    score: 88,
    summary: "适合 4 人下午轻社交，优先同商圈，支持分享投票和可选锁座。",
    totalDurationMinutes: 310,
    totalCostMin: 360,
    totalCostMax: 620,
    walkingKm: 3.1,
    assumptions: ["默认 4 人", "默认下午 14:00 出发", "电影锁座需确认"],
    highlights: ["适合 4 人同行", "可分享给朋友投票", "室内备选充足"],
    risks: ["电影连座库存变化快", "餐厅 18:00 可能紧张"],
    timeline: [
      {
        id: createId("step"),
        startTime: "14:00",
        endTime: "14:40",
        type: "travel",
        title: "集合出发",
        poiId: null,
        poiName: input.intent.origin.label,
        durationMinutes: 40,
        transport: "mixed",
        reasoning: "默认同城集合，优先同商圈减少转场。",
        bookingNeeded: false,
        actionId: null,
      },
      {
        id: createId("step"),
        startTime: "14:40",
        endTime: "16:00",
        type: "event",
        title: activity?.name ?? "展览活动",
        poiId: activity?.id ?? null,
        poiName: activity?.name ?? null,
        durationMinutes: 80,
        transport: "none",
        reasoning: "适合朋友聊天拍照，节奏轻松，话题性强。",
        bookingNeeded: activity?.bookingRequired ?? false,
        actionId: null,
      },
      {
        id: createId("step"),
        startTime: "16:20",
        endTime: "17:50",
        type: "movie",
        title: movie?.name ?? "可选电影锁座",
        poiId: movie?.id ?? null,
        poiName: movie?.name ?? null,
        durationMinutes: 90,
        transport: "walk",
        reasoning: "作为 4 人室内备选，可锁连座但不自动支付。",
        bookingNeeded: true,
        actionId: null,
      },
      {
        id: createId("step"),
        startTime: "18:10",
        endTime: "19:10",
        type: "meal",
        title: restaurant?.name ?? "朋友晚餐",
        poiId: restaurant?.id ?? null,
        poiName: restaurant?.name ?? null,
        durationMinutes: 60,
        transport: "walk",
        reasoning: "晚餐放在同商圈，方便 4 人桌预约和后续返程。",
        bookingNeeded: true,
        actionId: null,
      },
    ],
    backupPlan: "如果电影没有 4 连座，改为同商圈展览/桌游，晚餐时间不变。",
  };
}

function buildIndoorBackupPlan(input: PlannerInput): ActivityPlan {
  const indoor = [...input.candidates.activities, ...input.candidates.movies].find((item) => item.indoor);
  const restaurant = input.candidates.restaurants[0];
  const optionId = createId("option_indoor");

  return {
    id: optionId,
    planId: input.planId,
    title: "雨天室内兜底方案",
    targetGroup: input.intent.participantMode,
    score: 86,
    summary: "针对雨天/拥堵准备的低风险方案，减少户外和长距离转场。",
    totalDurationMinutes: 240,
    totalCostMin: 280,
    totalCostMax: 450,
    walkingKm: 1.4,
    assumptions: ["默认天气可能变化", "优先室内", "餐厅需确认"],
    highlights: ["雨天友好", "路线短", "失败恢复成本低"],
    risks: ["室内活动库存需确认"],
    timeline: [
      {
        id: createId("step"),
        startTime: "14:00",
        endTime: "14:35",
        type: "travel",
        title: "出发到室内场所",
        poiId: null,
        poiName: input.intent.origin.label,
        durationMinutes: 35,
        transport: "taxi",
        reasoning: "雨天优先减少户外暴露和步行距离。",
        bookingNeeded: false,
        actionId: null,
      },
      {
        id: createId("step"),
        startTime: "14:35",
        endTime: "16:30",
        type: "activity",
        title: indoor?.name ?? "室内活动",
        poiId: indoor?.id ?? null,
        poiName: indoor?.name ?? null,
        durationMinutes: 115,
        transport: "none",
        reasoning: "室内场所对雨天和亲子/朋友聚会都更稳妥。",
        bookingNeeded: indoor?.bookingRequired ?? true,
        actionId: null,
      },
      {
        id: createId("step"),
        startTime: "17:00",
        endTime: "18:00",
        type: "meal",
        title: restaurant?.name ?? "同商圈晚餐",
        poiId: restaurant?.id ?? null,
        poiName: restaurant?.name ?? null,
        durationMinutes: 60,
        transport: "walk",
        reasoning: "同商圈晚餐减少转场，降低天气和交通风险。",
        bookingNeeded: true,
        actionId: null,
      },
    ],
    backupPlan: "若室内活动无票，则保留餐厅并切换到商场休息/咖啡。",
  };
}

/**
 * LLM 方案生成占位，第一阶段 fallback 到 mock。
 */
export async function generateLlmPlans(input: PlannerInput): Promise<ActivityPlan[]> {
  return generateMockPlans(input);
}
