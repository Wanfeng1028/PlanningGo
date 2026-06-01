/**
 * Chat Router — 周末去哪儿 Agent (Fallback / Legacy)
 *
 * ⚠️ 此模块已降级为 fallback：当 LLM Agent Runtime 不可用时（无 API Key 或运行时异常），
 * 才会使用此规则模板进行意图识别和路由分发。
 *
 * 正式主链路请使用 agentRuntime.ts（LLM streaming + tool_calls）。
 *
 * 保留此模块的原因：
 * 1. 无 API Key 时仍可提供基础对话能力
 * 2. LLM 服务临时不可用时的降级方案
 * 3. 作为意图分类的参考实现
 */

import type { PrismaClient } from "../../../generated/prisma/client.js";
import type {
  AgentResponse,
  AgentIntent,
  AgentMessageInput,
  AgentState,
  PlanningSlotKey,
  PlanningSlots,
  NextAction,
} from "../../../shared/agentResponse.js";
import type { PlanningProviders } from "../planning/schemas.js";
import { runPlanningPipeline } from "./orchestrator.js";
import * as mem from "../../services/memoryStore.js";

// ─── Constants ──────────────────────────────────────────────

const IDENTITY_ANSWER =
  "我是周末去哪儿，帮你搞定本地出行规划的助手——告诉我时间、预算和同行人，我来安排可执行的方案。";

const GREETING_REPLIES = [
  "嗨！有什么出行计划需要帮忙？",
  "你好呀，想出门逛逛吗？说说你的想法。",
  "嘿～周末有安排吗？需要帮忙规划的话随时说。",
];

const NEXT_ACTIONS: NextAction[] = [
  { key: "save", label: "保存方案" },
  { key: "navigation", label: "打开导航" },
  { key: "calendar", label: "生成日历" },
  { key: "share", label: "分享给同行人" },
  { key: "reservation", label: "查看预约建议" },
  { key: "modify", label: "继续调整" },
];

// ─── Intent Classification ──────────────────────────────────

export function classifyAgentIntent(message: string, state?: AgentState | null): AgentIntent {
  const trimmed = message.trim();
  if (trimmed.length === 0) return "unknown";

  // identity_question — highest priority after empty check
  if (/你是谁|你叫什么|介绍一下你自己|你是什么/.test(trimmed)) {
    return "identity_question";
  }

  // capability_question
  if (/你能做什么|你会什么|你有什么功能|怎么用/.test(trimmed)) {
    return "capability_question";
  }

  // greeting — strict match to avoid catching planning requests
  if (/^(你好|hi|hello|hey|嗨|喂|哈喽|早上好|下午好|晚上好|test|测试)[\s!！。.]*$/i.test(trimmed)) {
    return "greeting";
  }

  // select_plan — user selecting a plan by text
  if (/选[这那第]|选择.*方案|我选择好了|就[这那]个|第[一二三四五六]套|选这套|选那套/.test(trimmed)) {
    return "select_plan";
  }

  // execute_action
  if (/确认预约|保存方案|打开导航|生成日历|分享给|查看预约|继续调整/.test(trimmed)) {
    return "execute_action";
  }

  // travel_question — asking for recommendations without full planning intent
  if (/推荐|哪里好玩|有什么好玩|适合.*去|景点|去哪[儿里]|好玩的地方/.test(trimmed) &&
      !/安排|规划|计划|行程|帮我.*出发|从.*出发.*预算/.test(trimmed)) {
    return "travel_question";
  }

  // planning_request — explicit planning with enough info
  if (/安排|规划|计划|行程|帮我.*去|出发.*预算|带娃.*去|从.*出发|半天游|一日游|周末.*去/.test(trimmed)) {
    return "planning_request";
  }

  // slot_fill — if we're in collecting_slots phase and user provides info
  if (state?.phase === "collecting_slots") {
    const hasSlotInfo = /从.*出发|预算\d+|\d+人|带娃|孩子|朋友|情侣|周末|明天|下周|上午|下午|晚上/.test(trimmed);
    if (hasSlotInfo) return "slot_fill";
  }

  // casual_chat — anything else that looks like conversation
  if (trimmed.length > 2 && /[\u4e00-\u9fff]/.test(trimmed)) {
    return "casual_chat";
  }

  return "unknown";
}

// ─── Slot Extraction ────────────────────────────────────────

