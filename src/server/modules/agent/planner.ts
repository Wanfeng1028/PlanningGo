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

// ─── Time Helpers ─────────────────────────────────────────

/** 将 "HH:MM" 格式的时间转换为分钟数 */
function timeToMinutes(time: string): number {
  const m = time.match(/(\d{1,2})[：:](\d{2})/);
  if (!m) return 14 * 60; // fallback
  return parseInt(m[1]!, 10) * 60 + parseInt(m[2]!, 10);
}

/** 将分钟数转换为 "HH:MM" 格式 */
function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * 从 intent 中推算实际出发时间（HH:MM 格式）。
 * 优先使用 departAt（用户明确给的时间），其次按 timeWindow 给出合理默认。
 */
function resolveStartTime(intent: UserIntent): string {
  // Combine departAt and raw prompt for better time extraction
  const timeSources = [intent.departAt, intent.raw].filter(Boolean).join(" ");

  // 1. HH:MM or HH：MM format (e.g. "09:00", "14:30")
  const hm = timeSources.match(/(\d{1,2})[：:](\d{2})/);
  if (hm) {
    let hour = parseInt(hm[1]!, 10);
    if (/(下午|晚上|evening)/.test(timeSources) && hour < 12) hour += 12;
    return `${String(hour).padStart(2, "0")}:${hm[2]}`;
  }

  // 2. Chinese format "X点Y分" or "X点半" or "X点"
  const cnTime = timeSources.match(/(\d{1,2})\s*点\s*(半|(\d{1,2})分?)?/);
  if (cnTime) {
    let hour = parseInt(cnTime[1]!, 10);
    let minute = 0;
    if (cnTime[2] === "半") {
      minute = 30;
    } else if (cnTime[3]) {
      minute = parseInt(cnTime[3], 10);
    }
    // Adjust hour based on time window context
    if (/(下午|晚上|evening)/.test(timeSources) && hour < 12) {
      hour += 12;
    }
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }

  // 3. 按 timeWindow 给出合理默认
  switch (intent.timeWindow) {
    case "morning":   return "09:00";
    case "afternoon": return "14:00";
    case "evening":   return "18:00";
    case "full_day":  return "09:00";
    default:          return "14:00";
  }
}

/**
 * 根据 intent 动态生成方案标题，体现目的地和偏好。
 */
function buildPlanTitle(intent: UserIntent, fallbackLabel: string): string {
  const city = intent.city || "本地";
  const dest = intent.raw ? extractSpecificDestination(intent.raw) : null;
  const prefs = intent.preferences ?? [];

  // 尝试用偏好关键词拼标题
  const prefLabels: string[] = [];
  for (const p of prefs) {
    if (/咖啡/.test(p)) prefLabels.push("咖啡");
    else if (/火锅/.test(p)) prefLabels.push("火锅");
    else if (/烧烤/.test(p)) prefLabels.push("烧烤");
    else if (/看展|展览/.test(p)) prefLabels.push("看展");
    else if (/拍照/.test(p)) prefLabels.push("拍照");
    else if (/午饭|午餐/.test(p)) prefLabels.push("美食");
    else if (/晚饭|晚餐/.test(p)) prefLabels.push("美食");
  }
  const prefStr = [...new Set(prefLabels)].slice(0, 2).join("");

  if (dest && prefStr) return `${city}${dest}${prefStr}${fallbackLabel}`;
  if (dest) return `${city}${dest}${fallbackLabel}`;
  return `${city}${fallbackLabel}`;
}

