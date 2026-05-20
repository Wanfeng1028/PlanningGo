import { createTraceId, createId } from "../../common/id";
import { env } from "../../config/env";
import { createToolExecutor } from "../tools/executor";
import { buildCityContext, applyCityGuard } from "./middleware/cityGuard";
import { hasPermission, filterActionsByPermissions, type UserPermissionSnapshot } from "./middleware/permissionGuard";
import { extractIntent } from "./intent";
import { buildPlanningContext } from "../planning/contextBuilder";
import { generateCandidates } from "../planning/candidateGenerator";
import { rankCandidates } from "../planning/ranking";
import { generateMockPlans, generateLlmPlans } from "./planner";
import { validatePlans } from "../planning/validator";
import { createActionsForPlans } from "../execution/actionService";
import type { ActivityPlan, ExecutionAction, UserIntent } from "../planning/schemas";
import type { PlanningRequest } from "../../types";
import type { ToolCallPlan, ToolExecutionContext, CityContext } from "../tools/types";

/**
 * Agent Runtime input
 */
export interface AgentRunInput {
  userId?: string;
  guestId?: string;
  conversationId?: string;
  prompt: string;
  city?: string;
  lat?: number;
  lng?: number;
  modelMode: "flash" | "pro";
  planningMode?: "mock" | "hybrid" | "llm";
  device: "desktop" | "mobile";
  source: "home" | "feature" | "qr_handoff" | "api";
  permissions?: UserPermissionSnapshot;
}

/**
 * Agent Runtime result
 */
export interface AgentRunResult {
  traceId: string;
  conversationId: string;
  userMessageId: string;
  assistantMessageId: string;
  intent: UserIntent;
  cityContext: CityContext;
  toolSummary: {
    totalCalls: number;
    totalLatencyMs: number;
    successfulCalls: number;
    failedCalls: number;
    toolsUsed: string[];
    errors: Array<{ tool: string; error: string }>;
  };
  options: ActivityPlan[];
  executableActions: ExecutionAction[];
  autoExecutedActions: ExecutionAction[];
  blockedActions: ExecutionAction[];
  validation: any;
  nextActions: string[];
  modelMode: string;
  llmModel: string;
}

/**
 * Agent Runtime - orchestrates the entire planning pipeline with tool integration
 */