export function extractPlanningSlots(message: string): PlanningSlots {
  const slots: PlanningSlots = {};
  const normalized = message.replace(/[】\]）》〉」』】\u3000]/g, "").trim();

  // origin
  const originMatch = normalized.match(/从(.+?)出发/) || normalized.match(/(.+?)出发/);
  if (originMatch) {
    const origin = originMatch[1].replace(/[，,。.！!？?、]/g, "").trim();
    if (origin.length > 0 && origin.length < 20) {
      slots.origin = origin;
    }
  }

  // budget
  const budgetMatch = normalized.match(/预算\s*(\d+)/) || normalized.match(/(\d+)\s*[元块]/);
  if (budgetMatch) {
    slots.budget = Number(budgetMatch[1] ?? budgetMatch[2]);
  }

  // partySize
  const sizeMatch = normalized.match(/(\d+)\s*人/);
  if (sizeMatch) {
    slots.partySize = Number(sizeMatch[1]);
  } else if (/两个人|俩人/.test(normalized)) {
    slots.partySize = 2;
  } else if (/三个人|仨人/.test(normalized)) {
    slots.partySize = 3;
  }

  // companions
  if (/带娃|孩子|亲子|一家|家庭/.test(normalized)) {
    slots.companions = "family";
    if (!slots.partySize) slots.partySize = 3;
  } else if (/情侣|对象|女朋友|男朋友|约会/.test(normalized)) {
    slots.companions = "couple";
    if (!slots.partySize) slots.partySize = 2;
  } else if (/朋友|同学|同事|聚会/.test(normalized)) {
    slots.companions = "friends";
    if (!slots.partySize) slots.partySize = 4;
  } else if (/一个人|自己|独自/.test(normalized)) {
    slots.companions = "solo";
    if (!slots.partySize) slots.partySize = 1;
  }

  // date
  if (/周末/.test(normalized)) slots.date = "周末";
  else if (/明天/.test(normalized)) slots.date = "明天";
  else if (/下周/.test(normalized)) slots.date = "下周";

  // timeWindow
  if (/上午|早上/.test(normalized)) slots.timeWindow = "morning";
  else if (/下午/.test(normalized)) slots.timeWindow = "afternoon";
  else if (/晚上/.test(normalized)) slots.timeWindow = "evening";
  else if (/一天|整天/.test(normalized)) slots.timeWindow = "full_day";

  // preferences
  const preference: string[] = [];
  if (/少排队|不要排队|排队少/.test(normalized)) preference.push("少排队");
  if (/交通方便|地铁方便|好到达/.test(normalized)) preference.push("交通方便");
  if (/室内|雨天|下雨/.test(normalized)) preference.push("室内优先");
  if (/户外|公园|自然/.test(normalized)) preference.push("户外");
  if (/少走|不要太累|轻松/.test(normalized)) preference.push("低负担");
  if (preference.length) slots.preference = preference;

  return slots;
}

export function mergeSlots(existing: PlanningSlots, incoming: PlanningSlots): PlanningSlots {
  const merged = { ...existing };
  for (const [key, value] of Object.entries(incoming)) {
    if (value !== undefined && value !== null && value !== "") {
      if (key === "preference" && Array.isArray(value) && Array.isArray(merged.preference)) {
        merged.preference = [...new Set([...merged.preference, ...value])];
      } else {
        (merged as Record<string, unknown>)[key] = value;
      }
    }
  }
  return merged;
}

export function getMissingSlots(slots: PlanningSlots): PlanningSlotKey[] {
  const missing: PlanningSlotKey[] = [];
  // Only companions/partySize is truly required for a basic plan.
  // origin and budget can use defaults — don't block planning for them.
  if (!slots.partySize && !slots.companions) missing.push("partySize");
  return missing;
}

// ─── Main Handler ───────────────────────────────────────────

interface HandlerContext {
  db: PrismaClient | null;
  providers?: PlanningProviders;
  userId?: string;
  log: { info: (...args: unknown[]) => void; warn: (...args: unknown[]) => void; error: (...args: unknown[]) => void };
}

