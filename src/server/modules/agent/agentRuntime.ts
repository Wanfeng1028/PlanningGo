/**
 * agentRuntime.ts — 周末去哪儿 Agent 主脑
 *
 * 核心运行时：LLM streaming + tool_calls + 多轮工具执行 + 预算控制
 * 优先使用 LLM，异常时 fallback 到旧规则模板。
 */
import type OpenAI from "openai";
import type { PrismaClient, Prisma } from "../../../generated/prisma/client.js";
import type {
  AgentResponse,
  AgentState,
  PlanningSlots,
  AgentTraceEvent,
} from "../../../shared/agentResponse.js";
import { traceId } from "../../../shared/agentResponse.js";
import type { PlanningProviders } from "../planning/schemas.js";
import { chatStream, getChatModel } from "./modelClient.js";
import { buildSystemPrompt } from "./prompts.js";
import { AGENT_TOOLS, executeToolCall, type ToolCallContext } from "./tools.js";
import { runPlanningPipeline } from "./orchestrator.js";
import { createPlanningActions } from "../execution/actionService.js";
import { extractPlanningSlots, getMissingSlots, isContinuationIntent, generateTitleFromSlots, mergeSlots } from "./chatRouter.js";
import { extractMemoryFromSlots, mergeMemoryProfile } from "./memoryExtractor.js";
import { updateConversationTitle } from "./titleUtils.js";
import * as mem from "../../services/memoryStore.js";

// ─── Constants ──────────────────────────────────────────────

const MAX_TOOL_ROUNDS = 5;
const MAX_HISTORY_MESSAGES = 20;
/** When history exceeds this, truncate to recent window + summary of older turns */
const MAX_HISTORY_TOKENS_ESTIMATE = 6000;

// ─── Types ──────────────────────────────────────────────────

interface AgentChatInput {
  message: string;
  city?: string;
  modelMode: "flash" | "pro";
  conversationId?: string;
  selectedOptionId?: string;
  guestId?: string;
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
  writeEvent?: (event: AgentTraceEvent) => void;
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

  // ── Required logging ──
  log.info({
    route: "/api/agent/chat/stream",
    userId,
    conversationId,
    message: input.message,
  }, "[agent] incoming message");

  log.info({
    conversationId,
    loadedHistoryCount: history.length,
    lastMessages: history.slice(-5).map((m) => ({
      role: m.role,
      content: m.content,
    })),
  }, "[agent] loaded history");

  // 5. Build messages array — include planningDraft in system prompt
  const _modelInfo = getChatModel(input.modelMode);

  // Load user memory profile to inform planning context
  let userMemory: Record<string, unknown> | undefined;
  if (userId && db) {
    try {
      const memRow = await db.memory.findFirst({
        where: { userId, category: "route", title: "planning_profile", deletedAt: null },
      });
      if (memRow?.detail) {
        userMemory = JSON.parse(memRow.detail);
      }
    } catch {
      log.warn("[agentRuntime] Failed to load user memory profile");
    }
  }

  const systemPrompt = buildSystemPrompt({
    city: input.city,
    currentTime: new Date().toISOString(),
    agentState: state ? { phase: state.phase, planningDraft: state.planningDraft as Record<string, unknown> | undefined } : undefined,
    userMemory,
  });

  // Context window management: truncate history if too long, inject summary into system prompt
  const { messages: historyMessages, summary } = truncateContextIfNeeded(
    history,
    systemPrompt,
    state?.planningDraft as Record<string, unknown> | undefined,
    log,
  );

