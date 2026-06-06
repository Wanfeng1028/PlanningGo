import { createId } from "../../common/id";
import { env } from "../../config/env";
import { sanitizeHtmlForRender } from "../../common/ugcSanitizer";
import type { ActivityPlan, UserIntent, PlanningProviders } from "../planning/schemas";
import type { PlanningContext } from "../planning/contextBuilder";
import type { CandidatePool } from "../planning/candidateGenerator";
import type { LlmQuery } from "../../providers/types";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

// ─── Single Source of Truth: Zod Schema ──────────────────────
// The Zod schema below is the ONLY place to define the LLM output shape.
// `llmPlanJsonSchema` is derived automatically, ensuring prompt ↔ validation consistency.

/** LLM 返回的原始 schema（用于 zod 校验） */
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
    /** LLM 必须输出 HH:MM 格式（24 小时制），如 "14:00"。非标准格式会被 repairer 重试修正。 */
    startTime: z.string().regex(/^\d{1,2}:\d{2}$/, "startTime 必须为 HH:MM 格式，如 14:00"),
    /** LLM 必须输出 HH:MM 格式（24 小时制），如 "15:30"。非标准格式会被 repairer 重试修正。 */
    endTime: z.string().regex(/^\d{1,2}:\d{2}$/, "endTime 必须为 HH:MM 格式，如 15:30"),
    type: z.enum(["travel", "activity", "meal", "movie", "event", "buffer", "return", "rest"]),
    title: z.string(),
    poiName: z.string().nullable().default(null),
    durationMinutes: z.number().int().positive(),
    transport: z.enum(["driving", "taxi", "subway", "walk", "mixed", "none"]).default("none"),
    reasoning: z.string(),
    bookingNeeded: z.boolean().default(false),
    /* Phase 2: enhanced step detail fields */
    description: z.string().optional(),
    estimatedCost: z.string().optional(),
    bookingHint: z.string().optional(),
    suggestions: z.array(z.string()).optional(),
    /* V4: deep step detail fields */
    whyRecommended: z.string().optional(),
    recommendedItems: z.array(z.string()).optional(),
    bookingAdvice: z.string().optional(),
    queueRisk: z.enum(["low", "medium", "high", "unknown"]).optional(),
    businessHours: z.string().optional(),
    actionHints: z.array(z.string()).optional(),
    fallbackPois: z.array(z.string()).optional(),
  })).min(2),
  backupPlan: z.string().optional(),
});

const llmOutputSchema = z.object({
  // LLM 可能因 token/上下文限制只输出 1-2 套；运行时会补齐到 3 套以满足产品链路要求
  plans: z.array(llmPlanItemSchema).min(1).max(3),
});

/**
 * Auto-derived JSON Schema from Zod — used in the LLM prompt as a structured example.
 * Single source of truth: adding a field here automatically updates the prompt.
 */
const llmPlanJsonSchema = JSON.stringify(zodToJsonSchema(llmOutputSchema), null, 2) as string;

export interface PlannerInput {
  traceId: string;
  planId: string;
  intent: UserIntent;
  context: PlanningContext;
  candidates: CandidatePool;
  providers?: PlanningProviders;
  signal?: AbortSignal;
}

const SYSTEM_PROMPT = `你是"周末去哪儿"的行程规划 AI。用户会告诉你出行需求，你需要生成 3 套差异化的可执行行程方案。

严格要求：
1. 只输出 JSON，不要输出任何其他文字
2. 不要输出推理链、思考过程、分析步骤
3. 每个方案的 timeline 必须合理衔接，时间不能重叠
4. 所有地点必须基于提供的候选 POI 列表，不要编造地点
5. reasoning 字段简要说明"为什么安排这个步骤"，不超过 50 字
6. 评分基于可行性、用户匹配度、风险控制
7. 3 套方案应有明显差异（如主题、节奏、预算），不要只微调人数

具体性要求（最重要）：
8. title 必须是具体店铺/景点名称，禁止使用泛化描述如"景点游览""在附近用餐""找家咖啡店"
9. description 必须给出具体推荐：餐厅写推荐菜品名（如毛肚、鸭血、肥牛），咖啡店写推荐饮品名（如冰拿铁、生椰拿铁）
10. recommendedItems 必须列出 2-4 个具体推荐菜品/饮品名称
11. whyRecommended 必须说明为什么推荐这家（如"离断桥步行3分钟，适合一人短暂停留"）
12. bookingAdvice 必须写具体预约方式（如"美团APP预约""电话0571-XXXX""无需预约，到店即可"）
13. queueRisk 必须评估排队风险（low/medium/high），用餐高峰必须标 medium 或 high
14. businessHours 必须填写营业时间（如果知道的话）
15. actionHints 必须给出可执行动作（如"打开美团下单""导航到店""电话预约"）
16. fallbackPois 必须给出 2-3 个附近备选店铺名称
17. estimatedCost 必须给出该步骤的预估花费（如"人均 80 元"、"25-38 元"、"免费"）
18. suggestions 字段给出贴心建议（如"带相机"、"穿运动鞋"、"适合拍照"）

请严格按照以下 JSON Schema 输出（不要输出 Schema 本身，只输出符合该结构的 JSON 数据）：
${llmPlanJsonSchema}

示例（好的输出）：
{
  "title": "去 %Arabica 西湖店喝一杯",
  "poiName": "%Arabica 西湖店",
  "description": "推荐冰拿铁和西班牙拿铁，离断桥步行3分钟，适合一人短暂停留",
  "estimatedCost": "25-38元",
  "recommendedItems": ["冰拿铁", "西班牙拿铁"],
  "whyRecommended": "离断桥近，适合一个人短暂停留，出品稳定",
  "bookingAdvice": "无需预约，到店点单",
  "queueRisk": "medium",
  "businessHours": "08:00-20:00",
  "actionHints": ["导航到店", "打开美团搜索"],
  "fallbackPois": ["Manner 西湖店", "Seesaw Coffee 湖滨店"]
}`;

// ─── Time Helpers ─────────────────────────────────────────

