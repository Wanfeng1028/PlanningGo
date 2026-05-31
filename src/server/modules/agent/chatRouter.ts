/**
 * Chat Router — 周末去哪儿 Agent
 *
 * 核心意图识别 + 路由分发层。
 * 在 /api/agent/chat/stream 入口处调用，先判断用户意图，
 * 再决定走普通聊天、身份回答、追问补槽还是生成方案。
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
  "我是周末去哪儿，一个懂本地生活和周末安排的规划 Agent。你可以像和 ChatGPT 一样正常和我聊天；当你想出门玩、带娃、约朋友、约会、吃饭、看展或安排半天行程时，我会先问清楚时间、预算、出发地、同行人和偏好，再帮你生成可执行的方案。需要预约、导航、写入日历或分享给别人时，我会先让你确认，不会直接替你下单或付款。";

const GREETING_REPLIES = [
  "你好！我是周末去哪儿，有什么出行安排需要帮忙？",
  "嗨！想出门玩的话告诉我你的想法，我来帮你规划。",
  "你好呀！周末有计划吗？说说看，我帮你安排。",
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
  if (!slots.origin) missing.push("origin");
  if (!slots.budget) missing.push("budget");
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
    "我可以帮你做这些事：\n\n" +
    "1. **周末出行规划** — 告诉我时间、预算、出发地和同行人，我帮你安排路线\n" +
    "2. **地点推荐** — 按你的偏好推荐适合的去处\n" +
    "3. **预约建议** — 需要预约的地方帮你查库存和建议\n" +
    "4. **日历写入** — 把方案写进你的日程\n" +
    "5. **分享协作** — 把方案发给同行人一起确认\n\n" +
    "直接用自然语言告诉我你的需求就行！";
  return { type: "chat", content, conversationId };
}

function replyCasual(conversationId: string, _message: string): AgentResponse {
  const content =
    "我主要擅长出行规划和本地生活安排。如果你想出门玩、带娃、约朋友或者安排周末行程，随时告诉我，我来帮你规划！";
  return { type: "chat", content, conversationId };
}

function replyTravelAdvice(conversationId: string, message: string): AgentResponse {
  const preferences: string[] = [];
  if (/少排队|不要排队/.test(message)) preferences.push("少排队");
  if (/交通方便|地铁/.test(message)) preferences.push("交通方便");
  if (/室内|雨天/.test(message)) preferences.push("室内优先");

  const prefText = preferences.length > 0 ? `，按「${preferences.join("、")}」筛选` : "";

  const content =
    `可以，我先按「周末半日」${prefText}来推荐方向。你可以考虑这几类：\n\n` +
    "1. **城市公园 / 植物园类**：节奏轻，适合散步，排队风险低。\n" +
    "2. **小型博物馆 / 展览类**：适合雨天，但要看预约库存。\n" +
    "3. **商圈里的轻体验项目**：交通方便，餐饮选择多。\n" +
    "4. **城市周边古镇 / 绿道**：适合半日，但要控制车程。\n\n" +
    "如果你想让我直接排成路线，还需要告诉我：**从哪里出发**、**预算多少**、**几个人同行**。";

  const suggestions = ["帮我安排路线", "从北京出发", "两个人，预算300"];
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

  // Check completeness
  const missing = getMissingSlots(mergedSlots);

  if (missing.length > 0) {
    // Update state to collecting_slots
    return askMissingSlots(conversationId, mergedSlots, missing);
  }

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
    budget: "预算多少",
    partySize: "几个人同行",
    date: "什么时候去",
    timeWindow: "上午还是下午",
    preference: "有什么偏好",
    companions: "和谁一起去",
  };

  const questions = missing.map((s) => slotLabels[s]).join("、");
  const content = `好的，我来帮你安排！还需要知道：${questions}。`;

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
      return askMissingSlots(conversationId, slots, missingKeys);
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