  // Inject conversation summary into system prompt if truncation occurred
  const finalSystemPrompt = summary ? `${systemPrompt}\n\n${summary}` : systemPrompt;

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: finalSystemPrompt },
    ...historyMessages,
  ];

  // 6. Tool call loop
  let currentDraft = state?.planningDraft;
  let finalContent = "";
  let toolRounds = 0;
  let shouldGeneratePlan = false;
  let planParams: Record<string, unknown> | null = null;
  let _pendingAction: AgentResponse & { type: "action_confirm" } | null = null;

  // Collected visible events for persistence and streaming
  const collectedEvents: AgentTraceEvent[] = [];
  const emitEvent = (event: AgentTraceEvent) => {
    collectedEvents.push(event);
    stream.writeEvent?.(event);
  };

  // Emit: received user message (trace point 1)
  emitEvent({
    id: traceId("recv"),
    type: "stage",
    stage: "understanding",
    label: "正在理解你的需求",
    status: "running",
    timestamp: new Date().toISOString(),
  });

  while (toolRounds < MAX_TOOL_ROUNDS) {
    const toolCtx: ToolCallContext = {
      conversationId,
      city: input.city,
      planningDraft: currentDraft,
      providers,
    };

    // Call LLM with streaming
    const { stream: llmStream, provider: _provider, model: _model } = await chatStream(messages, {
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
      const toolEventId = traceId("tool");

      // Emit tool running event (trace point 7)
      emitEvent({
        id: toolEventId,
        type: "tool",
        toolName: tc.name,
        label: getPublicToolDisplayName(tc.name),
        status: "running",
        timestamp: new Date().toISOString(),
      });

      try {
        const { resultStr, sideEffect } = await executeToolCall(tc.name, tc.arguments, toolCtx);

        // Emit tool success event (trace point 8)
        emitEvent({
          id: toolEventId,
          type: "tool",
          toolName: tc.name,
          label: getPublicToolDisplayName(tc.name),
          status: "done",
          outputSummary: summarizePublicToolResult(tc.name, resultStr),
          timestamp: new Date().toISOString(),
        });

        // Handle side effects
        if (sideEffect?.updatedDraft) {
          currentDraft = sideEffect.updatedDraft;
        }
        if (sideEffect?.shouldGeneratePlan) {
          shouldGeneratePlan = true;
          planParams = (sideEffect.result as Record<string, unknown>) ?? {};
        }

        messages.push({
          role: "tool" as const,
          tool_call_id: tc.id,
          content: resultStr,
        });
      } catch (err) {
        log.warn({ err }, `[agentRuntime] Tool ${tc.name} failed`);

        // Emit tool error event (trace point 9)
        emitEvent({
          id: toolEventId,
          type: "tool",
          toolName: tc.name,
          label: getPublicToolDisplayName(tc.name),
          status: "error",
          detail: err instanceof Error ? err.message : String(err),
          timestamp: new Date().toISOString(),
        });

        messages.push({
          role: "tool" as const,
          tool_call_id: tc.id,
          content: JSON.stringify({ error: `Tool execution failed: ${err instanceof Error ? err.message : String(err)}` }),
        });
      }
    }
  }

  // ── Log draft merge ── (trace points 2-5: slot extracting, merging, missing, defaults)
  const newSlots = extractPlanningSlots(input.message);
  const mergedDraft = currentDraft ? mergeSlots(currentDraft, newSlots) : (Object.keys(newSlots).length > 0 ? newSlots : currentDraft);
  const missingSlots = mergedDraft ? getMissingSlots(mergedDraft) : [];
  const intent = isContinuationIntent(input.message) ? "continuation" : "normal";

  // Emit slot extraction event (trace point 3)
  if (Object.keys(newSlots).length > 0) {
    const knownSlotsMap: Record<string, unknown> = {};
    const slotLabels: Record<string, string> = {
      destination: "目的地", origin: "出发地", budget: "预算",
      partySize: "人数", date: "日期", time: "时间",
      timeWindow: "时段", preference: "偏好", preferences: "偏好",
      companions: "同行人",
    };
    for (const [k, v] of Object.entries(newSlots)) {
      knownSlotsMap[slotLabels[k] ?? k] = v;
    }
    emitEvent({
      id: traceId("slot"),
      type: "slot",
      label: "已识别出行信息",
      knownSlots: knownSlotsMap,
      missingSlots: missingSlots.map((s) => slotLabels[s] ?? s),
      status: missingSlots.length > 0 ? "warning" : "done",
      timestamp: new Date().toISOString(),
    });
  }

  // Emit missing slots warning (trace point 5)
  if (missingSlots.length > 0 && Object.keys(newSlots).length === 0) {
    const slotLabels: Record<string, string> = {
      destination: "目的地", origin: "出发地", budget: "预算",
      partySize: "人数", date: "日期", time: "时间",
      timeWindow: "时段", preference: "偏好", preferences: "偏好",
      companions: "同行人",
    };
    emitEvent({
      id: traceId("slot"),
      type: "slot",
      label: "信息不完整",
      knownSlots: mergedDraft ? Object.fromEntries(
        Object.entries(mergedDraft).map(([k, v]) => [slotLabels[k] ?? k, v])
      ) : {},
      missingSlots: missingSlots.map((s) => slotLabels[s] ?? s),
      status: "warning",
      timestamp: new Date().toISOString(),
    });
  }

  log.info({
    conversationId,
    beforeDraft: state?.planningDraft,
    newSlots,
    mergedDraft,
    missingSlots,
    intent,
  }, "[agent] planning draft merge");

  // 7. If plan generation was requested, run the planning pipeline
  let planResponse: AgentResponse | null = null;
  if (shouldGeneratePlan) {
    // Emit plan_generating stage event (trace point 10)
    emitEvent({
      id: traceId("stage"),
      type: "stage",
      stage: "plan_generating",
      label: "正在生成出行方案",
      status: "running",
      timestamp: new Date().toISOString(),
    });

    try {
      const params = planParams ?? {};

      // ── CRITICAL: Merge draft INTO planParams, draft takes precedence for user values ──
      // The LLM's tool call params may be incomplete or wrong; the draft is the source of truth
      const effectiveDraft = currentDraft ?? {};
      const city = (params.city as string) ?? input.city ?? "北京";
      // origin: NEVER use "未知出发地" — leave undefined if not provided
      const origin = (typeof effectiveDraft.origin === "string" ? effectiveDraft.origin : undefined)
        ?? (params.origin as string) ?? undefined;
      // Budget: ALWAYS prefer draft (user's explicit value), never let LLM override
      const budget = (typeof effectiveDraft.budget === "number" ? effectiveDraft.budget : undefined)
        ?? (params.budget as number);
      const partySize = (typeof effectiveDraft.partySize === "number" ? effectiveDraft.partySize : undefined)
        ?? (params.partySize as number);
      const companions = (typeof effectiveDraft.companions === "string" ? effectiveDraft.companions : undefined)
        ?? (params.companions as string);
      const destination = (typeof effectiveDraft.destination === "string" ? effectiveDraft.destination : undefined)
        ?? (typeof effectiveDraft.destinationCity === "string" ? effectiveDraft.destinationCity : undefined)
        ?? (params.city as string);

      // Extract departAt from draft time — e.g. "明天上午9点"
      const departAt = (typeof effectiveDraft.time === "string" ? effectiveDraft.time : undefined)
        ?? (params.time as string) ?? undefined;

      // Build enriched prompt with all slot info
      const slotSummary: string[] = [];
      if (destination) slotSummary.push(`目的地：${destination}`);
      if (origin) slotSummary.push(`出发地：${origin}`);
      else slotSummary.push("出发地：未提供");
      if (Array.isArray(effectiveDraft.routeStops) && effectiveDraft.routeStops.length > 0) slotSummary.push(`路线顺序：${effectiveDraft.routeStops.join(" → ")}`);
      if (effectiveDraft.returnPoint) slotSummary.push(`回程终点：${effectiveDraft.returnPoint}`);
      if (effectiveDraft.time) slotSummary.push(`时间：${effectiveDraft.time}`);
      if (effectiveDraft.date) slotSummary.push(`日期：${effectiveDraft.date}`);
      if (effectiveDraft.timeWindow) slotSummary.push(`时段：${effectiveDraft.timeWindow}`);
      if (partySize) slotSummary.push(`人数：${partySize}人`);
      if (companions) slotSummary.push(`同行人：${companions}`);
      if (budget) slotSummary.push(`预算：${budget}元（用户明确提供，请严格遵守）`);
      else slotSummary.push("预算：用户未提供，请合理估算");
      if (effectiveDraft.transportMode) slotSummary.push(`交通偏好：${effectiveDraft.transportMode}`);
      const prefs = effectiveDraft.preferences || effectiveDraft.preference;
      if (prefs) slotSummary.push(`偏好：${Array.isArray(prefs) ? prefs.join("、") : prefs}`);
      if (Array.isArray(effectiveDraft.foodPreferences) && effectiveDraft.foodPreferences.length > 0) slotSummary.push(`饮食偏好：${effectiveDraft.foodPreferences.join("、")}`);
      if (effectiveDraft.bookingIntent) slotSummary.push("预约需求：需要检查预约/排队/订座");
      if (effectiveDraft.purchaseIntent) slotSummary.push("购票需求：需要检查门票/预约入口");
      if (effectiveDraft.orderingIntent) slotSummary.push("下单需求：需要生成下单草稿，用户最终确认支付");
      if (effectiveDraft.budgetFlexible) slotSummary.push(`预算灵活`);

      const enrichedPrompt = slotSummary.length > 0
        ? `${input.message}\n\n[已收集的规划信息] ${slotSummary.join("；")}`
        : input.message;

      log.info({
        conversationId,
        finalSlotsUsedForPlan: {
          city, origin, budget, partySize, companions, destination, departAt,
          time: effectiveDraft.time, date: effectiveDraft.date,
          preferences: effectiveDraft.preferences || effectiveDraft.preference,
          budgetFlexible: effectiveDraft.budgetFlexible,
        },
      }, "[agent] generate plan slots");

      const pipelineResult = await runPlanningPipeline({
        prompt: enrichedPrompt,
        city,
        startPoint: origin,
        departAt,
        budget,
        companions: companions as "family" | "friends" | "couple" | "solo" | undefined,
        modelMode: input.modelMode,
        providers,
        userId,
      });

      if (pipelineResult.responseType === "chat" || !pipelineResult.options || pipelineResult.options.length === 0) {
        planResponse = {
          type: "chat",
          content: pipelineResult.summary || "你好！请告诉我更多出行信息，我来帮你规划。",
          conversationId,
        };
      } else {
        // Emit: generating actions (trace point 11)
        emitEvent({
          id: traceId("stage"),
          type: "stage",
          stage: "action_generating",
          label: "正在生成可执行动作",
          status: "running",
          timestamp: new Date().toISOString(),
        });

        const planningActions = createPlanningActions({
          planId: pipelineResult.planId,
          conversationId,
          options: pipelineResult.options as import("../planning/schemas.js").ActivityPlan[],
          intent: pipelineResult.intent,
        });

        // Emit action guard traces (trace point 12)
        const hasOrigin = !!pipelineResult.intent?.origin?.label;
        if (!hasOrigin) {
          emitEvent({
            id: traceId("guard"),
            type: "action_guard",
            label: "未生成导航：缺少出发地",
            actionType: "navigation",
            reason: "缺少出发地，无法生成导航路线",
            status: "skipped",
            timestamp: new Date().toISOString(),
          });
        }
        const firstOption = pipelineResult.options[0];
        if (firstOption) {
          const hasStartEnd = firstOption.timeline?.[0]?.startTime && firstOption.timeline?.[firstOption.timeline.length - 1]?.endTime;
          if (!hasStartEnd) {
            emitEvent({
              id: traceId("guard"),
              type: "action_guard",
              label: "未生成日历：缺少明确时间",
              actionType: "calendar",
              reason: "缺少明确的开始/结束时间",
              status: "skipped",
              timestamp: new Date().toISOString(),
            });
          }
        }

        planResponse = {
          type: "plan",
          content: pipelineResult.summary || "已为你生成出行方案",
          data: {
            planId: pipelineResult.planId,
            options: pipelineResult.options,
            summary: pipelineResult.summary,
            executableActions: pipelineResult.executableActions,
            planningActions,
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

      // Extract and persist memory profile after successful plan generation
      if (planResponse.type === "plan" && userId) {
        try {
          const newMemory = extractMemoryFromSlots(currentDraft ?? {});
          if (Object.keys(newMemory).length > 0) {
            const existing = await db?.memory.findFirst({
              where: { userId: userId!, category: "route", title: "planning_profile", deletedAt: null },
            });
            const memoryJson = existing
              ? mergeMemoryProfile(JSON.parse(existing.detail), newMemory)
              : newMemory;
            if (existing) {
              await db?.memory.update({
                where: { id: existing.id },
                data: { detail: JSON.stringify(memoryJson), weight: 0.9 },
              });
            } else {
              await db?.memory.create({
                data: {
                  userId: userId!,
                  category: "route",
                  title: "planning_profile",
                  detail: JSON.stringify(memoryJson),
                  weight: 0.9,
                },
              });
            }
            log.info({ userId, memoryJson }, "[agentRuntime] Memory profile updated from planning slots");
          }
        } catch (memErr) {
          log.warn({ err: memErr }, "[agentRuntime] Failed to update memory profile");
        }
      }
    } catch (err) {
      log.error({ err }, "[agentRuntime] Planning pipeline failed");

      // Emit pipeline error warning
      emitEvent({
        id: traceId("warn"),
        type: "warning",
        label: "方案生成遇到问题，已切换为对话模式",
        detail: err instanceof Error ? err.message.slice(0, 100) : undefined,
        status: "warning",
        timestamp: new Date().toISOString(),
      });

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
    finalContent = "我没有理解你的意思，能再说一次吗？";
    stream.writeText(finalContent);
    agentResponse = { type: "chat", content: finalContent, conversationId };
  } else {
    agentResponse = classifyResponse(finalContent, currentDraft, state, conversationId);
  }

  // 9. Save assistant message with full payload for history restoration
  // Emit saving stage event (trace point 13)
  emitEvent({
    id: traceId("stage"),
    type: "stage",
    stage: "saving",
    label: "正在保存方案",
    status: "running",
    timestamp: new Date().toISOString(),
  });

  const { conversationId: _respCid, ...responsePayload } = agentResponse;
  const payloadJson = { ...responsePayload, content: finalContent, events: collectedEvents };
  await saveMsg(db, conversationId, "assistant", finalContent, payloadJson, log);

  // Emit finalizing stage event (trace point 14)
  emitEvent({
    id: traceId("stage"),
    type: "stage",
    stage: "finalizing",
    label: "方案已完成",
    status: "done",
    timestamp: new Date().toISOString(),
  });

  // 10. Update agent state (preserve draft across turns)
  const newState = computeAgentState(state, agentResponse, currentDraft);
  await saveAgentState(db, conversationId, newState, log);

  // 11. Update conversation title from accumulated draft
  //     currentDraft already contains all merged slots (from tool calls + extractPlanningSlots),
  //     so a single call covers both normal turns and plan-generation turns.
  const titleSlots = currentDraft ?? (Object.keys(newSlots).length > 0 ? newSlots : undefined);
  if (titleSlots) {
    const newTitle = generateTitleFromSlots(titleSlots);
    if (newTitle) {
      await updateConversationTitle(db, conversationId, newTitle, log);
    }
  }

  return agentResponse;
}

function getPublicToolDisplayName(name: string): string {
  const map: Record<string, string> = {
    update_planning_draft: "识别需求",
    search_places: "查询地点",
    generate_weekend_plan: "生成方案",
    prepare_action: "准备动作",
  };
  return map[name] ?? "处理规划";
}

function summarizePublicToolResult(toolName: string, resultStr: string): string {
  try {
    const result = JSON.parse(resultStr) as Record<string, unknown>;
    if (typeof result.error === "string") {
      return result.error.slice(0, 120);
    }
    switch (toolName) {
      case "update_planning_draft": {
        const known = result.knownSlots as Record<string, unknown> | undefined;
        const count = known ? Object.keys(known).length : 0;
        return `已识别 ${count} 项出行信息`;
      }
      case "search_places": {
        const items = result.places as unknown[] | undefined;
        return items ? `找到 ${items.length} 个候选地点` : "地点查询完成";
      }
      case "generate_weekend_plan":
        return "方案结构已生成";
      case "prepare_action":
        return "动作入口已准备";
      default:
        return "处理完成";
    }
  } catch {
    return "处理完成";
  }
}

// ─── Response Classification ────────────────────────────────

function classifyResponse(
  content: string,
  draft: PlanningSlots | undefined,
  state: AgentState | null,
  conversationId: string,
): AgentResponse {
  const missing = draft ? getMissingSlots(draft) : [];

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
        planningDraft: draft, // preserve draft after plan generation
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
      return base;
  }
}

// ─── DB Helpers ─────────────────────────────────────────────

type HistoryMessage = { role: string; content: string };

async function ensureConversation(
  db: PrismaClient | null,
  userId: string | undefined,
  input: AgentChatInput,
  log: AgentChatContext["log"],
): Promise<string> {
  if (input.conversationId) {
    if (db) {
      try {
        const existing = await db.conversation.findUnique({
          where: { id: input.conversationId },
          select: { id: true, userId: true },
        });
        if (existing) {
          // Ownership check: logged-in user must only use their own conversations
          if (userId && existing.userId && existing.userId !== userId) {
            log.warn(`[agentRuntime] ensureConversation OWNERSHIP MISMATCH conv=${input.conversationId} owner=${existing.userId} current=${userId}, creating new`);
            // Fall through to create a new conversation
          } else {
            log.info(`[agentRuntime] ensureConversation FOUND conv=${input.conversationId}`);
            return input.conversationId;
          }
        }
        const memConv = mem.getConversation(input.conversationId);
        if (memConv) {
          if (userId && memConv.userId && memConv.userId !== userId) {
            log.warn(`[agentRuntime] ensureConversation MEMORY OWNERSHIP MISMATCH conv=${input.conversationId}`);
            // Fall through to create new
          } else {
            log.info(`[agentRuntime] ensureConversation FOUND in MEMORY conv=${input.conversationId}`);
            return input.conversationId;
          }
        }
      } catch (err) {
        log.error({ err }, "[agentRuntime] Failed to verify conversationId");
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
          guestId: !userId ? (input.guestId ?? undefined) : undefined,
          title,
          city: input.city ?? "北京",
          modelMode: (input.modelMode as "flash" | "pro") ?? "flash",
        },
      });
      log.info(`[agentRuntime] ensureConversation CREATED DB conv=${conv.id} userId=${userId ?? "null"} guestId=${input.guestId ?? "null"}`);
      return conv.id;
    } catch (err) {
      log.error({ err }, "[agentRuntime] Failed to create conversation in DB — conversation will be MEMORY ONLY and LOST on server restart!");
    }
  }

  const conv = mem.createConversation({
    userId,
    title,
    city: input.city,
    modelMode: input.modelMode,
  });
  log.info(`[agentRuntime] ensureConversation CREATED MEM conv=${conv.id} userId=${userId ?? "null"}`);
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
          agentStateJson: state as unknown as Prisma.InputJsonValue,
          selectedOptionId: state.selectedOptionId ?? null,
          updatedAt: new Date(),
        },
      });
      log.info(`[agentRuntime] saveAgentState OK conv=${conversationId} phase=${state.phase}`);
    } catch (err) {
      log.error({ err }, `[agentRuntime] saveAgentState FAILED conv=${conversationId}`);
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
      const msg = await db.message.create({
        data: { conversationId, role, content, payloadJson: payloadJson as unknown as Prisma.InputJsonValue },
      });
      log?.info({
        conversationId,
        role,
        messageId: msg.id,
      }, "[agentRuntime] message saved to DB");
      try {
        await db.conversation.update({
          where: { id: conversationId },
          data: { updatedAt: new Date() },
        });
      } catch { /* non-critical */ }
      return;
    } catch (err) {
      log?.error({
        conversationId,
        role,
        err,
      }, "[agentRuntime] message DB write failed");
    }
  }
  mem.addMessage({ conversationId, role, content, payloadJson });
  log?.warn({ conversationId, role }, "[agentRuntime] message saved to MEMORY only (DB unavailable)");
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
        orderBy: { createdAt: "desc" },
        take: MAX_HISTORY_MESSAGES,
        select: { role: true, content: true },
      });
      return msgs.reverse();
    } catch {
      log.warn("[agentRuntime] Failed to load history from DB");
    }
  }

  const memMsgs = mem.listMessages(conversationId);
  return memMsgs.slice(-MAX_HISTORY_MESSAGES).map((m: { role: string; content: string }) => ({
    role: m.role,
    content: m.content,
  }));
}