/** 将 "HH:MM" 格式的时间转换为分钟数 */
export function timeToMinutes(time: string): number {
  const m = time.match(/(\d{1,2})[：:](\d{2})/);
  if (!m) return 14 * 60; // fallback
  return parseInt(m[1]!, 10) * 60 + parseInt(m[2]!, 10);
}

/** 将分钟数转换为 "HH:MM" 格式 */
export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Sanitize user input for LLM prompts to prevent prompt injection.
 * Uses XML-like tags to isolate user content and HTML entity encoding.
 */
function sanitizeUserInput(input: string): string {
  // HTML entity encoding to prevent injection
  const sanitized = sanitizeHtmlForRender(input);
  // Truncate to prevent excessive token usage
  return sanitized.slice(0, 2000);
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
 * 根据用户意图的 participantMode 动态选择方案模板，始终返回 3 套差异化方案。
 */
export function generateMockPlans(input: PlannerInput): ActivityPlan[] {
  const mode = input.intent.participantMode;
  const specifiedRoute = buildSpecifiedRoutePlan(input);
  const primary = buildPrimaryPlan(input);
  const backup = buildIndoorBackupPlan(input);
  const foodie = buildSocialFoodiePlan(input);

  if (specifiedRoute) {
    return [specifiedRoute, backup, foodie];
  }

  if (mode === "friends") {
    return [buildFriendsPlan(input), foodie, backup];
  }
  if (mode === "couple") {
    return [buildCouplePlan(input), foodie, backup];
  }
  // family, solo, unknown 均走通用主方案
  return [primary, foodie, backup];
}

function buildSpecifiedRoutePlan(input: PlannerInput): ActivityPlan | null {
  const { intent } = input;
  const routeStops = intent.routeStops.filter((stop) => stop && stop !== intent.origin.label);
  if (routeStops.length < 2) return null;

  const optionId = createId("option_route");
  const startTime = resolveStartTime(intent);
  let cursor = timeToMinutes(startTime);
  const transport = intent.transportMode === "subway" || intent.transportMode === "transit"
    ? "subway"
    : intent.transportMode === "driving"
      ? "driving"
      : intent.transportMode === "walk"
        ? "walk"
        : "taxi";
  const timeline: ActivityPlan["timeline"] = [];
  const origin = intent.origin.label;
  const returnPoint = intent.returnPoint || origin;

  const addStep = (inputStep: Omit<ActivityPlan["timeline"][number], "id" | "actionId">) => {
    timeline.push({ ...inputStep, id: createId("step"), actionId: null });
  };

  const firstStop = routeStops[0]!;
  addStep({
    startTime,
    endTime: minutesToTime(cursor + 35),
    type: "travel",
    title: `从${origin}出发去${firstStop}`,
    poiId: null,
    poiName: firstStop,
    durationMinutes: 35,
    transport,
    reasoning: "用户已指定出发地和第一站，优先按原路线执行。",
    bookingNeeded: false,
    description: `从${origin}前往${firstStop}，建议出发前打开导航确认实时路况。`,
    estimatedCost: transport === "subway" ? "地铁约3-8元" : transport === "walk" ? "免费" : "打车约35-60元",
    suggestions: ["出发前确认实时路况", "保留10分钟缓冲"],
  });
  cursor += 35;

  for (let index = 0; index < routeStops.length; index += 1) {
    const stop = routeStops[index]!;
    const detail = buildSpecifiedStopDetail(stop, intent);
    addStep({
      startTime: minutesToTime(cursor),
      endTime: minutesToTime(cursor + detail.durationMinutes),
      type: detail.type,
      title: detail.title,
      poiId: null,
      poiName: stop,
      durationMinutes: detail.durationMinutes,
      transport: "none",
      reasoning: detail.reasoning,
      bookingNeeded: detail.bookingNeeded,
      description: detail.description,
      estimatedCost: detail.estimatedCost,
      bookingHint: detail.bookingHint,
      suggestions: detail.suggestions,
      whyRecommended: detail.whyRecommended,
      recommendedItems: detail.recommendedItems,
      bookingAdvice: detail.bookingAdvice,
      queueRisk: detail.queueRisk,
      businessHours: detail.businessHours,
      actionHints: detail.actionHints,
      fallbackPois: detail.fallbackPois,
    });
    cursor += detail.durationMinutes;

    if (index === 0 && intent.foodPreferences.some((item) => /咖啡|奶茶/.test(item)) && !/咖啡|奶茶|星巴克|瑞幸|喜茶|奈雪|霸王茶姬/.test(stop)) {
      addStep({
        startTime: minutesToTime(cursor),
        endTime: minutesToTime(cursor + 35),
        type: "rest",
        title: `${stop}附近咖啡/饮品补给`,
        poiId: null,
        poiName: `${stop}附近咖啡店`,
        durationMinutes: 35,
        transport: "walk",
        reasoning: "用户明确提到喝咖啡，安排在首个景点后短暂停留。",
        bookingNeeded: false,
        description: `在${stop}附近选择咖啡或茶饮，推荐生椰拿铁、冰拿铁或低糖茶饮。`,
        estimatedCost: "约20-45元",
        suggestions: ["优先选择离下一站近的门店", "可提前查看排队"],
        whyRecommended: "放在游览后补充体力，不影响后续前往下一站。",
        recommendedItems: ["生椰拿铁", "冰拿铁", "低糖茶饮"],
        bookingAdvice: "无需预约，可生成下单草稿后由用户到平台确认",
        queueRisk: "medium",
        businessHours: "08:00-22:00，具体以门店为准",
        actionHints: ["生成下单草稿", "打开平台确认支付", "导航到店"],
        fallbackPois: ["Manner Coffee", "%Arabica", "瑞幸咖啡"],
      });
      cursor += 35;
    }

    const nextStop = routeStops[index + 1];
    if (nextStop) {
      addStep({
        startTime: minutesToTime(cursor),
        endTime: minutesToTime(cursor + 25),
        type: "travel",
        title: `前往${nextStop}`,
        poiId: null,
        poiName: nextStop,
        durationMinutes: 25,
        transport,
        reasoning: "按用户指定顺序继续前往下一站。",
        bookingNeeded: false,
        description: `从${stop}前往${nextStop}，实际耗时以地图实时路线为准。`,
        estimatedCost: transport === "subway" ? "地铁约3-8元" : transport === "walk" ? "免费" : "打车约20-45元",
        suggestions: ["出发前打开导航确认入口"],
      });
      cursor += 25;
    }
  }

  if (returnPoint) {
    addStep({
      startTime: minutesToTime(cursor),
      endTime: minutesToTime(cursor + 35),
      type: "return",
      title: `返回${returnPoint}`,
      poiId: null,
      poiName: returnPoint,
      durationMinutes: 35,
      transport,
      reasoning: "用户明确要求回到起点，安排回程闭环。",
      bookingNeeded: false,
      description: `从最后一站返回${returnPoint}，建议到点前确认实时路线。`,
      estimatedCost: transport === "subway" ? "地铁约3-8元" : transport === "walk" ? "免费" : "打车约35-60元",
      suggestions: ["返程前确认打车排队情况"],
    });
    cursor += 35;
  }

  const hasBudget = typeof intent.budgetMax === "number";
  const assumptions = [
    `按用户指定路线执行：${[origin, ...routeStops, returnPoint].filter(Boolean).join(" → ")}`,
    hasBudget ? `预算上限：${intent.budgetMax}元` : "用户未提供预算，先按一人半日 250-450 元估算",
    "门票、预约、排队和价格以第三方平台最终页面为准",
  ];

  return {
    id: optionId,
    planId: input.planId,
    title: `${intent.city}${routeStops[0]}细致执行路线`,
    targetGroup: intent.participantMode === "unknown" ? "solo" : intent.participantMode,
    score: 92,
    summary: `按你指定的${routeStops.join(" → ")}顺序安排，包含交通、游玩、饮品/用餐和回程动作。`,
    totalDurationMinutes: cursor - timeToMinutes(startTime),
    totalCostMin: hasBudget ? Math.round(intent.budgetMax! * 0.55) : 250,
    totalCostMax: hasBudget ? intent.budgetMax! : 450,
    walkingKm: 2.8,
    assumptions,
    highlights: ["严格按用户路线排序", "每站带执行动作", "交易类仅生成草稿"],
    risks: ["景区/寺庙预约和门票需平台确认", "海底捞高峰可能排队", "价格以第三方平台为准"],
    timeline,
    backupPlan: "若灵隐寺门票或预约不可用，改为西湖周边咖啡 + 湖滨慢逛 + 提前去海底捞取号。",
  };
}

function buildSpecifiedStopDetail(stop: string, intent: UserIntent): {
  type: ActivityPlan["timeline"][number]["type"];
  title: string;
  durationMinutes: number;
  reasoning: string;
  bookingNeeded: boolean;
  description: string;
  estimatedCost: string;
  bookingHint?: string;
  suggestions: string[];
  whyRecommended: string;
  recommendedItems?: string[];
  bookingAdvice: string;
  queueRisk: ActivityPlan["timeline"][number]["queueRisk"];
  businessHours?: string;
  actionHints: string[];
  fallbackPois: string[];
} {
  if (/海底捞|火锅|餐厅|饭店/.test(stop)) {
    return {
      type: "meal",
      title: `${stop}用餐`,
      durationMinutes: 80,
      reasoning: "用户指定晚些时候吃海底捞，需预留排队和用餐时间。",
      bookingNeeded: true,
      description: `安排${stop}用餐，推荐提前在美团/海底捞小程序查看排队、预约和套餐。`,
      estimatedCost: intent.partySize <= 1 ? "一人约120-180元" : `约人均120-180元，共${intent.partySize}人`,
      bookingHint: "建议提前取号或预约，最终以平台确认为准",
      suggestions: ["先取号再前往", "避开19:00-20:00高峰"],
      whyRecommended: "用户明确指定海底捞，适合作为行程末段正餐。",
      recommendedItems: ["番茄锅", "毛肚", "捞派肥牛", "小酥肉"],
      bookingAdvice: "生成预约草稿，跳转美团/海底捞页面由用户确认",
      queueRisk: "high",
      businessHours: "10:00-次日02:00，具体以门店为准",
      actionHints: ["生成预约草稿", "打开美团确认", "导航到店"],
      fallbackPois: ["凑凑火锅", "湊湊火锅", "新白鹿餐厅"],
    };
  }
  if (/咖啡|奶茶|星巴克|瑞幸|喜茶|奈雪|霸王茶姬/.test(stop)) {
    return {
      type: "rest",
      title: `在${stop}附近喝咖啡/饮品`,
      durationMinutes: 40,
      reasoning: "用户希望行程中喝咖啡，安排短暂停留补充体力。",
      bookingNeeded: false,
      description: `在${stop}附近选择咖啡或茶饮，推荐生椰拿铁、冰拿铁或低糖茶饮。`,
      estimatedCost: "约20-45元",
      suggestions: ["优先选离下一站近的门店", "可提前在平台查看排队"],
      whyRecommended: "作为游览间隙停留点，节奏轻，不影响后续行程。",
      recommendedItems: ["生椰拿铁", "冰拿铁", "低糖茶饮"],
      bookingAdvice: "无需预约，可生成下单草稿后由用户到平台确认",
      queueRisk: "medium",
      businessHours: "08:00-22:00，具体以门店为准",
      actionHints: ["生成下单草稿", "打开平台确认支付", "导航到店"],
      fallbackPois: ["Manner Coffee", "%Arabica", "瑞幸咖啡"],
    };
  }
  if (/灵隐寺|寺|景区|公园|西湖/.test(stop)) {
    const isTemple = /灵隐寺|寺/.test(stop);
    return {
      type: "activity",
      title: `${stop}游览`,
      durationMinutes: isTemple ? 75 : 85,
      reasoning: "用户明确指定该景点，安排足够游览和拍照时间。",
      bookingNeeded: isTemple,
      description: isTemple
        ? `${stop}通常涉及景区/寺庙预约或门票，建议先确认开放、门票和入园要求。`
        : `${stop}按轻松路线游览，建议选择入口清晰、步行压力较低的路线。`,
      estimatedCost: isTemple ? "门票/香花券以平台为准" : "免费，部分项目另计",
      bookingHint: isTemple ? "需跳转平台确认门票/预约，不自动购票" : "无需预约，热门时段注意人流",
      suggestions: isTemple ? ["提前确认入园要求", "保留安检和步行时间"] : ["带相机", "穿舒适鞋"],
      whyRecommended: "用户明确指定，属于本次行程核心目的地。",
      recommendedItems: isTemple ? ["门票预约", "导航入口"] : ["断桥方向", "湖滨步道"],
      bookingAdvice: isTemple ? "生成购票/预约入口，用户到第三方平台确认" : "现场游览，必要时查看团购/门票入口",
      queueRisk: isTemple ? "medium" : "low",
      businessHours: isTemple ? "约07:00-18:00，具体以景区公告为准" : "开放空间，具体以景区公告为准",
      actionHints: isTemple ? ["查看门票/预约", "打开导航"] : ["打开导航", "查看附近入口"],
      fallbackPois: isTemple ? ["飞来峰景区", "法喜寺", "北高峰"] : ["断桥残雪", "湖滨步行街", "曲院风荷"],
    };
  }
  return {
    type: "activity",
    title: `${stop}停留`,
    durationMinutes: 50,
    reasoning: "用户指定该站点，纳入路线。",
    bookingNeeded: false,
    description: `在${stop}停留并根据现场情况调整节奏。`,
    estimatedCost: "费用待平台确认",
    suggestions: ["到达前确认开放状态"],
    whyRecommended: "用户明确指定。",
    bookingAdvice: "如涉及预约或门票，请跳转平台确认",
    queueRisk: "unknown",
    actionHints: ["打开导航", "复制地点信息"],
    fallbackPois: [],
  };
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
  const cafe = candidates.cafes[0];
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
      { id: createId("step"), startTime: t1, endTime: t2, type: "travel", title: travelTitle, poiId: null, poiName: hasUserOrigin ? origin : null, durationMinutes: 40, transport: hasUserOrigin ? "taxi" : "none", reasoning: hasUserOrigin ? "打车前往目的地，节省体力。" : "出发地未提供，交通方式待定。", bookingNeeded: false, actionId: null, description: hasUserOrigin ? `从${origin}打车前往${city}目的地，约40分钟` : "前往目的地，交通方式待确认", estimatedCost: hasUserOrigin ? "打车约30-50元" : undefined, suggestions: hasUserOrigin ? ["提前叫车避开高峰"] : [] },
      { id: createId("step"), startTime: t2, endTime: t3, type: "activity", title: activity?.name ?? "景点游览", poiId: activity?.id ?? null, poiName: activity?.name ?? null, durationMinutes: 100, transport: "none", reasoning: "该时段人流量适中，适合游览。", bookingNeeded: activity?.bookingRequired ?? false, actionId: null, description: activity?.name ? `游览${activity.name}，建议按推荐路线参观` : "参观景点，建议预留拍照时间", estimatedCost: activity?.avgPrice ? `人均${activity.avgPrice}元` : "免费或门票待定", bookingHint: activity?.bookingRequired ? "建议提前1天在线预约" : undefined, suggestions: ["穿舒适运动鞋", "带相机拍照"] },
      { id: createId("step"), startTime: t3, endTime: t4, type: "buffer", title: cafe?.name ?? "休息与转场", poiId: cafe?.id ?? null, poiName: cafe?.name ?? null, durationMinutes: 40, transport: "walk", reasoning: "预留缓冲避免赶场。", bookingNeeded: false, actionId: null, description: cafe?.name ? `去${cafe.name}休息，${cafe.recommendedItems?.length ? `推荐${cafe.recommendedItems.join("、")}` : "喝杯咖啡放松一下"}` : "在景点周边找家咖啡店休息", estimatedCost: cafe?.avgPrice ? `人均${cafe.avgPrice}元` : "约20-30元", suggestions: cafe?.name ? ["导航到店", cafe.recommendedItems?.[0] ? `试试${cafe.recommendedItems[0]}` : "看看菜单"] : ["找家咖啡店歇脚"], whyRecommended: cafe?.name ? `步行${cafe.distanceMinutes ?? 5}分钟可达，适合短暂休息` : "需地图确认具体地点", recommendedItems: cafe?.recommendedItems, bookingAdvice: cafe?.reservationHints ?? "无需预约，到店即可", queueRisk: cafe?.queueRisk ?? "low", businessHours: cafe?.openingHours, actionHints: cafe ? ["导航到店", cafe.deepLink ? "打开小程序下单" : "到店点单"].filter(Boolean) : ["导航到店"], fallbackPois: candidates.cafes.filter((c) => c.id !== cafe?.id).slice(0, 3).map((c) => c.name) },
      { id: createId("step"), startTime: t4, endTime: t5, type: "meal", title: restaurant?.name ?? "晚餐", poiId: restaurant?.id ?? null, poiName: restaurant?.name ?? null, durationMinutes: 70, transport: "none", reasoning: "较早用餐避开高峰。", bookingNeeded: true, actionId: null, description: restaurant?.name ? `${restaurant.name}用餐，${restaurant.recommendedItems?.length ? `推荐${restaurant.recommendedItems.join("、")}` : "推荐招牌菜"}` : "在目的地附近用餐", estimatedCost: restaurant?.avgPrice ? `人均${restaurant.avgPrice}元` : "人均80-120元", bookingHint: "建议提前1天预约餐位", suggestions: ["较早到店避开排队高峰"], whyRecommended: restaurant?.name ? `目的地附近${restaurant.rating ? `评分${restaurant.rating}` : ""}的餐厅` : "需地图确认具体地点", recommendedItems: restaurant?.recommendedItems, bookingAdvice: restaurant?.bookingRequired ? "建议提前1天通过美团APP或电话预约" : "无需预约，现场排队", queueRisk: restaurant?.queueRisk ?? "medium", businessHours: restaurant?.openingHours ?? "10:00-22:00", actionHints: restaurant ? ["打开美团/大众点评查看", "导航到店", restaurant.tel ? `电话${restaurant.tel}预约` : "在线预约"].filter(Boolean) : ["导航到店"], fallbackPois: candidates.restaurants.filter((r) => r.id !== restaurant?.id).slice(0, 3).map((r) => r.name) },
      { id: createId("step"), startTime: t5, endTime: t6, type: "return", title: returnTitle, poiId: null, poiName: hasUserOrigin ? origin : null, durationMinutes: 30, transport: hasUserOrigin ? "taxi" : "none", reasoning: "保证总时长在合理范围内。", bookingNeeded: false, actionId: null, description: hasUserOrigin ? `打车返回${origin}` : "返程", estimatedCost: hasUserOrigin ? "打车约30-50元" : undefined, suggestions: ["避开晚高峰打车更顺畅"] },
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
  const cafe = candidates.cafes[0] ?? candidates.cafes[1];
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
      { id: createId("step"), startTime: t1, endTime: t2, type: "travel", title: hasUserOrigin ? "集合出发" : "集合（出发地待确认）", poiId: null, poiName: hasUserOrigin ? origin : null, durationMinutes: 40, transport: hasUserOrigin ? "mixed" : "none", reasoning: "同城集合优先同商圈。", bookingNeeded: false, actionId: null, description: hasUserOrigin ? `从${origin}集合出发前往同商圈` : "前往集合地点，出发地待确认", estimatedCost: hasUserOrigin ? "地铁/打车约10-30元" : undefined, suggestions: hasUserOrigin ? ["提前15分钟到集合点"] : [] },
      { id: createId("step"), startTime: t2, endTime: t3, type: "event", title: activity?.name ?? "展览活动", poiId: activity?.id ?? null, poiName: activity?.name ?? null, durationMinutes: 80, transport: "none", reasoning: "适合聊天拍照，节奏轻松。", bookingNeeded: activity?.bookingRequired ?? false, actionId: null, description: activity?.name ? `参观${activity.name}，适合拍照打卡` : "参观展览活动，预留拍照时间", estimatedCost: activity?.avgPrice ? `人均${activity.avgPrice}元` : "免费或门票待定", bookingHint: activity?.bookingRequired ? "建议提前1天在线预约" : undefined, suggestions: ["适合多人拍照", "穿舒适鞋子"] },
      { id: createId("step"), startTime: t3, endTime: t4, type: "activity", title: cafe?.name ?? "同商圈休闲", poiId: cafe?.id ?? null, poiName: cafe?.name ?? null, durationMinutes: 60, transport: "walk", reasoning: "弹性时间可聊天或咖啡。", bookingNeeded: false, actionId: null, description: cafe?.name ? `去${cafe.name}，${cafe.recommendedItems?.length ? `推荐${cafe.recommendedItems.join("、")}` : "找杯喜欢的饮品聊天"}` : "在商圈内找家咖啡店聊天", estimatedCost: cafe?.avgPrice ? `人均${cafe.avgPrice}元` : "约20-50元/人", suggestions: ["找个舒适的座位聊天", "适合多人拍照"], whyRecommended: cafe?.name ? `同商圈内，步行可达，适合朋友聚会` : "需地图确认", recommendedItems: cafe?.recommendedItems, bookingAdvice: "无需预约", queueRisk: cafe?.queueRisk ?? "low", businessHours: cafe?.openingHours, actionHints: cafe ? ["导航到店", "到店点单"].filter(Boolean) : ["导航到店"], fallbackPois: candidates.cafes.filter((c) => c.id !== cafe?.id).slice(0, 3).map((c) => c.name) },
      { id: createId("step"), startTime: t4, endTime: t5, type: "meal", title: restaurant?.name ?? "朋友晚餐", poiId: restaurant?.id ?? null, poiName: restaurant?.name ?? null, durationMinutes: 60, transport: "walk", reasoning: "同商圈方便聚餐返程。", bookingNeeded: true, actionId: null, description: restaurant?.name ? `${restaurant.name}聚餐，${restaurant.recommendedItems?.length ? `推荐${restaurant.recommendedItems.join("、")}` : "推荐招牌菜"}` : "在商圈内聚餐", estimatedCost: restaurant?.avgPrice ? `人均${restaurant.avgPrice}元` : "人均80-150元", bookingHint: "建议提前1天预约餐位", suggestions: ["适合多人包间", "较早到店避开排队"], whyRecommended: restaurant?.name ? `同商圈内方便聚餐，适合多人` : "需地图确认", recommendedItems: restaurant?.recommendedItems, bookingAdvice: "建议提前1天通过美团APP预约", queueRisk: restaurant?.queueRisk ?? "medium", businessHours: restaurant?.openingHours ?? "10:00-22:00", actionHints: restaurant ? ["打开美团/大众点评查看", "导航到店", restaurant.tel ? `电话${restaurant.tel}预约` : "在线预约"].filter(Boolean) : ["导航到店"], fallbackPois: candidates.restaurants.filter((r) => r.id !== restaurant?.id).slice(0, 3).map((r) => r.name) },
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
  const cafe = candidates.cafes[0] ?? candidates.cafes[1];
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
      { id: createId("step"), startTime: t1, endTime: t2, type: "travel", title: hasUserOrigin ? `从${origin}出发` : "前往目的地（出发地待确认）", poiId: null, poiName: hasUserOrigin ? origin : null, durationMinutes: 30, transport: hasUserOrigin ? "taxi" : "none", reasoning: "打车前往，轻松开始约会。", bookingNeeded: false, actionId: null, description: hasUserOrigin ? `从${origin}打车前往约会地点` : "前往约会目的地", estimatedCost: hasUserOrigin ? "打车约20-40元" : undefined, suggestions: hasUserOrigin ? ["提前叫车"] : [] },
      { id: createId("step"), startTime: t2, endTime: t3, type: "activity", title: activity?.name ?? "景点漫步", poiId: activity?.id ?? null, poiName: activity?.name ?? null, durationMinutes: 120, transport: "walk", reasoning: "光线好，适合拍照。", bookingNeeded: activity?.bookingRequired ?? false, actionId: null, description: activity?.name ? `漫步${activity.name}，适合拍照打卡` : "在景点周边漫步，享受二人时光", estimatedCost: activity?.avgPrice ? `人均${activity.avgPrice}元` : "免费", bookingHint: activity?.bookingRequired ? "建议提前预约" : undefined, suggestions: ["穿舒适鞋子", "带相机", "适合拍照打卡"] },
      { id: createId("step"), startTime: t3, endTime: t4, type: "buffer", title: cafe?.name ?? "咖啡休息", poiId: cafe?.id ?? null, poiName: cafe?.name ?? null, durationMinutes: 60, transport: "walk", reasoning: "找家有情调的咖啡馆小坐。", bookingNeeded: false, actionId: null, description: cafe?.name ? `去${cafe.name}，${cafe.recommendedItems?.length ? `推荐${cafe.recommendedItems.join("、")}` : "选一杯喜欢的饮品小坐聊天"}` : "找一家有情调的咖啡馆或甜品店小坐聊天", estimatedCost: cafe?.avgPrice ? `人均${cafe.avgPrice}元` : "约50-80元/人", suggestions: ["选一家有氛围的店", "可以带束花"], whyRecommended: cafe?.name ? `适合情侣约会的安静咖啡店` : "需地图确认具体地点", recommendedItems: cafe?.recommendedItems, bookingAdvice: "无需预约，到店即可", queueRisk: cafe?.queueRisk ?? "low", businessHours: cafe?.openingHours, actionHints: cafe ? ["导航到店", "到店点单"].filter(Boolean) : ["导航到店"], fallbackPois: candidates.cafes.filter((c) => c.id !== cafe?.id).slice(0, 3).map((c) => c.name) },
      { id: createId("step"), startTime: t5, endTime: t6, type: "meal", title: restaurant?.name ?? "浪漫晚餐", poiId: restaurant?.id ?? null, poiName: restaurant?.name ?? null, durationMinutes: 90, transport: "walk", reasoning: "提前预约好位子。", bookingNeeded: true, actionId: null, description: restaurant?.name ? `${restaurant.name}浪漫晚餐，${restaurant.recommendedItems?.length ? `推荐${restaurant.recommendedItems.join("、")}` : "选一家有氛围的餐厅"}` : "在氛围好的餐厅享用晚餐", estimatedCost: restaurant?.avgPrice ? `人均${restaurant.avgPrice}元` : "人均100-200元", bookingHint: "建议提前1天预约，备注浪漫需求", suggestions: ["提前预约窗边位", "可以准备小礼物"], whyRecommended: restaurant?.name ? `适合情侣约会的浪漫餐厅` : "需地图确认", recommendedItems: restaurant?.recommendedItems, bookingAdvice: "建议提前1天通过大众点评预约，备注窗边位", queueRisk: restaurant?.queueRisk ?? "medium", businessHours: restaurant?.openingHours ?? "11:00-22:00", actionHints: restaurant ? ["打开大众点评查看", "导航到店", restaurant.tel ? `电话${restaurant.tel}预约` : "在线预约"].filter(Boolean) : ["导航到店"], fallbackPois: candidates.restaurants.filter((r) => r.id !== restaurant?.id).slice(0, 3).map((r) => r.name) },
    ],
    backupPlan: `如果下雨，改去${city}室内展览或商场，晚餐不变。`,
  };
}

