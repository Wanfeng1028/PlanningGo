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
  | "unknown";

// ─── Planning Slots ─────────────────────────────────────────

export type PlanningSlotKey =
  | "origin"
  | "budget"
  | "partySize"
  | "date"
  | "timeWindow"
  | "preference"
  | "companions";

export type PlanningSlots = Partial<Record<PlanningSlotKey, string | number | string[]>> & {
  destinationCity?: string;
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

// ─── Agent Response (backend → frontend) ────────────────────

export type AgentResponse =
  | {
      type: "chat";
      content: string;
      conversationId: string;
    }
  | {
      type: "identity";
      content: string;
      conversationId: string;
    }
  | {
      type: "travel_advice";
      content: string;
      suggestions: string[];
      conversationId: string;
    }
  | {
      type: "slot_question";
      content: string;
      missingSlots: PlanningSlotKey[];
      knownSlots: PlanningSlots;
      conversationId: string;
    }
  | {
      type: "plan";
      content: string;
      data: {
        planId: string;
        options: unknown[];
        summary: string;
        executableActions?: unknown[];
        conversationId?: string;
      };
      conversationId: string;
    }
  | {
      type: "plan_selected";
      content: string;
      selectedOptionId: string;
      selectedPlanTitle: string;
      nextActions: NextAction[];
      conversationId: string;
    }
  | {
      type: "action_confirm";
      content: string;
      action: PendingAction;
      conversationId: string;
    }
  | {
      type: "error";
      content: string;
      code?: string;
      conversationId?: string;
    };
