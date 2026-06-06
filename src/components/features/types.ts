/**
 * @fileoverview Shared types for plan card view, chat messages, and related components.
 */

import type { PlanningOption, PlanningExecutableAction, PlanningAction } from "../../lib/api";
import type { AgentTraceEvent } from "../../shared/agentResponse";

/* ── Re-export API types used by extracted feature components ── */
export type { PlanningOption, PlanningExecutableAction, PlanningAction };

// ── Plan Card Types ─────────────────────────────────────────

export interface PlanOption {
  id: string;
  title: string;
  summary: string;
  score: number;
  totalDurationMinutes: number;
  totalCostMin: number;
  totalCostMax: number;
  walkingKm?: number;
  assumptions: string[];
  highlights: string[];
  risks: string[];
  timeline: PlanStep[];
  backupPlan?: string;
}

export interface PlanStep {
  id: string;
  startTime: string;
  endTime: string;
  type: string;
  title: string;
  poiId: string | null;
  poiName: string | null;
  durationMinutes: number;
  transport: string;
  reasoning: string;
  bookingNeeded: boolean;
  actionId: string | null;
  description?: string;
  estimatedCost?: string;
  bookingHint?: string;
  suggestions?: string[];
  whyRecommended?: string;
  recommendedItems?: string[];
  bookingAdvice?: string;
  queueRisk?: string;
  businessHours?: string;
  actionHints?: string[];
  fallbackPois?: string[];
}

export interface PlanCardData {
  options: PlanOption[];
  selectedOptionId?: string;
  intent?: Record<string, unknown>;
}

// ── Chat Types ──────────────────────────────────────────────

export type ChatMessageKind =
  | "text"
  | "identity"
  | "travel_advice"
  | "slot_question"
  | "plan"
  | "plan_selected"
  | "action_confirm"
  | "action_result"
  | "error";

export interface NextActionItem {
  key: string;
  label: string;
}

export const MODEL_MODES = ["Flash", "Pro"] as const;
export type ModelMode = typeof MODEL_MODES[number];

export type MessageStatus = "streaming" | "done" | "error" | "fallback";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  kind?: ChatMessageKind;
  content: string;
  createdAt: string;
  status?: "thinking" | "success" | "error" | MessageStatus;
  metadata?: {
    provider?: string;
    model?: string;
    fallbackUsed?: boolean;
  };
  chips?: string[];
  plans?: PlanningOption[];
  actions?: PlanningExecutableAction[];
  nextActions?: NextActionItem[];
  selectedOptionId?: string;
  selectedPlanTitle?: string;
  traceEvents?: AgentTraceEvent[];
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  city: string;
  createdAt: string;
  updatedAt: string;
}

export type AttachmentItem = {
  id: string;
  file: File;
  previewUrl?: string;
};

export type VoiceState =
  | "idle"
  | "listening"
  | "no-speech"
  | "not-allowed"
  | "not-supported"
  | "error"
  | "processing";

export interface SpeechRecognitionInstance {
  start: () => void;
  stop: () => void;
  abort: () => void;
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}

export interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

export interface SpeechRecognitionErrorEvent {
  error: string;
}
