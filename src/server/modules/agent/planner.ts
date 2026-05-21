import { createId } from "../../common/id";
import { env } from "../../config/env";
import type { ActivityPlan, UserIntent, PlanningProviders } from "../planning/schemas";
import type { PlanningContext } from "../planning/contextBuilder";
import type { CandidatePool } from "../planning/candidateGenerator";
import type { LlmQuery } from "../../providers/types";
import { z } from "zod";

export interface PlannerInput {
  traceId: string;
  planId: string;
  intent: UserIntent;
  context: PlanningContext;
  candidates: CandidatePool;
  providers?: PlanningProviders;
}

// LLM 输出 JSON schema 描述（发给 LLM 的 prompt 里用）
const PLAN_JSON_SCHEMA_DESC = `{
  "plans": [{
    "title": "方案标题",
    "targetGroup": "family|friends|couple|solo",
    "score": 0-100,
    "summary": "一句话方案说明",
    "totalDurationMinutes": 数字,
    "totalCostMin": 数字,
    "totalCostMax": 数字,
    "assumptions": ["假设1"],
    "highlights": ["亮点1"],
    "risks": ["风险1"],
    "timeline": [{
      "startTime": "HH:MM",
      "endTime": "HH:MM",
      "type": "travel|activity|meal|movie|event|buffer|return|rest",
      "title": "步骤标题",
      "poiName": "地点名或null",
      "durationMinutes": 数字,
      "transport": "driving|taxi|subway|walk|mixed|none",
      "reasoning": "为什么安排这个步骤",
      "bookingNeeded": true/false
    }],
    "backupPlan": "备选方案说明"
  }]
}`;

// LLM 返回的原始 schema（用于 zod 校验）
const llmPlanItemSchema = z.object({
  title: z.string(),
  targetGroup: z.enum(["family", "friends", "couple", "solo"]).default("solo"),
  score: z.number().min(0).max(100).default(80),
  summary: z.string(),
  totalDurationMinutes: z.number().int().positive().default(240),
  totalCostMin: z.number().min(0).default(0),
  totalCostMax: z.number().min(0).default(500),
  assumptions: z.array(z.string()).default([]),
  highlights: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  timeline: z.array(z.object({
    startTime: z.string(),
    endTime: z.string(),
    type: z.enum(["travel", "activity", "meal", "movie", "event", "buffer", "return", "rest"]),
    title: z.string(),
    poiName: z.string().nullable().default(null),
    durationMinutes: z.number().int().positive(),
    transport: z.enum(["driving", "taxi", "subway", "walk", "mixed", "none"]).default("none"),
    reasoning: z.string(),
    bookingNeeded: z.boolean().default(false),
  })).min(2),
  backupPlan: z.string().optional(),
});

const llmOutputSchema = z.object({
  plans: z.array(llmPlanItemSchema).min(1).max(3),
});

const SYSTEM_PROMPT = `你是"周末有谱"的行程规划 AI。用户会告诉你出行需求，你需要生成 1-2 套可执行的行程方案。

要求：
1. 只输出 JSON，不要输出任何其他文字
2. 不要输出推理链、思考过程、分析步骤
3. 每个方案的 timeline 必须合理衔接，时间不能重叠
4. 所有地点必须基于提供的候选 POI 列表，不要编造地点
5. reasoning 字段简要说明"为什么安排这个步骤"，不超过 50 字
6. 评分基于可行性、用户匹配度、风险控制`;

/**
 * Mock 方案生成（仅开发/演示用）。
 */
export function generateMockPlans(input: PlannerInput): ActivityPlan[] {
  if (input.intent.participantMode === "friends") {
    return [buildFriendsPlan(input), buildIndoorBackupPlan(input)];
  }
  return [buildFamilyPlan(input), buildIndoorBackupPlan(input)];
}

/**
 * LLM 方案生成：调用 QwenLlmProvider，输出结构化 JSON，zod 校验，最多重试一次。
 */
export async function generateLlmPlans(input: PlannerInput): Promise<ActivityPlan[]> {
  const llmProvider = input.providers?.llm;
  if (!llmProvider) {
    if (env.NODE_ENV === "production") {
      throw new Error("[planner] 生产环境必须提供 llm provider");
    }
    console.warn("[planner] 无 llm provider，fallback 到 mock");
    return generateMockPlans(input);
  }

  const prompt = buildLlmPrompt(input);
  const model = env.QWEN_FLASH_MODEL ?? env.LLM_FLASH_MODEL ?? env.LLM_MODEL;

  const maxRetries = 1;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const query: LlmQuery = {
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: prompt },
        ],
        model,
        maxTokens: 4096,
        temperature: 0.7,
      };

      const result = await llmProvider.chat(query);
      return parseAndValidateLlmOutput(result.content, input.planId);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < maxRetries) {
        console.warn(`[planner] LLM 输出校验失败，重试 (${attempt + 1}/${maxRetries}): ${lastError.message}`);
      }
    }
  }

  if (env.NODE_ENV !== "production") {
    console.warn(`[planner] LLM 生成失败，fallback 到 mock: ${lastError?.message}`);
    return generateMockPlans(input);
  }

  throw new Error(`[planner] LLM 方案生成失败: ${lastError?.message}`);
}

