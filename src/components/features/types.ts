import type { PlanningOption, PlanningExecutableAction } from "../../lib/api";

/* ── Re-export API types used by extracted feature components ── */
export type { PlanningOption, PlanningExecutableAction };

export const MODEL_MODES = ["Flash", "Pro"] as const;
export type ModelMode = typeof MODEL_MODES[number];

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  status?: "thinking" | "success" | "error";
  chips?: string[];
  plans?: PlanningOption[];
  actions?: PlanningExecutableAction[];
  actionQuotingId?: string;
  actionQuotedPreview?: string;
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
