/**
 * tools.ts — Agent 工具注册与调度
 *
 * 汇总所有工具的 OpenAI function 定义，以及工具调用的分发逻辑。
 *
 * 安全修复 (#1)：所有工具参数必须经过 Zod schema 校验后再使用，
 * 防止 LLM 传入恶意/畸形参数导致类型转换错误或注入风险。
 */
import type OpenAI from "openai";
import type { PlanningSlots } from "../../../shared/agentResponse.js";
import type { PlanningProviders } from "../planning/schemas.js";
import {
  updatePlanningDraftToolDef,
  executeUpdatePlanningDraft,
  type UpdateDraftInput,
  updateDraftInputSchema,
} from "./slotTools.js";
import {
  searchPlacesToolDef,
  executeSearchPlaces,
  type SearchPlacesInput,
  searchPlacesInputSchema,
} from "./placeTools.js";
import {
  prepareActionToolDef,
  generateWeekendPlanToolDef,
  executePrepareAction,
  type PrepareActionInput,
  prepareActionInputSchema,
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

// ─── Parameter Validation Helper ────────────────────────────

/**
 * Validate and parse tool arguments with Zod schema.
 * Returns { valid: true, args } or { valid: false, error }.
 */
function validateToolArgs(
  toolName: string,
  argsStr: string,
): { valid: true; args: Record<string, unknown> } | { valid: false; error: string } {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(argsStr);
  } catch {
    return { valid: false, error: "Invalid JSON arguments" };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { valid: false, error: "Tool arguments must be a JSON object" };
  }

  // Validate against tool-specific schema
  let validated: Record<string, unknown>;
  switch (toolName) {
    case "update_planning_draft": {
      const result = updateDraftInputSchema.safeParse(parsed);
      if (!result.success) {
        return { valid: false, error: `update_planning_draft validation failed: ${result.error.message}` };
      }
      validated = result.data;
      break;
    }
    case "search_places": {
      const result = searchPlacesInputSchema.safeParse(parsed);
      if (!result.success) {
        return { valid: false, error: `search_places validation failed: ${result.error.message}` };
      }
      validated = result.data;
      break;
    }
    case "prepare_action": {
      const result = prepareActionInputSchema.safeParse(parsed);
      if (!result.success) {
        return { valid: false, error: `prepare_action validation failed: ${result.error.message}` };
      }
      validated = result.data;
      break;
    }
    case "generate_weekend_plan": {
      // This tool only needs valid JSON (params are passed through to planning pipeline)
      validated = parsed;
      break;
    }
    default:
      return { valid: false, error: `Unknown tool: ${toolName}` };
  }

  return { valid: true, args: validated };
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
  // Validate args BEFORE using them
  const validation = validateToolArgs(toolName, argsStr);
  if (!validation.valid) {
    return { resultStr: JSON.stringify({ error: validation.error }) };
  }

  const args = validation.args;

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