/** 从用户原始输入中提取具体目的地（如 "天安门"、"西湖"） */
function extractSpecificDestination(raw: string): string | null {
  const patterns = [
    /去([^，,。.!！?？\s]{2,15})/,
    /到([^，,。.!！?？\s]{2,15})/,
    /目的地[：:]\s*(\S{2,15})/,
  ];
  for (const p of patterns) {
    const m = raw.match(p);
    if (m?.[1]) {
      const dest = m[1].replace(/[，,。.！!？?、]/g, "").trim();
      if (dest.length >= 2 && dest.length <= 15) return dest;
    }
  }
  return null;
}

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
  const hasUserOrigin = !!origin;
  const userBudget = intent.budgetMax;  // undefined = 用户未提供
  const budget = userBudget ?? 300;     // Default budget, never override user's explicit value
  const mode = intent.participantMode;
  const activity = candidates.events[0] ?? candidates.activities[0];
  const restaurant = candidates.restaurants[0];
  const optionId = createId("option_primary");
  const startTime = resolveStartTime(intent);

  // 动态标题：体现目的地 + 偏好
  const title = buildPlanTitle(intent, mode === "family" ? "家庭休闲半日游" : mode === "solo" ? "个人探索之旅" : "精选路线");

  // 预算描述：区分用户提供 vs 默认估算
  const budgetDisplay = userBudget !== undefined ? `￥${userBudget}` : undefined;
  const budgetAssumption = userBudget !== undefined
    ? `预算：${userBudget}元`
    : "未提供预算，暂按人均 200-300 估算，可继续调整";

  const summary = mode === "family"
    ? `基于${origin || "未知出发地"}出发，${city}周边${intent.distanceLimitMinutes}分钟交通圈内的家庭方案${budgetDisplay ? `，预算${budgetDisplay}` : ""}。`
    : mode === "solo"
      ? `基于${origin || "未知出发地"}出发，适合独自探索${city}的轻松路线${budgetDisplay ? `，预算${budgetDisplay}` : ""}。`
      : `基于${origin || "未知出发地"}出发，${city}周边精选路线${budgetDisplay ? `，预算${budgetDisplay}` : ""}。`;

  const highlights = mode === "family"
    ? ["亲子友好", "低步行负担", budgetAssumption]
    : mode === "solo"
      ? ["节奏自由", "可随时调整", budgetAssumption]
      : ["路线灵活", budgetAssumption];

  const walkingKm = mode === "family" ? 2.2 : 3.0;

  // 基于 startTime 计算后续时间
  const startMin = timeToMinutes(startTime);
  const t1 = minutesToTime(startMin);
  const t2 = minutesToTime(startMin + 40);
  const t3 = minutesToTime(startMin + 40 + 100);
  const t4 = minutesToTime(startMin + 40 + 100 + 40);
  const t5 = minutesToTime(startMin + 40 + 100 + 40 + 70);
  const t6 = minutesToTime(startMin + 40 + 100 + 40 + 70 + 30);

  // origin guard: 如果没有出发地，不生成导航类步骤
  const travelTitle = hasUserOrigin ? `从${origin}出发` : "前往目的地（出发地待确认）";
  const returnTitle = hasUserOrigin ? "返程" : "返程（出发地待确认）";

  const assumptions: string[] = [];
  if (hasUserOrigin) assumptions.push(`从${origin}出发`);
  else assumptions.push("出发地未提供，以下暂不估算交通时间");
  assumptions.push(budgetAssumption);

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
    assumptions,
    highlights,
    risks: ["餐厅高峰可能等位", "天气变化需关注"],
    timeline: [
      { id: createId("step"), startTime: t1, endTime: t2, type: "travel", title: travelTitle, poiId: null, poiName: hasUserOrigin ? origin : null, durationMinutes: 40, transport: hasUserOrigin ? "taxi" : "none", reasoning: hasUserOrigin ? "打车前往目的地，节省体力。" : "出发地未提供，交通方式待定。", bookingNeeded: false, actionId: null },
      { id: createId("step"), startTime: t2, endTime: t3, type: "activity", title: activity?.name ?? "景点游览", poiId: activity?.id ?? null, poiName: activity?.name ?? null, durationMinutes: 100, transport: "none", reasoning: "该时段人流量适中，适合游览。", bookingNeeded: activity?.bookingRequired ?? false, actionId: null },
      { id: createId("step"), startTime: t3, endTime: t4, type: "buffer", title: "休息与转场", poiId: null, poiName: null, durationMinutes: 40, transport: "walk", reasoning: "预留缓冲避免赶场。", bookingNeeded: false, actionId: null },
      { id: createId("step"), startTime: t4, endTime: t5, type: "meal", title: restaurant?.name ?? "晚餐", poiId: restaurant?.id ?? null, poiName: restaurant?.name ?? null, durationMinutes: 70, transport: "none", reasoning: "较早用餐避开高峰。", bookingNeeded: true, actionId: null },
      { id: createId("step"), startTime: t5, endTime: t6, type: "return", title: returnTitle, poiId: null, poiName: hasUserOrigin ? origin : null, durationMinutes: 30, transport: hasUserOrigin ? "taxi" : "none", reasoning: "保证总时长在合理范围内。", bookingNeeded: false, actionId: null },
    ],
    backupPlan: `如果天气不好，切换到${city}室内活动 + 同商圈晚餐。`,
  };
}

