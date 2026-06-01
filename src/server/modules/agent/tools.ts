/**
 * tools.ts — Agent 工具注册与调度
 *
 * 汇总所有工具的 OpenAI function 定义，以及工具调用的分发逻辑。
 */
import type OpenAI from "openai";
import type { PlanningSlots } from "../../../shared/agentResponse.js";
import type { PlanningProviders } from "../planning/schemas.js";
import {
  updatePlanningDraftToolDef,
  executeUpdatePlanningDraft,
  type UpdateDraftInput,
} from "./slotTools.js";
import {
  searchPlacesToolDef,
  executeSearchPlaces,
  type SearchPlacesInput,
} from "./placeTools.js";
import {
  prepareActionToolDef,
  generateWeekendPlanToolDef,
  executePrepareAction,
  type PrepareActionInput,
} from "./actionTools.js";

// ─── Tool Definitions (for OpenAI function calling) ─────────

export const AGENT_TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  updatePlanningDraftToolDef,
  searchPlacesToolDef,
  generateWeekendPlanToolDef,
  prepareActionToolDef,
];

// ─── Tool Call Context ──────────────────────────────────────

export interface ToolCallContext {
  conversationId: string;
  city?: string;
  planningDraft?: PlanningSlots;
  providers?: PlanningProviders;
}

// ─── Tool Call Result ───────────────────────────────────────

export interface ToolCallResult {
  toolName: string;
  result: unknown;
  updatedDraft?: PlanningSlots;
  shouldGeneratePlan?: boolean;
  shouldConfirmAction?: boolean;
}

// ─── Dispatch ───────────────────────────────────────────────

/**
 * Execute a single tool call and return the result as a string (for sending back to LLM).
 */
export async function executeToolCall(
  toolName: string,
  argsStr: string,
  ctx: ToolCallContext,
): Promise<{ resultStr: string; sideEffect?: Partial<ToolCallResult> }> {
  let args: Record<string, unknown>;
  try {
    args = JSON.parse(argsStr);
  } catch {
    return { resultStr: JSON.stringify({ error: "Invalid JSON arguments" }) };
  }

  switch (toolName) {
    case "update_planning_draft": {
      const result = executeUpdatePlanningDraft(ctx.planningDraft, args as unknown as UpdateDraftInput);
      return {
        resultStr: JSON.stringify(result),
        sideEffect: {
          toolName,
          result,
          updatedDraft: result.knownSlots,
        },
      };
    }

    case "search_places": {
      const result = await executeSearchPlaces(args as unknown as SearchPlacesInput, { city: ctx.city });
      return {
        resultStr: JSON.stringify(result),
        sideEffect: { toolName, result },
      };
    }

    case "generate_weekend_plan": {
      // Signal the runtime to run the planning pipeline
      return {
        resultStr: JSON.stringify({
          status: "plan_requested",
          params: args,
          message: "规划请求已收到，正在生成方案...",
        }),
        sideEffect: {
          toolName,
          result: args,
          shouldGeneratePlan: true,
        },
      };
    }

    case "prepare_action": {
      const result = executePrepareAction(args as unknown as PrepareActionInput);
      return {
        resultStr: JSON.stringify(result),
        sideEffect: {
          toolName,
          result: result.action,
          shouldConfirmAction: true,
        },
      };
    }

    default:
      return {
        resultStr: JSON.stringify({ error: `Unknown tool: ${toolName}` }),
      };
  }
}
