/**
 * agentRuntime.ts — 周末去哪儿 Agent 主脑
 *
 * 核心运行时：LLM streaming + tool_calls + 多轮工具执行 + 预算控制
 * 优先使用 LLM，异常时 fallback 到旧规则模板。
 */
import type OpenAI from "openai";
import type { PrismaClient } from "../../../generated/prisma/client.js";
import type {
  AgentResponse,
  AgentMessageInput,
  AgentState,
  PlanningSlots,
} from "../../../shared/agentResponse.js";
import type { PlanningProviders } from "../planning/schemas.js";
import { chatStream, getChatModel } from "./modelClient.js";
import { buildSystemPrompt } from "./prompts.js";
import { AGENT_TOOLS, executeToolCall, type ToolCallContext } from "./tools.js";
import { runPlanningPipeline } from "./orchestrator.js";
import { extractPlanningSlots, getMissingSlots } from "./chatRouter.js";
import * as mem from "../../services/memoryStore.js";

// ─── Constants ──────────────────────────────────────────────

const MAX_TOOL_ROUNDS = 5;
const MAX_HISTORY_MESSAGES = 20;

// ─── Types ──────────────────────────────────────────────────

interface AgentChatInput {
  message: string;
  city?: string;
  modelMode: "flash" | "pro";
  conversationId?: string;
  selectedOptionId?: string;
}

interface AgentChatContext {
  db: PrismaClient | null;
  providers?: PlanningProviders;
  userId?: string;
  log: {
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
  };
}

interface StreamCallbacks {
  writeText: (delta: string) => void;
}

// ─── Main Entry: Streaming Agent Chat ──────────────────────