function buildLlmPrompt(input: PlannerInput): string {
  const { intent, candidates } = input;
  const weather = input.context.environment.weather;

  const candidateList = [
    ...candidates.activities,
    ...candidates.restaurants,
    ...candidates.events,
  ].map((c) => `- ${c.name} (${c.category}, ${c.address}, 评分${c.rating ?? "?"}, 人均${c.avgPrice ?? "?"}元)`).join("\n");

  return `用户需求：
- 城市：${intent.city}
- 出发地：${intent.origin.label}
- 日期：${intent.date ?? "本周六"}
- 出发时间：${intent.departAt ?? "14:00"}
- 参与者：${intent.participantMode}，${intent.partySize}人
- 时长：${intent.durationHours[0]}-${intent.durationHours[1]}小时
- 预算上限：${intent.budgetMax ?? "不限"}元
- 偏好：${intent.preferences.length > 0 ? intent.preferences.join("、") : "无特殊偏好"}

天气：${weather.condition}，${weather.temperature}，${weather.suggestion}

候选地点：
${candidateList || "（无候选地点，请根据城市和需求推荐）"}

请输出 JSON，格式：
${PLAN_JSON_SCHEMA_DESC}`;
}

function parseAndValidateLlmOutput(content: string, planId: string): ActivityPlan[] {
  let jsonStr = content.trim();
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }

  const firstBrace = jsonStr.indexOf("{");
  const lastBrace = jsonStr.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1) {
    jsonStr = jsonStr.slice(firstBrace, lastBrace + 1);
  }

  const raw = JSON.parse(jsonStr);
  const validated = llmOutputSchema.parse(raw);

  return validated.plans.map((plan) => ({
    id: createId("llm"),
    planId,
    title: plan.title,
    targetGroup: plan.targetGroup as ActivityPlan["targetGroup"],
    score: plan.score,
    summary: plan.summary,
    totalDurationMinutes: plan.totalDurationMinutes,
    totalCostMin: plan.totalCostMin,
    totalCostMax: plan.totalCostMax,
    assumptions: plan.assumptions,
    highlights: plan.highlights,
    risks: plan.risks,
    timeline: plan.timeline.map((step) => ({
      id: createId("step"),
      startTime: step.startTime,
      endTime: step.endTime,
      type: step.type as ActivityPlan["timeline"][number]["type"],
      title: step.title,
      poiId: null,
      poiName: step.poiName,
      durationMinutes: step.durationMinutes,
      transport: step.transport as ActivityPlan["timeline"][number]["transport"],
      reasoning: step.reasoning,
      bookingNeeded: step.bookingNeeded,
      actionId: null,
    })),
    backupPlan: plan.backupPlan,
  }));
}

// ── Mock 方案构建（仅开发环境 fallback） ──

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
      { id: createId("step"), startTime: "14:00", endTime: "14:40", type: "travel", title: "从起点出发", poiId: null, poiName: input.intent.origin.label, durationMinutes: 40, transport: "taxi", reasoning: "控制亲子出行强度。", bookingNeeded: false, actionId: null },
      { id: createId("step"), startTime: "14:40", endTime: "16:20", type: "activity", title: activity?.name ?? "亲子活动", poiId: activity?.id ?? null, poiName: activity?.name ?? null, durationMinutes: 100, transport: "none", reasoning: "亲子友好、节奏低负担。", bookingNeeded: activity?.bookingRequired ?? false, actionId: null },
      { id: createId("step"), startTime: "16:20", endTime: "17:00", type: "buffer", title: "休息与转场", poiId: null, poiName: null, durationMinutes: 40, transport: "walk", reasoning: "预留缓冲避免赶场。", bookingNeeded: false, actionId: null },
      { id: createId("step"), startTime: "17:00", endTime: "18:10", type: "meal", title: restaurant?.name ?? "家庭晚餐", poiId: restaurant?.id ?? null, poiName: restaurant?.name ?? null, durationMinutes: 70, transport: "none", reasoning: "较早晚餐减少孩子疲劳。", bookingNeeded: true, actionId: null },
      { id: createId("step"), startTime: "18:10", endTime: "18:40", type: "return", title: "返程回家", poiId: null, poiName: input.intent.origin.label, durationMinutes: 30, transport: "taxi", reasoning: "保证总时长在 4-6 小时内。", bookingNeeded: false, actionId: null },
    ],
    backupPlan: "如果下雨或孩子疲劳，直接切换到室内亲子展 + 同商圈晚餐。",
  };
}

