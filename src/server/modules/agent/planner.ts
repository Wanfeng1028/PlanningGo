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

const SYSTEM_PROMPT = `你是"周末去哪儿"的行程规划 AI。用户会告诉你出行需求，你需要生成 1-2 套可执行的行程方案。

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
/**
 * Mock 方案生成（仅开发/演示用）。
 * 根据用户意图的 participantMode 动态选择方案模板，使用意图中的城市、出发地、预算等信息。
 */
export function generateMockPlans(input: PlannerInput): ActivityPlan[] {
  const mode = input.intent.participantMode;
  const primary = buildPrimaryPlan(input);
  const backup = buildIndoorBackupPlan(input);

  if (mode === "friends") {
    return [buildFriendsPlan(input), backup];
  }
  if (mode === "couple") {
    return [buildCouplePlan(input), backup];
  }
  // family, solo, unknown 均走通用主方案
  return [primary, backup];
}

/** 主方案：根据 participantMode 动态生成标题和内容 */
function buildPrimaryPlan(input: PlannerInput): ActivityPlan {
  const { intent, candidates } = input;
  const city = intent.city || "杭州";
  const origin = intent.origin.label;
  const budget = intent.budgetMax ?? 420;
  const mode = intent.participantMode;
  const activity = candidates.events[0] ?? candidates.activities[0];
  const restaurant = candidates.restaurants[0];
  const optionId = createId("option_primary");

  const titleMap: Record<string, string> = {
    family: `${city}家庭休闲半日游`,
    solo: `${city}个人探索之旅`,
    unknown: `${city}半日精选路线`,
  };
  const title = titleMap[mode] ?? titleMap.unknown;

  const summaryMap: Record<string, string> = {
    family: `基于${origin}出发，${city}周边${intent.distanceLimitMinutes}分钟交通圈内的家庭方案，预算约￥${budget}。`,
    solo: `基于${origin}出发，适合独自探索${city}的轻松路线，预算约￥${budget}。`,
    unknown: `基于${origin}出发，${city}周边精选路线，预算约￥${budget}。`,
  };
  const summary = summaryMap[mode] ?? summaryMap.unknown;

  const highlightsMap: Record<string, string[]> = {
    family: ["亲子友好", "低步行负担", `预算约￥${budget}`],
    solo: ["节奏自由", "可随时调整", `预算约￥${budget}`],
    unknown: ["路线灵活", `预算约￥${budget}`],
  };
  const highlights = highlightsMap[mode] ?? highlightsMap.unknown;

  const walkingKm = mode === "family" ? 2.2 : 3.0;

  return {
    id: optionId,
    planId: input.planId,
    title,
    targetGroup: mode === "unknown" ? "solo" : mode,
    score: 90,
    summary,
    totalDurationMinutes: Math.round((intent.durationHours[0] + intent.durationHours[1]) / 2 * 60),
    totalCostMin: Math.round(budget * 0.6),
    totalCostMax: budget,
    walkingKm,
    assumptions: [`从${origin}出发`, `默认下午 14:00 出发`],
    highlights,
    risks: ["餐厅高峰可能等位", "天气变化需关注"],
    timeline: [
      { id: createId("step"), startTime: "14:00", endTime: "14:40", type: "travel", title: `从${origin}出发`, poiId: null, poiName: origin, durationMinutes: 40, transport: "taxi", reasoning: "打车前往目的地，节省体力。", bookingNeeded: false, actionId: null },
      { id: createId("step"), startTime: "14:40", endTime: "16:20", type: "activity", title: activity?.name ?? "景点游览", poiId: activity?.id ?? null, poiName: activity?.name ?? null, durationMinutes: 100, transport: "none", reasoning: "下午时段人流量适中，适合游览。", bookingNeeded: activity?.bookingRequired ?? false, actionId: null },
      { id: createId("step"), startTime: "16:20", endTime: "17:00", type: "buffer", title: "休息与转场", poiId: null, poiName: null, durationMinutes: 40, transport: "walk", reasoning: "预留缓冲避免赶场。", bookingNeeded: false, actionId: null },
      { id: createId("step"), startTime: "17:00", endTime: "18:10", type: "meal", title: restaurant?.name ?? "晚餐", poiId: restaurant?.id ?? null, poiName: restaurant?.name ?? null, durationMinutes: 70, transport: "none", reasoning: "较早用餐避开高峰。", bookingNeeded: true, actionId: null },
      { id: createId("step"), startTime: "18:10", endTime: "18:40", type: "return", title: "返程", poiId: null, poiName: origin, durationMinutes: 30, transport: "taxi", reasoning: "保证总时长在合理范围内。", bookingNeeded: false, actionId: null },
    ],
    backupPlan: `如果天气不好，切换到${city}室内活动 + 同商圈晚餐。`,
  };
}

function buildFriendsPlan(input: PlannerInput): ActivityPlan {
  const { intent, candidates } = input;
  const city = intent.city || "杭州";
  const origin = intent.origin.label;
  const budget = intent.budgetMax ?? 500;
  const activity = candidates.events[0] ?? candidates.activities[0];
  const restaurant = candidates.restaurants[0];
  const optionId = createId("option_friends");

  return {
    id: optionId,
    planId: input.planId,
    title: `${city}朋友小聚轻社交方案`,
    targetGroup: "friends",
    score: 88,
    summary: `适合多人下午轻社交，从${origin}出发，优先同商圈，预算约￥${budget}。`,
    totalDurationMinutes: 310,
    totalCostMin: Math.round(budget * 0.6),
    totalCostMax: budget,
    walkingKm: 3.1,
    assumptions: [`默认 ${intent.partySize} 人`, "默认下午 14:00 出发"],
    highlights: ["适合多人同行", "可分享给朋友投票"],
    risks: ["餐厅 18:00 可能紧张"],
    timeline: [
      { id: createId("step"), startTime: "14:00", endTime: "14:40", type: "travel", title: "集合出发", poiId: null, poiName: origin, durationMinutes: 40, transport: "mixed", reasoning: "同城集合优先同商圈。", bookingNeeded: false, actionId: null },
      { id: createId("step"), startTime: "14:40", endTime: "16:00", type: "event", title: activity?.name ?? "展览活动", poiId: activity?.id ?? null, poiName: activity?.name ?? null, durationMinutes: 80, transport: "none", reasoning: "适合聊天拍照，节奏轻松。", bookingNeeded: activity?.bookingRequired ?? false, actionId: null },
      { id: createId("step"), startTime: "16:20", endTime: "17:20", type: "activity", title: "同商圈休闲", poiId: null, poiName: null, durationMinutes: 60, transport: "walk", reasoning: "弹性时间可逛街或咖啡。", bookingNeeded: false, actionId: null },
      { id: createId("step"), startTime: "18:00", endTime: "19:00", type: "meal", title: restaurant?.name ?? "朋友晚餐", poiId: restaurant?.id ?? null, poiName: restaurant?.name ?? null, durationMinutes: 60, transport: "walk", reasoning: "同商圈方便聚餐返程。", bookingNeeded: true, actionId: null },
    ],
    backupPlan: "改为同商圈桌游/咖啡，晚餐时间不变。",
  };
}

function buildCouplePlan(input: PlannerInput): ActivityPlan {
  const { intent, candidates } = input;
  const city = intent.city || "杭州";
  const origin = intent.origin.label;
  const budget = intent.budgetMax ?? 360;
  const activity = candidates.activities[0];
  const restaurant = candidates.restaurants[0];
  const optionId = createId("option_couple");

  return {
    id: optionId,
    planId: input.planId,
    title: `${city}情侣轻约会路线`,
    targetGroup: "couple",
    score: 89,
    summary: `适合双人的浪漫${city}半日游，从${origin}出发，预算约￥${budget}。`,
    totalDurationMinutes: 300,
    totalCostMin: Math.round(budget * 0.5),
    totalCostMax: budget,
    walkingKm: 2.5,
    assumptions: ["默认 2 人", "默认下午 14:00 出发"],
    highlights: ["浪漫氛围", "节奏轻松", "适合拍照打卡"],
    risks: ["热门餐厅需提前预约"],
    timeline: [
      { id: createId("step"), startTime: "14:00", endTime: "14:30", type: "travel", title: `从${origin}出发`, poiId: null, poiName: origin, durationMinutes: 30, transport: "taxi", reasoning: "打车前往，轻松开始约会。", bookingNeeded: false, actionId: null },
      { id: createId("step"), startTime: "14:30", endTime: "16:30", type: "activity", title: activity?.name ?? "景点漫步", poiId: activity?.id ?? null, poiName: activity?.name ?? null, durationMinutes: 120, transport: "walk", reasoning: "下午光线好，适合拍照。", bookingNeeded: activity?.bookingRequired ?? false, actionId: null },
      { id: createId("step"), startTime: "16:30", endTime: "17:30", type: "buffer", title: "咖啡休息", poiId: null, poiName: null, durationMinutes: 60, transport: "walk", reasoning: "找家有情调的咖啡馆小坐。", bookingNeeded: false, actionId: null },
      { id: createId("step"), startTime: "18:00", endTime: "19:30", type: "meal", title: restaurant?.name ?? "浪漫晚餐", poiId: restaurant?.id ?? null, poiName: restaurant?.name ?? null, durationMinutes: 90, transport: "walk", reasoning: "提前预约好位子。", bookingNeeded: true, actionId: null },
    ],
    backupPlan: `如果下雨，改去${city}室内展览或商场，晚餐不变。`,
  };
}

function buildIndoorBackupPlan(input: PlannerInput): ActivityPlan {
  const { intent, candidates } = input;
  const city = intent.city || "杭州";
  const origin = intent.origin.label;
  const budget = intent.budgetMax ?? 400;
  const indoor = candidates.activities.find((item) => item.indoor);
  const restaurant = candidates.restaurants[0];
  const optionId = createId("option_indoor");

  return {
    id: optionId,
    planId: input.planId,
    title: `${city}室内备选方案`,
    targetGroup: intent.participantMode === "unknown" ? "solo" : intent.participantMode,
    score: 86,
    summary: `针对雨天/拥堵的低风险方案，从${origin}出发，减少户外和长距离转场。`,
    totalDurationMinutes: 240,
    totalCostMin: Math.round(budget * 0.5),
    totalCostMax: Math.round(budget * 0.85),
    walkingKm: 1.4,
    assumptions: ["优先室内", "餐厅需确认"],
    highlights: ["雨天友好", "路线短", "失败恢复成本低"],
    risks: ["室内活动库存需确认"],
    timeline: [
      { id: createId("step"), startTime: "14:00", endTime: "14:35", type: "travel", title: "出发到室内场所", poiId: null, poiName: origin, durationMinutes: 35, transport: "taxi", reasoning: "雨天减少户外暴露。", bookingNeeded: false, actionId: null },
      { id: createId("step"), startTime: "14:35", endTime: "16:30", type: "activity", title: indoor?.name ?? "室内活动", poiId: indoor?.id ?? null, poiName: indoor?.name ?? null, durationMinutes: 115, transport: "none", reasoning: "室内场所对雨天更稳妥。", bookingNeeded: indoor?.bookingRequired ?? true, actionId: null },
      { id: createId("step"), startTime: "17:00", endTime: "18:00", type: "meal", title: restaurant?.name ?? "同商圈晚餐", poiId: restaurant?.id ?? null, poiName: restaurant?.name ?? null, durationMinutes: 60, transport: "walk", reasoning: "同商圈减少转场风险。", bookingNeeded: true, actionId: null },
    ],
    backupPlan: "若室内活动无票，则保留餐厅并切换到商场休息/咖啡。",
  };
}

export async function generateLlmPlans(input: PlannerInput): Promise<ActivityPlan[]> {
  const llmProvider = input.providers?.llm;
  if (!llmProvider) {
    if (env.NODE_ENV === "production") {
      throw new Error("[planner] 鐢熶骇鐜蹇呴』鎻愪緵 llm provider");
    }
    console.warn("[planner] 鏃?llm provider锛宖allback 鍒?mock");
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
        console.warn(`[planner] LLM 杈撳嚭鏍￠獙澶辫触锛岄噸璇?(${attempt + 1}/${maxRetries}): ${lastError.message}`);
      }
    }
  }

  if (env.NODE_ENV !== "production") {
    console.warn(`[planner] LLM 鐢熸垚澶辫触锛宖allback 鍒?mock: ${lastError?.message}`);
    return generateMockPlans(input);
  }

  throw new Error(`[planner] LLM 鏂规鐢熸垚澶辫触: ${lastError?.message}`);
}

function buildLlmPrompt(input: PlannerInput): string {
  const { intent, candidates } = input;
  const weather = input.context.environment.weather;

  const candidateList = [
    ...candidates.activities,
    ...candidates.restaurants,
    ...candidates.events,
  ].map((c) => `- ${c.name} (${c.category}, ${c.address}, 璇勫垎${c.rating ?? "?"}, 浜哄潎${c.avgPrice ?? "?"}鍏?`).join("\n");

  return `鐢ㄦ埛闇€姹傦細
- 鍩庡競锛?{intent.city}
- 鍑哄彂鍦帮細${intent.origin.label}
- 鏃ユ湡锛?{intent.date ?? "鏈懆鍏?}
- 鍑哄彂鏃堕棿锛?{intent.departAt ?? "14:00"}
- 鍙備笌鑰咃細${intent.participantMode}锛?{intent.partySize}浜?- 鏃堕暱锛?{intent.durationHours[0]}-${intent.durationHours[1]}灏忔椂
- 棰勭畻涓婇檺锛?{intent.budgetMax ?? "涓嶉檺"}鍏?- 鍋忓ソ锛?{intent.preferences.length > 0 ? intent.preferences.join("銆?) : "鏃犵壒娈婂亸濂?}

澶╂皵锛?{weather.condition}锛?{weather.temperature}锛?{weather.suggestion}

鍊欓€夊湴鐐癸細
${candidateList || "锛堟棤鍊欓€夊湴鐐癸紝璇锋牴鎹煄甯傚拰闇€姹傛帹鑽愶級"}

璇疯緭鍑?JSON锛屾牸寮忥細
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

// 鈹€鈹€ Mock 鏂规鏋勫缓锛堜粎寮€鍙戠幆澧?fallback锛?鈹€鈹€