function buildFriendsPlan(input: PlannerInput): ActivityPlan {
  const { intent, candidates } = input;
  const _city = intent.city || "杭州";
  const origin = intent.origin.label;
  const hasUserOrigin = !!origin;
  const userBudget = intent.budgetMax;
  const budget = userBudget ?? 300; // Default budget, never override user's explicit value
  const activity = candidates.events[0] ?? candidates.activities[0];
  const restaurant = candidates.restaurants[0];
  const optionId = createId("option_friends");
  const startTime = resolveStartTime(intent);
  const startMin = timeToMinutes(startTime);
  const t1 = minutesToTime(startMin);
  const t2 = minutesToTime(startMin + 40);
  const t3 = minutesToTime(startMin + 40 + 80);
  const t4 = minutesToTime(startMin + 40 + 80 + 20 + 60);
  const t5 = minutesToTime(startMin + 40 + 80 + 20 + 60 + 40);

  const budgetAssumption = userBudget !== undefined
    ? `预算：${userBudget}元`
    : "未提供预算，暂按人均 200-300 估算，可继续调整";

  const assumptions: string[] = [];
  if (hasUserOrigin) assumptions.push(`从${origin}出发`);
  else assumptions.push("出发地未提供，以下暂不估算交通时间");
  assumptions.push(`默认 ${intent.partySize} 人`, budgetAssumption);

  return {
    id: optionId,
    planId: input.planId,
    title: buildPlanTitle(intent, "朋友小聚轻社交方案"),
    targetGroup: "friends",
    score: 88,
    summary: `适合多人${intent.timeWindow === "morning" ? "上午" : "下午"}轻社交${hasUserOrigin ? `，从${origin}出发` : ""}，优先同商圈${userBudget !== undefined ? `，预算${userBudget}元` : ""}。`,
    totalDurationMinutes: 310,
    totalCostMin: Math.round(budget * 0.6),
    totalCostMax: budget,
    walkingKm: 3.1,
    assumptions,
    highlights: ["适合多人同行", "可分享给朋友投票"],
    risks: ["餐厅 18:00 可能紧张"],
    timeline: [
      { id: createId("step"), startTime: t1, endTime: t2, type: "travel", title: hasUserOrigin ? "集合出发" : "集合（出发地待确认）", poiId: null, poiName: hasUserOrigin ? origin : null, durationMinutes: 40, transport: hasUserOrigin ? "mixed" : "none", reasoning: "同城集合优先同商圈。", bookingNeeded: false, actionId: null },
      { id: createId("step"), startTime: t2, endTime: t3, type: "event", title: activity?.name ?? "展览活动", poiId: activity?.id ?? null, poiName: activity?.name ?? null, durationMinutes: 80, transport: "none", reasoning: "适合聊天拍照，节奏轻松。", bookingNeeded: activity?.bookingRequired ?? false, actionId: null },
      { id: createId("step"), startTime: t3, endTime: t4, type: "activity", title: "同商圈休闲", poiId: null, poiName: null, durationMinutes: 60, transport: "walk", reasoning: "弹性时间可逛街或咖啡。", bookingNeeded: false, actionId: null },
      { id: createId("step"), startTime: t4, endTime: t5, type: "meal", title: restaurant?.name ?? "朋友晚餐", poiId: restaurant?.id ?? null, poiName: restaurant?.name ?? null, durationMinutes: 60, transport: "walk", reasoning: "同商圈方便聚餐返程。", bookingNeeded: true, actionId: null },
    ],
    backupPlan: "改为同商圈桌游/咖啡，晚餐时间不变。",
  };
}