export async function runAgentRuntime(input: AgentRunInput): Promise<AgentRunResult> {
  const traceId = createTraceId();
  const planId = createId("plan");
  const conversationId = input.conversationId || createId("conv");
  const userMessageId = createId("msg");
  const assistantMessageId = createId("msg");
  const mode = input.planningMode ?? env.PLANNING_MODE;
  const modelMode = input.modelMode ?? "flash";

  // Select LLM model based on mode
  const llmModel =
    modelMode === "pro"
      ? (env.LLM_PRO_MODEL ?? env.LLM_MODEL)
      : (env.LLM_FLASH_MODEL ?? env.LLM_MODEL);

  // 1. Build city context
  const cityContext = buildCityContext({
    manualCity: input.city,
    browserLat: input.lat,
    browserLng: input.lng,
    profileCity: undefined, // Would load from DB in production
    conversationCity: undefined, // Would load from conversation in production
    fallbackCity: undefined, // Don't default to Beijing
  });

  // 2. Parse intent
  const planningRequest: PlanningRequest = {
    prompt: input.prompt,
    city: cityContext.city || undefined,
    startPoint: undefined,
    budget: undefined,
    departAt: undefined,
    companions: undefined,
  };

  const intent = await extractIntent(planningRequest);

  // 3. Build planning context
  const context = await buildPlanningContext({ traceId, planId, intent });

  // 4. Create tool executor
  const executor = createToolExecutor(modelMode);

  // 5. Execute tools in parallel batches if not in mock mode
  let toolSummary: {
    totalCalls: number;
    totalLatencyMs: number;
    successfulCalls: number;
    failedCalls: number;
    toolsUsed: string[];
    errors: Array<{ tool: string; error: string }>;
  } = {
    totalCalls: 0,
    totalLatencyMs: 0,
    successfulCalls: 0,
    failedCalls: 0,
    toolsUsed: [],
    errors: [],
  };

  if (mode !== "mock" && cityContext.city) {
    const toolCtx: ToolExecutionContext = {
      traceId,
      userId: input.userId,
      guestId: input.guestId,
      city: cityContext.city,
      adcode: cityContext.adcode,
      lat: input.lat,
      lng: input.lng,
    };

    // Batch 1: Context discovery (weather, POI search)
    try {
      const batch1 = await executor.runBatch({
        batchName: "context_discovery",
        parallel: true,
        maxConcurrency: 5,
        tools: [
          {
            tool: "amap.weatherLive",
            input: { city: cityContext.city },
            reason: "Get current weather",
          },
          {
            tool: "amap.weatherForecast",
            input: { city: cityContext.city },
            reason: "Get weather forecast",
          },
          {
            tool: "amap.searchPoiText",
            input: {
              keywords: intent.participantMode === "family" ? "亲子 展览 室内" : "展览 活动",
              city: cityContext.city,
              citylimit: true,
              offset: 10,
            },
            reason: "Search for activities",
          },
          {
            tool: "amap.searchPoiText",
            input: {
              keywords: "轻食 餐厅",
              city: cityContext.city,
              citylimit: true,
              offset: 10,
            },
            reason: "Search for restaurants",
          },
        ],
        ctx: toolCtx,
      });

      toolSummary = executor.getSummary(batch1.results);
    } catch (error) {
      // Tool failures should not crash the pipeline
      console.error("Tool execution failed:", error);
      toolSummary.errors.push({
        tool: "batch",
        error: error instanceof Error ? error.message : String(error),
      } as { tool: string; error: string });
    }
  }

  // 6. Generate candidates (with mock fallback if tools failed)
  const candidates = await generateCandidates(context);

  // 7. Rank candidates
  const ranked = rankCandidates(intent, candidates);

  // 8. Generate plans
  let options;
  if (mode === "llm") {
    options = await generateLlmPlans({ traceId, planId, intent, context, candidates: ranked });
  } else if (mode === "hybrid") {
    try {
      options = await generateLlmPlans({ traceId, planId, intent, context, candidates: ranked });
    } catch {
      options = generateMockPlans({ traceId, planId, intent, context, candidates: ranked });
    }
  } else {
    options = generateMockPlans({ traceId, planId, intent, context, candidates: ranked });
  }

  // 9. Validate plans
  const validation = validatePlans({ intent, candidates: ranked, options });

  // 10. Generate executable actions
  const executableActions = createActionsForPlans({ planId, options, intent });

  // 11. Filter actions by permissions
  const permissions = input.permissions || {
    locationEnabled: true,
    memoryEnabled: true,
    calendarEnabled: false,
    shareEnabled: true,
    developerEnabled: false,
    grantedScopes: [],
  };

  const { allowed, blocked } = filterActionsByPermissions(executableActions, permissions);

  // 12. Auto-execute allowed actions (if enabled)
  const autoExecutedActions: ExecutionAction[] = [];
  if (env.AUTO_EXECUTION_ENABLED) {
    // In production, this would actually execute the actions
    // For now, just mark them as prepared
    for (const action of allowed.slice(0, env.AUTO_EXECUTION_MAX_ACTIONS)) {
      if (action.type === "navigation") {
        // Navigation can be auto-executed
        autoExecutedActions.push({ ...action, status: "success" as any });
      }
    }
  }

  // 13. Validate output city safety
  if (cityContext.city) {
    for (const option of options) {
      const summaryText = `${option.title} ${option.summary} ${option.timeline.map((t) => t.title).join(" ")}`;
      // Simple city validation - in production use proper NLP
      const cityPattern = /(北京|上海|天津|重庆|广州|深圳|杭州|南京|苏州|成都|武汉|西安|郑州|青岛|大连|厦门|长沙|哈尔滨|沈阳|济南|昆明|贵阳|兰州|南昌|福州|合肥|海口|石家庄|太原|长春|南宁|呼和浩特|银川|西宁|乌鲁木齐|拉萨|无锡|常州|南通|宁波|温州|嘉兴|绍兴|金华|台州|湖州|衢州|丽水|舟山)/g;
      const matches = summaryText.match(cityPattern);
      if (matches && !matches.includes(cityContext.city)) {
        console.warn(`Output city safety check failed: found cities ${matches.join(", ")} but expected ${cityContext.city}`);
      }
    }
  }

  // 14. Return result
  return {
    traceId,
    conversationId,
    userMessageId,
    assistantMessageId,
    intent,
    cityContext,
    toolSummary,
    options,
    executableActions,
    autoExecutedActions,
    blockedActions: blocked,
    validation,
    nextActions: ["选择方案", "查看风险", "确认预约", "写入日历", "分享给同行人"],
    modelMode,
    llmModel,
  };
}
