/**
 * Agent Response Protocol — 周末去哪儿
 *
 * 统一响应类型，支持 8 种分支：chat / identity / travel_advice / slot_question /
 * plan / plan_selected / action_confirm / error
 */

// ─── Agent Intent ───────────────────────────────────────────

export type AgentIntent =
  | "greeting"
  | "identity_question"
  | "capability_question"
  | "casual_chat"
  | "travel_question"
  | "planning_request"
  | "slot_fill"
  | "select_plan"
  | "execute_action"
  | "modify_plan"
  | "continuation"
  | "unknown";

// ─── Planning Slots ─────────────────────────────────────────

export type PlanningSlotKey =
  | "origin"
  | "destination"
  | "budget"
  | "partySize"
  | "date"
  | "time"
  | "timeWindow"
  | "preference"
  | "preferences"
  | "companions";

export type PlanningSlots = Partial<Record<PlanningSlotKey, string | number | string[]>> & {
  destinationCity?: string;
  budgetFlexible?: boolean;
};

// ─── Next Action & Pending Action ───────────────────────────

export interface NextAction {
  key: string;
  label: string;
}

export interface PendingAction {
  id: string;
  title: string;
  description: string;
  actionKey?: string;
}

// ─── Agent Message Input (frontend → backend) ───────────────

export interface AgentMessageInput {
  message: string;
  city?: string;
  modelMode?: string;
  conversationId?: string;
  selectedOptionId?: string;
  guestId?: string;
}

// ─── Agent State (persisted per conversation) ───────────────

export type AgentPhase =
  | "idle"
  | "chatting"
  | "collecting_slots"
  | "plan_generated"
  | "plan_selected"
  | "action_confirming"
  | "action_done";

export interface AgentState {
  phase: AgentPhase;
  planningDraft?: PlanningSlots;
  lastPlanResult?: {
    planId: string;
    options: unknown[];
  };
  selectedOptionId?: string;
  selectedPlanTitle?: string;
  pendingAction?: PendingAction;
  lastAssistantType?: AgentResponse["type"];
  lastToolCalls?: Array<{
    name: string;
    status: string;
    latencyMs?: number;
  }>;
}

// ─── Unified Planning Action ─────────────────────────────────

/** 统一的可执行动作类型，前端可直接渲染 */
export type PlanningAction =
  | {
      type: "open_url";
      label: string;
      url: string;
      target?: "_blank";
    }
  | {
      type: "map_search";
      label: string;
      provider: "amap" | "baidu" | "google";
      query: string;
      city?: string;
    }
  | {
      type: "navigation";
      label: string;
      provider: "amap" | "baidu";
      origin?: string;
      destination: string;
      mode?: "walking" | "driving" | "transit";
    }
  | {
      type: "copy_text";
      label: string;
      text: string;
    }
  | {
      type: "calendar";
      label: string;
      title: string;
      startTime?: string;
      endTime?: string;
      description?: string;
    }
  | {
      type: "mobile_handoff";
      label: string;
      conversationId: string;
      planId?: string;
      actionId?: string;
    };

// ─── User Memory Profile (前端画像摘要) ─────────────────────

/** 从对话中提取并持久化的用户偏好画像 */
export interface UserMemoryProfile {
  homeOrigin?: string;
  commonCity?: string;
  budgetRange?: [number, number];
  companionsPreference?: string;
  foodPreferences?: string[];
  activityPreferences?: string[];
  timePreferences?: string[];
  riskPreferences?: string[];
}

// ─── Agent Response (backend → frontend) ────────────────────

export interface AgentResponseMetadata {
  provider?: string;
  model?: string;
  mode?: "llm" | "rule" | "mock" | "hybrid";
  fallbackUsed?: boolean;
  traceId?: string;
}

export type AgentResponse =
  | {
      type: "chat";
      content: string;
      conversationId: string;
      metadata?: AgentResponseMetadata;
    }
  | {
      type: "identity";
      content: string;
      conversationId: string;
      metadata?: AgentResponseMetadata;
    }
  | {
      type: "travel_advice";
      content: string;
      suggestions: string[];
      conversationId: string;
      metadata?: AgentResponseMetadata;
    }
  | {
      type: "slot_question";
      content: string;
      missingSlots: PlanningSlotKey[];
      knownSlots: PlanningSlots;
      conversationId: string;
      metadata?: AgentResponseMetadata;
    }
  | {
      type: "plan";
      content: string;
      data: {
        planId: string;
        options: unknown[];
        summary: string;
        executableActions?: unknown[];
        planningActions?: PlanningAction[];
        conversationId?: string;
      };
      conversationId: string;
      metadata?: AgentResponseMetadata;
    }
  | {
      type: "plan_selected";
      content: string;
      selectedOptionId: string;
      selectedPlanTitle: string;
      nextActions: NextAction[];
      conversationId: string;
      metadata?: AgentResponseMetadata;
    }
  | {
      type: "action_confirm";
      content: string;
      action: PendingAction;
      conversationId: string;
      metadata?: AgentResponseMetadata;
    }
  | {
      type: "error";
      content: string;
      code?: string;
      conversationId?: string;
      metadata?: AgentResponseMetadata;
    };

// ─── Agent Visible Events (execution process) ───────────────

export type AgentVisibleEvent =
  | {
      type: "stage";
      stage:
        | "understanding"
        | "slot_extracting"
        | "slot_merging"
        | "weather_checking"
        | "place_searching"
        | "route_planning"
        | "plan_generating"
        | "action_generating"
        | "finalizing";
      title: string;
      detail?: string;
      status: "pending" | "running" | "success" | "error" | "skipped";
      timestamp: string;
    }
  | {
      type: "slot_update";
      title: string;
      slots: Record<string, unknown>;
      timestamp: string;
    }
  | {
      type: "tool";
      toolName: string;
      title: string;
      status: "running" | "success" | "error" | "fallback";
      detail?: string;
      fallbackUsed?: boolean;
      timestamp: string;
    }
  | {
      type: "warning";
      title: string;
      detail?: string;
      timestamp: string;
    };