function buildCouplePlan(input: PlannerInput): ActivityPlan {
  const { intent, candidates } = input;
  const city = intent.city || "杭州";
  const origin = intent.origin.label;
  const hasUserOrigin = !!origin;
  const userBudget = intent.budgetMax;
  const budget = userBudget ?? 300; // Default budget, never override user's explicit value
  const activity = candidates.activities[0];
  const restaurant = candidates.restaurants[0];
  const optionId = createId("option_couple");
  const startTime = resolveStartTime(intent);
  const startMin = timeToMinutes(startTime);
  const t1 = minutesToTime(startMin);
  const t2 = minutesToTime(startMin + 30);
  const t3 = minutesToTime(startMin + 30 + 120);
  const t4 = minutesToTime(startMin + 30 + 120 + 60);
  const t5 = minutesToTime(startMin + 30 + 120 + 60 + 30);
  const t6 = minutesToTime(startMin + 30 + 120 + 60 + 30 + 90);

  const budgetAssumption = userBudget !== undefined
    ? `预算：${userBudget}元`
    : "未提供预算，暂按人均 200-300 估算，可继续调整";

  const assumptions: string[] = [];
  if (hasUserOrigin) assumptions.push(`从${origin}出发`);
  else assumptions.push("出发地未提供，以下暂不估算交通时间");
  assumptions.push("默认 2 人", budgetAssumption);

  return {
    id: optionId,
    planId: input.planId,
    title: buildPlanTitle(intent, "情侣轻约会路线"),
    targetGroup: "couple",
    score: 89,
    summary: `适合双人的浪漫${city}半日游${hasUserOrigin ? `，从${origin}出发` : ""}${userBudget !== undefined ? `，预算${userBudget}元` : ""}。`,
    totalDurationMinutes: 300,
    totalCostMin: Math.round(budget * 0.5),
    totalCostMax: budget,
    walkingKm: 2.5,
    assumptions,
    highlights: ["浪漫氛围", "节奏轻松", "适合拍照打卡"],
    risks: ["热门餐厅需提前预约"],
    timeline: [
      { id: createId("step"), startTime: t1, endTime: t2, type: "travel", title: hasUserOrigin ? `从${origin}出发` : "前往目的地（出发地待确认）", poiId: null, poiName: hasUserOrigin ? origin : null, durationMinutes: 30, transport: hasUserOrigin ? "taxi" : "none", reasoning: "打车前往，轻松开始约会。", bookingNeeded: false, actionId: null },
      { id: createId("step"), startTime: t2, endTime: t3, type: "activity", title: activity?.name ?? "景点漫步", poiId: activity?.id ?? null, poiName: activity?.name ?? null, durationMinutes: 120, transport: "walk", reasoning: "光线好，适合拍照。", bookingNeeded: activity?.bookingRequired ?? false, actionId: null },
      { id: createId("step"), startTime: t3, endTime: t4, type: "buffer", title: "咖啡休息", poiId: null, poiName: null, durationMinutes: 60, transport: "walk", reasoning: "找家有情调的咖啡馆小坐。", bookingNeeded: false, actionId: null },
      { id: createId("step"), startTime: t5, endTime: t6, type: "meal", title: restaurant?.name ?? "浪漫晚餐", poiId: restaurant?.id ?? null, poiName: restaurant?.name ?? null, durationMinutes: 90, transport: "walk", reasoning: "提前预约好位子。", bookingNeeded: true, actionId: null },
    ],
    backupPlan: `如果下雨，改去${city}室内展览或商场，晚餐不变。`,
  };
}

