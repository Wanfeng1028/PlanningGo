import type { PlanningOption, PlanningExecutableAction } from "../../lib/api";

/* ── Re-export API types used by extracted feature components ── */
export type { PlanningOption, PlanningExecutableAction };

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
  /** Metadata from backend (provider, model, fallbackUsed) — dev-only display */
  metadata?: {
    provider?: string;
    model?: string;
    fallbackUsed?: boolean;
  };
  chips?: string[];
  plans?: PlanningOption[];
  actions?: PlanningExecutableAction[];
  actionQuotingId?: string;
  actionQuotedPreview?: string;
  nextActions?: NextActionItem[];
  selectedOptionId?: string;
  selectedPlanTitle?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  city: string;
  createdAt: string;
  updatedAt: string;
}

/** Whether we're in development mode (Vite sets this) */
export const isDev = import.meta.env.DEV;

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

/** Minimal Web Speech API interface */
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

/** ── Speech Recognition typings ── */
export interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

export interface SpeechRecognitionErrorEvent {
  error: string;
}