export async function runAgentChatStream(
  input: AgentChatInput,
  ctx: AgentChatContext,
  stream: StreamCallbacks,
): Promise<AgentResponse> {
  const { db, providers, userId, log } = ctx;

  // 1. Ensure conversation exists
  const conversationId = await ensureConversation(db, userId, input, log);

  // 2. Load agent state
  const state = await loadAgentState(db, conversationId, log);

  // 3. Save user message
  await saveMsg(db, conversationId, "user", input.message, undefined, log);

  // 4. Load recent conversation history
  const history = await loadHistory(db, conversationId, log);

  // 5. Build messages array
  const modelInfo = getChatModel(input.modelMode);
  const systemPrompt = buildSystemPrompt({
    city: input.city,
    currentTime: new Date().toISOString(),
  });

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...history.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
  ];

  // 6. Tool call loop
  let currentDraft = state?.planningDraft;
  let finalContent = "";
  let toolRounds = 0;
  let shouldGeneratePlan = false;
  let planParams: Record<string, unknown> | null = null;
  let pendingAction: AgentResponse & { type: "action_confirm" } | null = null;

  while (toolRounds < MAX_TOOL_ROUNDS) {
    const toolCtx: ToolCallContext = {
      conversationId,
      city: input.city,
      planningDraft: currentDraft,
      providers,
    };

    // Call LLM with streaming
    const { stream: llmStream, provider, model } = await chatStream(messages, {
      mode: input.modelMode,
      tools: AGENT_TOOLS,
    });

    // Collect the stream response
    let assistantContent = "";
    const toolCalls: Map<number, { id: string; name: string; arguments: string }> = new Map();
    let finishReason: string | null = null;

    for await (const chunk of llmStream) {
      const delta = chunk.choices[0]?.delta;
      finishReason = chunk.choices[0]?.finish_reason ?? finishReason;

      // Stream text content to client
      if (delta?.content) {
        assistantContent += delta.content;
        stream.writeText(delta.content);
      }

      // Accumulate tool calls
      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index ?? 0;
          if (!toolCalls.has(idx)) {
            toolCalls.set(idx, { id: "", name: "", arguments: "" });
          }
          const existing = toolCalls.get(idx)!;
          if (tc.id) existing.id = tc.id;
          if (tc.function?.name) existing.name = tc.function.name;
          if (tc.function?.arguments) existing.arguments += tc.function.arguments;
        }
      }
    }

    // If no tool calls, we're done
    if (toolCalls.size === 0) {
      finalContent = assistantContent;
      break;
    }

    // Execute tool calls
    toolRounds++;
    log.info(`[agentRuntime] Tool round ${toolRounds}: executing ${toolCalls.size} tool calls`);

    // Add assistant message with tool_calls to history
    const assistantMsg: OpenAI.Chat.Completions.ChatCompletionMessageParam = {
      role: "assistant",
      content: assistantContent || null,
      tool_calls: Array.from(toolCalls.values()).map((tc) => ({
        id: tc.id,
        type: "function" as const,
        function: { name: tc.name, arguments: tc.arguments },
      })),
    };
    messages.push(assistantMsg);

    // Execute each tool call and add results
    for (const [, tc] of toolCalls) {
      try {
        const { resultStr, sideEffect } = await executeToolCall(tc.name, tc.arguments, toolCtx);

        // Handle side effects
        if (sideEffect?.updatedDraft) {
          currentDraft = sideEffect.updatedDraft;
        }
        if (sideEffect?.shouldGeneratePlan) {
          shouldGeneratePlan = true;
          planParams = (sideEffect.result as Record<string, unknown>) ?? {};
        }
        if (sideEffect?.shouldConfirmAction) {
          // Will handle after the loop
        }

        messages.push({
          role: "tool" as const,
          tool_call_id: tc.id,
          content: resultStr,
        });
      } catch (err) {
        log.warn({ err }, `[agentRuntime] Tool ${tc.name} failed`);
        messages.push({
          role: "tool" as const,
          tool_call_id: tc.id,
          content: JSON.stringify({ error: `Tool execution failed: ${err instanceof Error ? err.message : String(err)}` }),
        });
      }
    }
  }

  // 7. If plan generation was requested, run the planning pipeline
  let planResponse: AgentResponse | null = null;
  if (shouldGeneratePlan) {
    try {
      const params = planParams ?? {};
      const city = (params.city as string) ?? input.city ?? "北京";
      const origin = (params.origin as string) ?? currentDraft?.origin ?? "未知出发地";
      const budget = (params.budget as number) ?? (typeof currentDraft?.budget === "number" ? currentDraft.budget : undefined);
      const partySize = (params.partySize as number) ?? (typeof currentDraft?.partySize === "number" ? currentDraft.partySize : undefined);
      const companions = (params.companions as string) ?? (typeof currentDraft?.companions === "string" ? currentDraft.companions : undefined);

      const pipelineResult = await runPlanningPipeline({
        prompt: input.message,
        city,
        startPoint: origin,
        budget,
        companions: companions as "family" | "friends" | "couple" | "solo" | undefined,
        modelMode: input.modelMode,
        providers,
        userId,
      });

      if (pipelineResult.responseType === "chat" || !pipelineResult.options || pipelineResult.options.length === 0) {
        // Pipeline returned a chat response (not a plan)
        planResponse = {
          type: "chat",
          content: pipelineResult.summary || "你好！请告诉我更多出行信息，我来帮你规划。",
          conversationId,
        };
      } else {
        planResponse = {
          type: "plan",
          content: pipelineResult.summary || "已为你生成出行方案",
          data: {
            planId: pipelineResult.planId,
            options: pipelineResult.options,
            summary: pipelineResult.summary,
            executableActions: pipelineResult.executableActions,
            conversationId,
          },
          conversationId,
        };
      }

      // Stream the plan summary text
      if (planResponse.content && !finalContent) {
        stream.writeText(planResponse.content);
        finalContent = planResponse.content;
      }
    } catch (err) {
      log.error({ err }, "[agentRuntime] Planning pipeline failed");
      // If planning fails, return a friendly error
      if (!finalContent) {
        finalContent = "抱歉，生成方案时遇到了问题，请稍后重试或补充更多信息。";
        stream.writeText(finalContent);
      }
      planResponse = {
        type: "chat",
        content: finalContent,
        conversationId,
      };
    }
  }

  // 8. Determine final response
  let agentResponse: AgentResponse;

  if (planResponse) {
    agentResponse = planResponse;
  } else if (!finalContent) {
    // LLM returned no content (edge case)
    finalContent = "我没有理解你的意思，能再说一次吗？";
    stream.writeText(finalContent);
    agentResponse = { type: "chat", content: finalContent, conversationId };
  } else {
    // Determine the response type based on content and state
    agentResponse = classifyResponse(finalContent, currentDraft, state, conversationId);
  }

  // 9. Save assistant message
  const payloadJson = agentResponse.type === "plan" ? agentResponse.data : undefined;
  await saveMsg(db, conversationId, "assistant", finalContent, payloadJson, log);

  // 10. Update agent state
  const newState = computeAgentState(state, agentResponse, currentDraft);
  await saveAgentState(db, conversationId, newState, log);

  return agentResponse;
}