export async function handleAgentMessage(
  input: AgentMessageInput,
  ctx: HandlerContext,
): Promise<AgentResponse> {
  const { db, providers, userId, log } = ctx;

  // 1. Ensure conversation
  const conversationId = await ensureConversation(db, userId, input, log);

  // 2. Load agent state
  const state = await loadAgentState(db, conversationId, log);

  // 3. Save user message
  await saveMsg(db, conversationId, "user", input.message, undefined, log);

  // 4. Classify intent
  const intent = classifyAgentIntent(input.message, state);
  log.info({ intent, conversationId }, "[chatRouter] classified intent");

  let response: AgentResponse;

  switch (intent) {
    case "greeting":
      response = replyGreeting(conversationId);
      break;

    case "identity_question":
      response = replyIdentity(conversationId);
      break;

    case "capability_question":
      response = replyCapabilities(conversationId);
      break;

    case "casual_chat":
    case "unknown":
      response = replyCasual(conversationId, input.message);
      break;

    case "travel_question":
      response = replyTravelAdvice(conversationId, input.message);
      break;

    case "select_plan":
      response = await handlePlanSelectedByText(db, conversationId, input.message, state, log);
      break;

    case "execute_action":
      response = replyActionConfirm(conversationId);
      break;

    case "planning_request":
    case "slot_fill":
    case "modify_plan":
      response = await handlePlanningIntent(db, conversationId, input, state, providers, userId, log);
      break;

    default:
      response = replyCasual(conversationId, input.message);
  }

  // 5. Save assistant message
  await saveMsg(db, conversationId, "assistant", response.content, { ...response }, log);

  // 6. Update agent state
  const newState = computeNewState(state, response);
  await saveAgentState(db, conversationId, newState, log);

  return response;
}

// ─── Intent Handlers ────────────────────────────────────────

function replyGreeting(conversationId: string): AgentResponse {
  const reply = GREETING_REPLIES[Math.floor(Math.random() * GREETING_REPLIES.length)];
  return { type: "chat", content: reply, conversationId };
}

function replyIdentity(conversationId: string): AgentResponse {
  return { type: "identity", content: IDENTITY_ANSWER, conversationId };
}

function replyCapabilities(conversationId: string): AgentResponse {
  const content =
    "我主要帮你规划本地出行，比如：\n\n" +
    "“周末带娃半天，预算300” → 我帮你排路线\n" +
    "“情侣约会，晚上，想拍照” → 推荐适合的去处\n" +
    "“和朋友吃饭，别太贵” → 选地点 + 预估花费\n\n" +
    "方案做好后还能帮你导航、写日历、分享给同行人。直接说需求就行！";
  return { type: "chat", content, conversationId };
}

function replyCasual(conversationId: string, _message: string): AgentResponse {
  const content =
    "有出行计划的话随时告诉我，帮你安排～";
  return { type: "chat", content, conversationId };
}

function replyTravelAdvice(conversationId: string, message: string): AgentResponse {
  const preferences: string[] = [];
  if (/少排队|不要排队/.test(message)) preferences.push("少排队");
  if (/交通方便|地铁/.test(message)) preferences.push("交通方便");
  if (/室内|雨天/.test(message)) preferences.push("室内优先");

  const prefText = preferences.length > 0 ? `，偏好「${preferences.join("、")}」` : "";

  const content =
    `按周末半日${prefText}来推荐，可以考虑这几类：\n\n` +
    "1. **公园/植物园** — 节奏轻，适合散步\n" +
    "2. **小型展览/博物馆** — 雨天友好\n" +
    "3. **商圈轻体验** — 交通方便，吃喝选择多\n" +
    "4. **周边古镇/绿道** — 适合半日，控制车程\n\n" +
    "想让我排成具体路线的话，告诉我**从哪出发**、**预算**、**几个人**就行。";

  const suggestions = ["帮我安排路线", "从市中心出发", "两个人，预算300"];
  return { type: "travel_advice", content, suggestions, conversationId };
}

async function handlePlanSelectedByText(
  db: PrismaClient | null,
  conversationId: string,
  message: string,
  state: AgentState | null,
  log: HandlerContext["log"],
): Promise<AgentResponse> {
  // Check if user has a selectedOptionId in state
  const selectedId = state?.selectedOptionId;

  if (selectedId) {
    const title = state?.selectedPlanTitle ?? "已选方案";
    const content = `你已经选好了「${title}」。接下来要我帮你保存、导航、生成日历，还是继续调整？`;
    return {
      type: "plan_selected",
      content,
      selectedOptionId: selectedId,
      selectedPlanTitle: title,
      nextActions: NEXT_ACTIONS,
      conversationId,
    };
  }

  // No selected plan yet — check if there's a plan in state
  if (state?.lastPlanResult?.options?.length) {
    // Try to parse which plan from the message
    const options = state.lastPlanResult.options as Array<{ id: string; title: string }>;
    let selected = options[0]; // default to first

    const numMatch = message.match(/第([一二三四五六123456])套/);
    if (numMatch) {
      const idx = numMatch[1] === "一" || numMatch[1] === "1" ? 0 :
                  numMatch[1] === "二" || numMatch[1] === "2" ? 1 :
                  numMatch[1] === "三" || numMatch[1] === "3" ? 2 : 0;
      selected = options[idx] ?? selected;
    }

    // Also try "这/那" to select first or second
    if (/那套|那[个条]/.test(message) && options.length > 1) {
      selected = options[1];
    }

    return {
      type: "plan_selected",
      content: `已选中「${selected.title}」。下一步你可以：`,
      selectedOptionId: selected.id,
      selectedPlanTitle: selected.title,
      nextActions: NEXT_ACTIONS,
      conversationId,
    };
  }

  return {
    type: "chat",
    content: "你还没有选中具体方案。可以点方案卡片里的「选这套」，或者告诉我想选第几套。",
    conversationId,
  };
}