function buildFriendsPlan(input: PlannerInput): ActivityPlan {
  const activity = input.candidates.events[0] ?? input.candidates.activities[0];
  const restaurant = input.candidates.restaurants[0];
  const optionId = createId("option_friends");

  return {
    id: optionId,
    planId: input.planId,
    title: "朋友小聚轻社交方案",
    targetGroup: "friends",
    score: 88,
    summary: "适合多人下午轻社交，优先同商圈，支持分享投票。",
    totalDurationMinutes: 310,
    totalCostMin: 360,
    totalCostMax: 620,
    walkingKm: 3.1,
    assumptions: ["默认 4 人", "默认下午 14:00 出发"],
    highlights: ["适合多人同行", "可分享给朋友投票"],
    risks: ["餐厅 18:00 可能紧张"],
    timeline: [
      { id: createId("step"), startTime: "14:00", endTime: "14:40", type: "travel", title: "集合出发", poiId: null, poiName: input.intent.origin.label, durationMinutes: 40, transport: "mixed", reasoning: "同城集合优先同商圈。", bookingNeeded: false, actionId: null },
      { id: createId("step"), startTime: "14:40", endTime: "16:00", type: "event", title: activity?.name ?? "展览活动", poiId: activity?.id ?? null, poiName: activity?.name ?? null, durationMinutes: 80, transport: "none", reasoning: "适合聊天拍照，节奏轻松。", bookingNeeded: activity?.bookingRequired ?? false, actionId: null },
      { id: createId("step"), startTime: "16:20", endTime: "17:20", type: "activity", title: "同商圈休闲", poiId: null, poiName: null, durationMinutes: 60, transport: "walk", reasoning: "弹性时间可逛街或咖啡。", bookingNeeded: false, actionId: null },
      { id: createId("step"), startTime: "18:00", endTime: "19:00", type: "meal", title: restaurant?.name ?? "朋友晚餐", poiId: restaurant?.id ?? null, poiName: restaurant?.name ?? null, durationMinutes: 60, transport: "walk", reasoning: "同商圈方便聚餐返程。", bookingNeeded: true, actionId: null },
    ],
    backupPlan: "改为同商圈桌游/咖啡，晚餐时间不变。",
  };
}

function buildIndoorBackupPlan(input: PlannerInput): ActivityPlan {
  const indoor = input.candidates.activities.find((item) => item.indoor);
  const restaurant = input.candidates.restaurants[0];
  const optionId = createId("option_indoor");

  return {
    id: optionId,
    planId: input.planId,
    title: "雨天室内兜底方案",
    targetGroup: input.intent.participantMode,
    score: 86,
    summary: "针对雨天/拥堵的低风险方案，减少户外和长距离转场。",
    totalDurationMinutes: 240,
    totalCostMin: 280,
    totalCostMax: 450,
    walkingKm: 1.4,
    assumptions: ["优先室内", "餐厅需确认"],
    highlights: ["雨天友好", "路线短", "失败恢复成本低"],
    risks: ["室内活动库存需确认"],
    timeline: [
      { id: createId("step"), startTime: "14:00", endTime: "14:35", type: "travel", title: "出发到室内场所", poiId: null, poiName: input.intent.origin.label, durationMinutes: 35, transport: "taxi", reasoning: "雨天减少户外暴露。", bookingNeeded: false, actionId: null },
      { id: createId("step"), startTime: "14:35", endTime: "16:30", type: "activity", title: indoor?.name ?? "室内活动", poiId: indoor?.id ?? null, poiName: indoor?.name ?? null, durationMinutes: 115, transport: "none", reasoning: "室内场所对雨天更稳妥。", bookingNeeded: indoor?.bookingRequired ?? true, actionId: null },
      { id: createId("step"), startTime: "17:00", endTime: "18:00", type: "meal", title: restaurant?.name ?? "同商圈晚餐", poiId: restaurant?.id ?? null, poiName: restaurant?.name ?? null, durationMinutes: 60, transport: "walk", reasoning: "同商圈减少转场风险。", bookingNeeded: true, actionId: null },
    ],
    backupPlan: "若室内活动无票，则保留餐厅并切换到商场休息/咖啡。",
  };
}