function buildIndoorBackupPlan(input: PlannerInput): ActivityPlan {
  const { intent, candidates } = input;
  const _city = intent.city || "杭州";
  const origin = intent.origin.label;
  const hasUserOrigin = !!origin;
  const userBudget = intent.budgetMax;
  const budget = userBudget ?? 300; // Default budget, never override user's explicit value
  const indoor = candidates.activities.find((item) => item.indoor);
  const restaurant = candidates.restaurants[0];
  const optionId = createId("option_indoor");
  const startTime = resolveStartTime(intent);
  const startMin = timeToMinutes(startTime);
  const t1 = minutesToTime(startMin);
  const t2 = minutesToTime(startMin + 35);
  const t3 = minutesToTime(startMin + 35 + 115);
  const t4 = minutesToTime(startMin + 35 + 115 + 25);
  const t5 = minutesToTime(startMin + 35 + 115 + 25 + 60);

  const budgetAssumption = userBudget !== undefined
    ? `预算：${userBudget}元`
    : "未提供预算，暂按人均 200-300 估算，可继续调整";

  const assumptions: string[] = [];
  if (hasUserOrigin) assumptions.push(`从${origin}出发`);
  else assumptions.push("出发地未提供，以下暂不估算交通时间");
  assumptions.push("优先室内", budgetAssumption);

  return {
    id: optionId,
    planId: input.planId,
    title: buildPlanTitle(intent, "室内备选方案"),
    targetGroup: intent.participantMode === "unknown" ? "solo" : intent.participantMode,
    score: 86,
    summary: `针对雨天/拥堵的低风险方案${hasUserOrigin ? `，从${origin}出发` : ""}，减少户外和长距离转场${userBudget !== undefined ? `，预算${userBudget}元` : ""}。`,
    totalDurationMinutes: 240,
    totalCostMin: Math.round(budget * 0.5),
    totalCostMax: Math.round(budget * 0.85),
    walkingKm: 1.4,
    assumptions,
    highlights: ["雨天友好", "路线短", "失败恢复成本低"],
    risks: ["室内活动库存需确认"],
    timeline: [
      { id: createId("step"), startTime: t1, endTime: t2, type: "travel", title: hasUserOrigin ? "出发到室内场所" : "前往室内场所（出发地待确认）", poiId: null, poiName: hasUserOrigin ? origin : null, durationMinutes: 35, transport: hasUserOrigin ? "taxi" : "none", reasoning: "雨天减少户外暴露。", bookingNeeded: false, actionId: null },
      { id: createId("step"), startTime: t2, endTime: t3, type: "activity", title: indoor?.name ?? "室内活动", poiId: indoor?.id ?? null, poiName: indoor?.name ?? null, durationMinutes: 115, transport: "none", reasoning: "室内场所对雨天更稳妥。", bookingNeeded: indoor?.bookingRequired ?? true, actionId: null },
      { id: createId("step"), startTime: t4, endTime: t5, type: "meal", title: restaurant?.name ?? "同商圈晚餐", poiId: restaurant?.id ?? null, poiName: restaurant?.name ?? null, durationMinutes: 60, transport: "walk", reasoning: "同商圈减少转场风险。", bookingNeeded: true, actionId: null },
    ],
    backupPlan: "若室内活动无票，则保留餐厅并切换到商场休息/咖啡。",
  };
}

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
- 出发地：${intent.origin.label || "未提供"}
- 日期：${intent.date ?? "本周末"}
- 出发时间：${intent.departAt ?? resolveStartTime(intent)}
- 参与者：${intent.participantMode}，${intent.partySize}人
- 时长：${intent.durationHours[0]}-${intent.durationHours[1]}小时
- 预算上限：${intent.budgetMax !== undefined ? `${intent.budgetMax}元（用户明确提供，请严格遵守）` : "用户未提供预算，请按中等消费水平合理估算，并在 assumptions 中标注"}
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

// --- Mock 方案构建（仅开发环境 fallback）---