function replyActionConfirm(conversationId: string): AgentResponse {
  return {
    type: "chat",
    content: "好的，请告诉我你想执行哪个操作？我可以帮你保存方案、打开导航、生成日历或分享给同行人。",
    conversationId,
  };
}

async function handlePlanningIntent(
  db: PrismaClient | null,
  conversationId: string,
  input: AgentMessageInput,
  state: AgentState | null,
  providers: PlanningProviders | undefined,
  userId: string | undefined,
  log: HandlerContext["log"],
): Promise<AgentResponse> {
  // Extract and merge slots
  const newSlots = extractPlanningSlots(input.message);
  const mergedSlots = mergeSlots(state?.planningDraft ?? {}, newSlots);

  // Check completeness — only ask when truly missing core info
  const missing = getMissingSlots(mergedSlots);

  if (missing.length > 0) {
    // If we only need partySize/companions, ask concisely
    return askMissingSlots(conversationId, mergedSlots, missing);
  }

  // Apply defaults for optional fields that are missing
  if (!mergedSlots.origin) mergedSlots.origin = "市中心";
  if (!mergedSlots.budget) mergedSlots.budget = 300;

  // Slots are complete — generate plan
  return generatePlanFromSlots(conversationId, input, mergedSlots, providers, userId, log);
}

function askMissingSlots(
  conversationId: string,
  knownSlots: PlanningSlots,
  missing: PlanningSlotKey[],
): AgentResponse {
  const slotLabels: Record<PlanningSlotKey, string> = {
    origin: "从哪里出发",
    budget: "预算大概多少",
    partySize: "几个人、和谁一起去",
    date: "什么时候去",
    timeWindow: "上午还是下午",
    preference: "有什么偏好",
    companions: "和谁一起去",
  };

  // Only ask up to 2 questions to keep it conversational
  const questions = missing.slice(0, 2).map((s) => slotLabels[s]).join("？");
  const suffix = missing.length > 2 ? "，其他我来安排" : "";
  const content = `好的！${questions}？${suffix}`;

  return {
    type: "slot_question",
    content,
    missingSlots: missing,
    knownSlots,
    conversationId,
  };
}