function buildSocialFoodiePlan(input: PlannerInput): ActivityPlan {
  const { intent, candidates } = input;
  const city = intent.city || "杭州";
  const origin = intent.origin.label;
  const hasUserOrigin = !!origin;
  const userBudget = intent.budgetMax;
  const budget = userBudget ?? 300;
  const restaurant = candidates.restaurants[0] ?? candidates.restaurants[1];
  const activity = candidates.activities[1] ?? candidates.activities[0];
  const cafe = candidates.cafes[0] ?? candidates.cafes[1];
  const optionId = createId("option_foodie");
  const startTime = resolveStartTime(intent);
  const startMin = timeToMinutes(startTime);
  const t1 = minutesToTime(startMin);
  const t2 = minutesToTime(startMin + 30);
  const t3 = minutesToTime(startMin + 30 + 90);
  const t4 = minutesToTime(startMin + 30 + 90 + 30);
  const t5 = minutesToTime(startMin + 30 + 90 + 30 + 90);
  const t6 = minutesToTime(startMin + 30 + 90 + 30 + 90 + 30);

  const budgetAssumption = userBudget !== undefined
    ? `预算：${userBudget}元`
    : "未提供预算，暂按人均 200-300 估算，可继续调整";

  const assumptions: string[] = [];
  if (hasUserOrigin) assumptions.push(`从${origin}出发`);
  else assumptions.push("出发地未提供，以下暂不估算交通时间");
  assumptions.push(budgetAssumption, "以美食体验为主线");

  return {
    id: optionId,
    planId: input.planId,
    title: buildPlanTitle(intent, "美食探索路线"),
    targetGroup: intent.participantMode === "unknown" ? "friends" : intent.participantMode,
    score: 85,
    summary: `以${city}特色美食为主线的休闲路线${hasUserOrigin ? `，从${origin}出发` : ""}，适合喜欢美食探索的${userBudget !== undefined ? `，预算${userBudget}元` : ""}。`,
    totalDurationMinutes: 270,
    totalCostMin: Math.round(budget * 0.5),
    totalCostMax: Math.round(budget * 0.9),
    walkingKm: 2.0,
    assumptions,
    highlights: ["美食体验优先", "节奏轻松", "适合拍照打卡"],
    risks: ["热门餐厅可能需要排队"],
    timeline: [
      { id: createId("step"), startTime: t1, endTime: t2, type: "travel", title: hasUserOrigin ? `从${origin}出发` : "前往美食街（出发地待确认）", poiId: null, poiName: hasUserOrigin ? origin : null, durationMinutes: 30, transport: hasUserOrigin ? "taxi" : "none", reasoning: "前往美食聚集地。", bookingNeeded: false, actionId: null, description: hasUserOrigin ? `从${origin}打车前往${city}美食街` : "前往美食目的地", estimatedCost: hasUserOrigin ? "打车约20-40元" : undefined },
      { id: createId("step"), startTime: t2, endTime: t3, type: "meal", title: restaurant?.name ?? "特色午餐/晚餐", poiId: restaurant?.id ?? null, poiName: restaurant?.name ?? null, durationMinutes: 90, transport: "none", reasoning: "先吃主餐，胃口最棒。", bookingNeeded: true, actionId: null, description: restaurant?.name ? `${restaurant.name}体验招牌菜，${restaurant.recommendedItems?.length ? `推荐${restaurant.recommendedItems.join("、")}` : "尝试招牌菜"}` : "品尝当地特色美食", estimatedCost: restaurant?.avgPrice ? `人均${restaurant.avgPrice}元` : "人均80-150元", bookingHint: "建议提前1天预约餐位", suggestions: ["尝试招牌菜", "拍照打卡"], whyRecommended: restaurant?.name ? `这家餐厅以美食出名，适合美食爱好者` : "需地图确认具体地点", recommendedItems: restaurant?.recommendedItems, bookingAdvice: restaurant?.bookingRequired ? "建议提前1天通过美团APP或电话预约" : "无需预约，现场排队", queueRisk: restaurant?.queueRisk ?? "medium", businessHours: restaurant?.openingHours ?? "10:00-22:00", actionHints: restaurant ? ["打开美团/大众点评查看", "导航到店", restaurant.tel ? `电话${restaurant.tel}预约` : "在线预约"].filter(Boolean) : ["导航到店"] },
      { id: createId("step"), startTime: t3, endTime: t4, type: "buffer", title: cafe?.name ?? "甜品/咖啡", poiId: cafe?.id ?? null, poiName: cafe?.name ?? null, durationMinutes: 30, transport: "walk", reasoning: "餐后休息。", bookingNeeded: false, actionId: null, description: cafe?.name ? `${cafe.name}，${cafe.recommendedItems?.length ? `推荐${cafe.recommendedItems.join("、")}` : "找一杯喜欢的饮品小坐"}` : "附近找家甜品店或咖啡馆小坐", estimatedCost: cafe?.avgPrice ? `人均${cafe.avgPrice}元` : "约30-50元", suggestions: ["尝试当地特色甜品"], whyRecommended: cafe?.name ? `餐后适合短暂休息的咖啡店` : "需地图确认", recommendedItems: cafe?.recommendedItems, bookingAdvice: "无需预约", queueRisk: cafe?.queueRisk ?? "low", businessHours: cafe?.openingHours, actionHints: cafe ? ["导航到店", "到店点单"].filter(Boolean) : ["导航到店"], fallbackPois: candidates.cafes.filter((c) => c.id !== cafe?.id).slice(0, 3).map((c) => c.name) },
      { id: createId("step"), startTime: t4, endTime: t5, type: "activity", title: activity?.name ?? "周边漫步", poiId: activity?.id ?? null, poiName: activity?.name ?? null, durationMinutes: 90, transport: "walk", reasoning: "餐后消食，轻松活动。", bookingNeeded: activity?.bookingRequired ?? false, actionId: null, description: activity?.name ? `逛${activity.name}及周边特色小店` : "在美食街周边漫步拍照", estimatedCost: activity?.avgPrice ? `人均${activity.avgPrice}元` : "免费", suggestions: ["穿舒适鞋子", "适合拍照"] },
      { id: createId("step"), startTime: t5, endTime: t6, type: "return", title: hasUserOrigin ? "返程" : "返程（出发地待确认）", poiId: null, poiName: hasUserOrigin ? origin : null, durationMinutes: 30, transport: hasUserOrigin ? "taxi" : "none", reasoning: "行程结束。", bookingNeeded: false, actionId: null, description: hasUserOrigin ? `打车返回${origin}` : "返程", estimatedCost: hasUserOrigin ? "打车约20-40元" : undefined },
    ],
    backupPlan: `改为商场内美食广场 + 电影，预算更可控。`,
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
      { id: createId("step"), startTime: t1, endTime: t2, type: "travel", title: hasUserOrigin ? "出发到室内场所" : "前往室内场所（出发地待确认）", poiId: null, poiName: hasUserOrigin ? origin : null, durationMinutes: 35, transport: hasUserOrigin ? "taxi" : "none", reasoning: "雨天减少户外暴露。", bookingNeeded: false, actionId: null, description: hasUserOrigin ? `从${origin}打车前往室内场所` : "前往室内场所", estimatedCost: hasUserOrigin ? "打车约20-40元" : undefined, suggestions: hasUserOrigin ? ["提前叫车"] : [] },
      { id: createId("step"), startTime: t2, endTime: t3, type: "activity", title: indoor?.name ?? "室内活动", poiId: indoor?.id ?? null, poiName: indoor?.name ?? null, durationMinutes: 115, transport: "none", reasoning: "室内场所对雨天更稳妥。", bookingNeeded: indoor?.bookingRequired ?? true, actionId: null, description: indoor?.name ? `参观${indoor.name}，室内活动不受天气影响` : "室内活动，不受天气影响", estimatedCost: indoor?.avgPrice ? `人均${indoor.avgPrice}元` : "免费或门票待定", bookingHint: indoor?.bookingRequired ? "建议提前1天在线预约" : undefined, suggestions: ["室内活动穿舒适鞋", "可带充电宝"] },
      { id: createId("step"), startTime: t4, endTime: t5, type: "meal", title: restaurant?.name ?? "同商圈晚餐", poiId: restaurant?.id ?? null, poiName: restaurant?.name ?? null, durationMinutes: 60, transport: "walk", reasoning: "同商圈减少转场风险。", bookingNeeded: true, actionId: null, description: restaurant?.name ? `${restaurant.name}晚餐，${restaurant.recommendedItems?.length ? `推荐${restaurant.recommendedItems.join("、")}` : "推荐招牌菜"}` : "在商圈内用餐", estimatedCost: restaurant?.avgPrice ? `人均${restaurant.avgPrice}元` : "人均80-150元", bookingHint: "建议提前1天预约餐位", suggestions: ["同商圈方便", "避开高峰"], whyRecommended: restaurant?.name ? `同商圈内，步行可达，雨天友好` : "需地图确认", recommendedItems: restaurant?.recommendedItems, bookingAdvice: "建议提前1天通过美团APP或电话预约", queueRisk: restaurant?.queueRisk ?? "medium", businessHours: restaurant?.openingHours ?? "10:00-22:00", actionHints: restaurant ? ["打开美团/大众点评查看", "导航到店", restaurant.tel ? `电话${restaurant.tel}预约` : "在线预约"].filter(Boolean) : ["导航到店"], fallbackPois: candidates.restaurants.filter((r) => r.id !== restaurant?.id).slice(0, 3).map((r) => r.name) },
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
        signal: input.signal,
      };

      const result = await llmProvider.chat(query);
      const parsed = parseAndValidateLlmOutput(result.content, input.planId);
      return ensureThreePlans(parsed, input);
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

  // V4: 分类展示候选 POI，让 LLM 更容易选择具体店铺
  const formatCandidates = (label: string, pois: typeof candidates.activities) => {
    if (pois.length === 0) return "";
    const items = pois.map((c) => {
      const parts = [`- ${c.name} (${c.address}`];
      if (c.rating) parts.push(`评分${c.rating}`);
      if (c.avgPrice) parts.push(`人均${c.avgPrice}元`);
      if (c.recommendedItems?.length) parts.push(`推荐: ${c.recommendedItems.join("、")}`);
      if (c.queueRisk && c.queueRisk !== "unknown") parts.push(`排队风险: ${c.queueRisk}`);
      if (c.openingHours) parts.push(`营业: ${c.openingHours}`);
      return parts.join("，") + ")";
    }).join("\n");
    return `\n【${label}】\n${items}`;
  };

  const candidateList = [
    formatCandidates("景点/活动", candidates.activities),
    formatCandidates("餐厅", candidates.restaurants),
    formatCandidates("咖啡店", candidates.cafes),
    formatCandidates("展览/演出", candidates.events),
  ].filter(Boolean).join("\n");

  // V4: 从用户偏好中提取特殊搜索需求
  const prefHints: string[] = [];
  const raw = intent.raw + " " + intent.preferences.join(" ");
  if (/火锅|海底捞|湊湊/.test(raw)) prefHints.push("用户想吃火锅，请优先安排具体火锅店（如海底捞、湊湊），并推荐毛肚、鸭血、肥牛等菜品");
  if (/咖啡|拿铁|美式/.test(raw)) prefHints.push("用户想喝咖啡，请安排具体咖啡店并推荐饮品（如冰拿铁、美式、生椰拿铁）");
  if (/烧烤|烤肉/.test(raw)) prefHints.push("用户想吃烧烤，请安排具体烧烤店并推荐烤串、烤羊排等");
  if (/奶茶|茶饮/.test(raw)) prefHints.push("用户想喝奶茶，请安排具体奶茶店并推荐饮品");

  return `<user_input>
用户需求：
- 城市：${sanitizeUserInput(intent.city || "")}
- 出发地：${sanitizeUserInput(intent.origin.label || "未提供")}
- 日期：${sanitizeUserInput(intent.date ?? "本周末")}
- 出发时间：${sanitizeUserInput(intent.departAt ?? resolveStartTime(intent))}
- 参与者：${sanitizeUserInput(intent.participantMode)}，${sanitizeUserInput(String(intent.partySize))}人
- 时长：${sanitizeUserInput(String(intent.durationHours[0]))}-${sanitizeUserInput(String(intent.durationHours[1]))}小时
- 预算上限：${intent.budgetMax !== undefined ? `${sanitizeUserInput(String(intent.budgetMax))}元（用户明确提供，请严格遵守）` : "用户未提供预算，请按中等消费水平合理估算，并在 assumptions 中标注"}
- 偏好：${intent.preferences.length > 0 ? intent.preferences.map((p) => sanitizeUserInput(p)).join("、") : "无特殊偏好"}
${prefHints.length > 0 ? `\n特殊需求提示：\n${prefHints.map((h) => `- ${h}`).join("\n")}` : ""}
</user_input>

<weather_info>
天气：${sanitizeUserInput(weather.condition)}，${sanitizeUserInput(weather.temperature)}，${sanitizeUserInput(weather.suggestion)}
</weather_info>

<candidate_locations>
候选地点（请从以下列表中选择具体店铺，不要编造）：
${candidateList || "（无候选地点，请根据城市和需求推荐具体店铺名）"}
</candidate_locations>

重要：每个 meal/buffer/rest 步骤必须指定具体店铺名，不能写"在附近用餐""找家咖啡店"这类泛化描述。

请输出 JSON，格式：
${llmPlanJsonSchema}`;
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
      /* Phase 2: pass through enhanced detail fields */
      description: step.description,
      estimatedCost: step.estimatedCost,
      bookingHint: step.bookingHint,
      suggestions: step.suggestions,
      /* V4: pass through deep detail fields */
      whyRecommended: step.whyRecommended,
      recommendedItems: step.recommendedItems,
      bookingAdvice: step.bookingAdvice,
      queueRisk: step.queueRisk,
      businessHours: step.businessHours,
      actionHints: step.actionHints,
      fallbackPois: step.fallbackPois,
    })),
    backupPlan: plan.backupPlan,
  }));
}

function ensureThreePlans(plans: ActivityPlan[], input: PlannerInput): ActivityPlan[] {
  const uniqueByTitle = new Set(plans.map((p) => p.title));
  const result: ActivityPlan[] = [...plans];

  if (result.length >= 3) return result.slice(0, 3);

  const fallbacks = [
    () => buildPrimaryPlan(input),
    () => buildSocialFoodiePlan(input),
    () => buildIndoorBackupPlan(input),
  ];

  for (const make of fallbacks) {
    if (result.length >= 3) break;
    const plan = make();
    if (uniqueByTitle.has(plan.title)) continue;
    uniqueByTitle.add(plan.title);
    result.push(plan);
  }

  // 极端情况下仍不足 3（标题冲突等），重复使用首方案但保证 id 唯一
  while (result.length < 3 && result[0]) {
    const base = result[0];
    result.push({ ...base, id: createId("fallback") });
  }

  return result.slice(0, 3);
}

// --- Mock 方案构建（仅开发环境 fallback）---