// ─── Response Classification ────────────────────────────────

function classifyResponse(
  content: string,
  draft: PlanningSlots | undefined,
  state: AgentState | null,
  conversationId: string,
): AgentResponse {
  const missing = draft ? getMissingSlots(draft) : [];

  // If there are missing slots and the content seems to be asking about them
  if (missing.length > 0 && (
    /请问|告诉我|出发|预算|几个人|什么时候|哪天|喜欢/.test(content) ||
    state?.phase === "collecting_slots"
  )) {
    return {
      type: "slot_question",
      content,
      missingSlots: missing,
      knownSlots: draft ?? {},
      conversationId,
    };
  }

  // Default to chat
  return { type: "chat", content, conversationId };
}

// ─── State Management ───────────────────────────────────────

function computeAgentState(
  prev: AgentState | null | undefined,
  response: AgentResponse,
  draft: PlanningSlots | undefined,
): AgentState {
  const base: AgentState = prev ?? { phase: "idle" };

  switch (response.type) {
    case "chat":
      return { ...base, phase: "chatting", planningDraft: draft, lastAssistantType: "chat" };
    case "slot_question":
      return { ...base, phase: "collecting_slots", planningDraft: draft, lastAssistantType: "slot_question" };
    case "plan":
      return {
        ...base,
        phase: "plan_generated",
        planningDraft: draft,
        lastPlanResult: {
          planId: response.data.planId,
          options: response.data.options,
        },
        lastAssistantType: "plan",
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
      return { ...base, planningDraft: draft };
  }
}

// ─── DB Helpers (reused from chatRouter patterns) ───────────

interface HistoryMessage {
  role: string;
  content: string;
}

async function ensureConversation(
  db: PrismaClient | null,
  userId: string | undefined,
  input: AgentMessageInput,
  log: AgentChatContext["log"],
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
        log.warn("[agentRuntime] Failed to verify conversationId");
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
      log.error({ err }, "[agentRuntime] Failed to create conversation in DB");
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
  log: AgentChatContext["log"],
): Promise<AgentState | null> {
  if (db) {
    try {
      const conv = await db.conversation.findUnique({
        where: { id: conversationId },
        select: { agentStateJson: true },
      });
      if (conv?.agentStateJson) {
        return conv.agentStateJson as unknown as AgentState;
      }
    } catch {
      log.warn("[agentRuntime] Failed to load agent state from DB");
    }
  }
  return null;
}

async function saveAgentState(
  db: PrismaClient | null,
  conversationId: string,
  state: AgentState,
  log: AgentChatContext["log"],
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
      log.warn("[agentRuntime] Failed to save agent state to DB");
    }
  }
}

async function saveMsg(
  db: PrismaClient | null,
  conversationId: string,
  role: "user" | "assistant",
  content: string,
  payloadJson?: unknown,
  log?: AgentChatContext["log"],
): Promise<void> {
  if (db) {
    try {
      await db.message.create({
        data: { conversationId, role, content, payloadJson: payloadJson as any },
      });
    } catch {
      log?.warn("[agentRuntime] Failed to save message to DB");
    }
  } else {
    mem.addMessage({ conversationId, role, content, payloadJson });
  }
}

async function loadHistory(
  db: PrismaClient | null,
  conversationId: string,
  log: AgentChatContext["log"],
): Promise<HistoryMessage[]> {
  if (db) {
    try {
      const msgs = await db.message.findMany({
        where: { conversationId },
        orderBy: { createdAt: "asc" },
        take: MAX_HISTORY_MESSAGES,
        select: { role: true, content: true },
      });
      return msgs;
    } catch {
      log.warn("[agentRuntime] Failed to load history from DB");
    }
  }

  // Memory store fallback
  const memMsgs = mem.listMessages(conversationId);
  return memMsgs.slice(-MAX_HISTORY_MESSAGES).map((m: { role: string; content: string }) => ({
    role: m.role,
    content: m.content,
  }));
}