// ─── Context Window Management ──────────────────────────────

/**
 * Estimate token count for a message (rough heuristic).
 */
function estimateMessageTokens(content: string): number {
  const cnChars = (content.match(/[\u4e00-\u9fff]/g) || []).length;
  const enWords = (content.replace(/[\u4e00-\u9fff]/g, " ").trim().split(/\s+/).filter(Boolean).length);
  return Math.round(cnChars * 0.3 + enWords * 1.3);
}

/**
 * When conversation history is too long, truncate to a sliding window
 * and inject a summary of older turns into the system prompt.
 */
function truncateContextIfNeeded(
  history: HistoryMessage[],
  systemPrompt: string,
  planningDraft: Record<string, unknown> | undefined,
  log: AgentChatContext["log"],
): { messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]; summary?: string } {
  const KEEP_RECENT = 10;
  const summaryPrefix = "【对话摘要】（早期对话的压缩摘要，供参考）：\n";

  let totalTokens = estimateMessageTokens(systemPrompt);
  for (const msg of history) {
    totalTokens += estimateMessageTokens(msg.content);
  }

  if (totalTokens <= MAX_HISTORY_TOKENS_ESTIMATE || history.length <= KEEP_RECENT) {
    return {
      messages: history.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    };
  }

  const recentMessages = history.slice(-KEEP_RECENT);
  const olderMessages = history.slice(0, -KEEP_RECENT);

  const summaryParts: string[] = [];
  for (const msg of olderMessages) {
    const roleLabel = msg.role === "user" ? "用户" : "助手";
    const preview = msg.content.length > 100 ? msg.content.slice(0, 100) + "…" : msg.content;
    summaryParts.push(`- ${roleLabel}：${preview}`);
  }

  const summary = summaryPrefix + summaryParts.join("\n");
  log.info({ olderCount: olderMessages.length, recentCount: KEEP_RECENT }, "[agentRuntime] truncated history to sliding window");

  return {
    messages: recentMessages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    summary,
  };
}