async function generatePlanFromSlots(
  conversationId: string,
  input: AgentMessageInput,
  slots: PlanningSlots,
  providers: PlanningProviders | undefined,
  userId: string | undefined,
  log: HandlerContext["log"],
): Promise<AgentResponse> {
  try {
    const companions = (slots.companions as "family" | "friends" | "couple" | "solo") ?? undefined;

    const result = await runPlanningPipeline({
      prompt: input.message,
      city: input.city ?? (typeof slots.origin === "string" ? slots.origin : undefined) ?? "北京",
      startPoint: typeof slots.origin === "string" ? slots.origin : undefined,
      companions,
      budget: typeof slots.budget === "number" ? slots.budget : undefined,
      modelMode: (input.modelMode as "flash" | "pro") ?? "flash",
      providers,
      userId,
    });

    return {
      type: "plan",
      content: result.summary ?? "为你生成了以下方案：",
      data: {
        planId: result.planId,
        options: result.options,
        summary: result.summary,
        executableActions: result.executableActions,
        conversationId,
      },
      conversationId,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    if (message.startsWith("MISSING_REQUIRED_SLOTS:")) {
      const missingKeys = message.replace("MISSING_REQUIRED_SLOTS:", "").split(",") as PlanningSlotKey[];
      // Don't block — try again with defaults applied
      const withDefaults = { ...slots };
      for (const key of missingKeys) {
        if (key === "origin" && !withDefaults.origin) withDefaults.origin = "市中心";
        if (key === "budget" && !withDefaults.budget) withDefaults.budget = 300;
        if (key === "partySize" && !withDefaults.partySize && !withDefaults.companions) withDefaults.partySize = 2;
      }
      // If we already had defaults and it still failed, ask user
      if (missingKeys.every((k) => withDefaults[k])) {
        return askMissingSlots(conversationId, slots, missingKeys);
      }
      // Otherwise retry with defaults
      return generatePlanFromSlots(conversationId, input, withDefaults, providers, userId, log);
    }

    log.error({ err }, "[chatRouter] plan generation failed");
    return {
      type: "error",
      content: "方案生成遇到问题，请稍后重试。",
      code: "PLAN_GENERATION_FAILED",
      conversationId,
    };
  }
}

// ─── State Management ───────────────────────────────────────

function computeNewState(prev: AgentState | null | undefined, response: AgentResponse): AgentState {
  const base: AgentState = prev ?? { phase: "idle" };

  switch (response.type) {
    case "chat":
    case "identity":
      return { ...base, phase: "chatting", lastAssistantType: response.type };
    case "travel_advice":
      return { ...base, phase: "chatting", lastAssistantType: "travel_advice" };
    case "slot_question":
      return {
        ...base,
        phase: "collecting_slots",
        planningDraft: response.knownSlots,
        lastAssistantType: "slot_question",
      };
    case "plan":
      return {
        ...base,
        phase: "plan_generated",
        lastPlanResult: {
          planId: response.data.planId,
          options: response.data.options,
        },
        lastAssistantType: "plan",
      };
    case "plan_selected":
      return {
        ...base,
        phase: "plan_selected",
        selectedOptionId: response.selectedOptionId,
        selectedPlanTitle: response.selectedPlanTitle,
        lastAssistantType: "plan_selected",
      };
    case "action_confirm":
      return {
        ...base,
        phase: "action_confirming",
        pendingAction: response.action,
        lastAssistantType: "action_confirm",
      };
    case "error":
      return { ...base, lastAssistantType: "error" };
    default:
      return base;
  }
}

// ─── DB Helpers ─────────────────────────────────────────────

async function ensureConversation(
  db: PrismaClient | null,
  userId: string | undefined,
  input: AgentMessageInput,
  log: HandlerContext["log"],
): Promise<string> {
  if (input.conversationId) {
    if (db) {
      try {
        const existing = await db.conversation.findUnique({
          where: { id: input.conversationId },
          select: { id: true },
        });
        if (existing) return input.conversationId;
      } catch {
        log.warn("[chatRouter] Failed to verify conversationId");
      }
    } else {
      const existing = mem.getConversation(input.conversationId);
      if (existing) return input.conversationId;
    }
  }

  const title = input.message.length > 30 ? input.message.slice(0, 30) + "..." : input.message;

  if (db) {
    try {
      const conv = await db.conversation.create({
        data: {
          userId: userId ?? undefined,
          title,
          city: input.city ?? "北京",
          modelMode: (input.modelMode as "flash" | "pro") ?? "flash",
        },
      });
      return conv.id;
    } catch (err) {
      log.error({ err }, "[chatRouter] Failed to create conversation in DB");
    }
  }

  const conv = mem.createConversation({
    userId,
    title,
    city: input.city,
    modelMode: input.modelMode,
  });
  return conv.id;
}

async function loadAgentState(
  db: PrismaClient | null,
  conversationId: string,
  log: HandlerContext["log"],
): Promise<AgentState | null> {
  if (db) {
    try {
      const conv = await db.conversation.findUnique({
        where: { id: conversationId },
        select: { agentStateJson: true, selectedOptionId: true },
      });
      if (conv?.agentStateJson) {
        return conv.agentStateJson as unknown as AgentState;
      }
    } catch {
      log.warn("[chatRouter] Failed to load agent state from DB");
    }
  }
  // Memory store fallback — state stored in memory is not persisted across restarts
  return null;
}

async function saveAgentState(
  db: PrismaClient | null,
  conversationId: string,
  state: AgentState,
  log: HandlerContext["log"],
): Promise<void> {
  if (db) {
    try {
      await db.conversation.update({
        where: { id: conversationId },
        data: {
          agentStateJson: state as any,
          selectedOptionId: state.selectedOptionId ?? null,
        },
      });
    } catch {
      log.warn("[chatRouter] Failed to save agent state to DB");
    }
  }
}

async function saveMsg(
  db: PrismaClient | null,
  conversationId: string,
  role: "user" | "assistant",
  content: string,
  payloadJson?: unknown,
  log?: HandlerContext["log"],
): Promise<void> {
  if (db) {
    try {
      await db.message.create({
        data: { conversationId, role, content, payloadJson: payloadJson as any },
      });
    } catch {
      log?.warn("[chatRouter] Failed to save message to DB");
    }
  } else {
    mem.addMessage({ conversationId, role, content, payloadJson });
  }
}