// ─── Tool Display Name Helper ───────────────────────────────

function getToolDisplayName(name: string): string {
  const map: Record<string, string> = {
    update_planning_draft: "记录规划信息",
    search_places: "搜索地点",
    generate_weekend_plan: "生成出行方案",
    prepare_action: "准备执行动作",
  };
  return map[name] ?? name;
}

// ─── Tool Result Summary Helper ─────────────────────────────

/**
 * Produce a short, user-friendly summary of a tool result.
 * Never exposes raw API keys, tokens, or full internal payloads.
 */
function summarizeToolResult(toolName: string, resultStr: string): string {
  try {
    const result = JSON.parse(resultStr) as Record<string, unknown>;
    if (typeof result.error === "string") {
      return result.error.slice(0, 120);
    }
    switch (toolName) {
      case "update_planning_draft": {
        const known = result.knownSlots as Record<string, unknown> | undefined;
        const count = known ? Object.keys(known).length : 0;
        return `已记录 ${count} 项规划信息`;
      }
      case "search_places": {
        const items = result.places as unknown[] | undefined;
        return items ? `找到 ${items.length} 个相关地点` : "搜索完成";
      }
      case "generate_weekend_plan":
        return "方案生成请求已提交";
      case "prepare_action":
        return "执行动作已准备就绪";
      default:
        return "操作完成";
    }
  } catch {
    return "操作完成";
  }
}
