import { useCallback, useEffect,  useRef, useState } from "react";
import { v4 as uuid } from "uuid";
import {
  confirmExecAction,
  checkHealth,
  addMemory,
  selectPlan,
  listConversations,
  getConversation,
  trackEvent as apiTrackEvent,
  reportClientError,
  trackAction,
  type PlanningOption,
  type PlanningExecutableAction,
  selectAgentPlan,
  savePlanToDb,
} from "../lib/api";
import { runPlanAction } from "../lib/runPlanAction";
import type { AgentTraceEvent } from "../shared/agentResponse";
import { GlassToast, useGlassToast } from "../components/GlassToast";
import { validateInputLength } from "../lib/tokens";
import { sanitizeMarkdown } from "../lib/sanitize";
import { streamAgentMessage } from "../lib/stream";
import { WorkspaceModal } from "../components/WorkspaceModal";
import { Button } from "../components/Button";
import type { ModalKey, NavKey, SessionUser } from "../types";
import type { ChatMessage, ChatSession, AttachmentItem, ModelMode, ChatMessageKind, NextActionItem, MessageStatus, PlanningAction } from "../components/features/types";
import { MODEL_MODES } from "../components/features/types";
import { SUGGESTION_PROMPTS } from "../components/features/constants";
import { AmbientBackground } from "../components/features/AmbientBackground";
import { FeaturesSidebar } from "../components/features/FeaturesSidebar";
import { Composer } from "../components/features/Composer";
import { PlanCardView } from "../components/features/PlanCardView";
import { usePlanActions } from "../components/features/usePlanActions";
import { ErrorCardView } from "../components/features/ErrorCardView";
import { MobileHandoffQRCode } from "../components/features/MobileHandoffQRCode";
import styles from "./FeaturesPage.module.scss";

/* ═══════════════════════════════════════════════
   FeaturesPage — Gemini-style AI Planning Workspace
   ═══════════════════════════════════════════════ */

interface FeaturesPageProps {
  user?: SessionUser | null;
  onOpenModal?: (key: ModalKey) => void;
  onRequestLocation?: () => void;
  onNavigate?: (key: NavKey) => void;
  location?: {
    city: string;
    locationLabel: string;
    latitude?: number;
    longitude?: number;
    locationSource?: string;
    needsConfirmation: boolean;
    pendingCity: string | null;
    onConfirmCity: (city: string) => void;
    onDismissConfirm: () => void;
  };
}

type ChatPhase =
  | "idle"
  | "understanding"
  | "planning"
  | "result"
  | "selected"
  | "executing"
  | "done"
  | "error";

/** 将前端 ModelMode 转为后端期望的小写格式 */
function toApiModelMode(mode: ModelMode): "flash" | "pro" {
  return mode.toLowerCase() as "flash" | "pro";
}

/** Safely map DB messages to ChatMessage[], degrading individual parse failures to plain text */
function safeMapDbMessages(
  dbMessages: Array<{ id: string; role: string; content: string; createdAt: string; payloadJson?: Record<string, unknown> }>,
): ChatMessage[] {
  return dbMessages.map((m) => {
    try {
      const payload = m.payloadJson as Record<string, unknown> | undefined;
      const payloadType = (payload?.type as string) ?? "text";
      const meta = payload?.metadata as Record<string, unknown> | undefined;
      return {
        id: m.id,
        role: m.role as "user" | "assistant",
        content: m.content,
        createdAt: m.createdAt,
        status: "done" as const,
        kind: payloadType as ChatMessageKind,
        metadata: meta
          ? {
              provider: meta.provider as string | undefined,
              model: meta.model as string | undefined,
              fallbackUsed: meta.fallbackUsed as boolean | undefined,
            }
          : undefined,
        plans:
          payloadType === "plan"
            ? ((payload?.data as Record<string, unknown>)?.options as PlanningOption[]) ?? []
            : undefined,
        actions:
          payloadType === "plan"
            ? ((payload?.data as Record<string, unknown>)?.executableActions as PlanningExecutableAction[]) ?? []
            : undefined,
        planningActions:
          payloadType === "plan"
            ? ((payload?.data as Record<string, unknown>)?.planningActions as PlanningAction[]) ?? undefined
            : undefined,
        chips:
          payloadType === "slot_question"
            ? ((payload?.missingSlots as string[]) ?? [] as string[])
            : payloadType === "plan_selected"
              ? ((payload?.nextActions as NextActionItem[])?.map((a: NextActionItem) => a.label) ?? [] as string[])
              : ((payload?.suggestions as string[]) ?? undefined),
        nextActions: payloadType === "plan_selected" ? (payload?.nextActions as NextActionItem[]) : undefined,
        selectedOptionId: payloadType === "plan_selected" ? (payload?.selectedOptionId as string) : undefined,
        selectedPlanTitle: payloadType === "plan_selected" ? (payload?.selectedPlanTitle as string) : undefined,
        traceEvents: (payload?.events as AgentTraceEvent[]) ?? undefined,
      };
    } catch (mapErr) {
      // payloadJson parse error — degrade to plain text, never blank the whole conversation
      console.warn("[FeaturesPage] payloadJson parse error, degrading to plain text", {
        messageId: m.id,
        error: String(mapErr),
      });
      return {
        id: m.id,
        role: m.role as "user" | "assistant",
        content: m.content,
        createdAt: m.createdAt,
        status: "done" as const,
      };
    }
  });
}

/** Generate a meaningful session title from the first user message */
function generateSessionTitle(prompt: string): string {
  const trimmed = prompt.trim();
  // If too short or generic, use a descriptive fallback
  const genericGreetings = ["你好", "hi", "hello", "嗨", "在吗", "在不在"];
  if (trimmed.length <= 2 || genericGreetings.includes(trimmed.toLowerCase())) {
    const now = new Date();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    const hour = now.getHours();
    const period = hour < 12 ? "上午" : hour < 18 ? "下午" : "晚上";
    return `${month}月${day}日${period}规划`;
  }
  return trimmed.length > 20 ? trimmed.slice(0, 20) + "…" : trimmed;
}

/* ═══════════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════════ */

const HERO_PHRASES = [
  "周末去哪儿",
  "今天怎么安排",
  "带谁一起出发",
  "雨天也有备选",
  "一句话生成路线",
  "把纠结变成安排",
] as const;

const STREAM_FLUSH_INTERVAL_MS = 40;

export default function FeaturesPage({ user, onOpenModal, onNavigate, location }: FeaturesPageProps) {
  const [mode, setMode] = useState<"idle" | "chat">("idle");
  const [inputValue, setInputValue] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [, setPhase] = useState<ChatPhase>("idle");
  const [isBusy, setIsBusy] = useState(false);
  const [healthOk, setHealthOk] = useState<boolean | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [modelMode, setModelMode] = useState<ModelMode>("Flash");
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [showDraftNotice, setShowDraftNotice] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [drafts, setDrafts] = useState<string[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const conversationIdRef = useRef<string | null>(null);
  const messagesBySessionRef = useRef<Map<string, ChatMessage[]>>(new Map());
  // Backend conversations populated from DB for logged-in users
  const [busyActionId, setBusyActionId] = useState<string | null>(null);
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [typedText, setTypedText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [agentEvents, setAgentEvents] = useState<AgentTraceEvent[]>([]);
  const [agentEventsCollapsed, setAgentEventsCollapsed] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const composerDockRef = useRef<HTMLDivElement>(null);
  const typingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const currentSessionIdRef = useRef<string | null>(null);

  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const city = selectedCity || location?.city || user?.city || "选择城市";
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [showHandoffQR, setShowHandoffQR] = useState(false);
  const [handoffPlanId, setHandoffPlanId] = useState<string | undefined>(undefined);
  const [reservationPlan, setReservationPlan] = useState<PlanningOption | null>(null);

  const { toast: glassToast, show: showToast, dismiss: dismissToast } = useGlassToast();

  /* ── Typewriter effect for hero title ── */
  useEffect(() => {
    const currentPhrase = HERO_PHRASES[phraseIndex];
    const typeSpeed = 80;
    const deleteSpeed = 40;
    const pauseAfterType = 2800;

    const typeNextChar = () => {
      if (!isDeleting && typedText.length < currentPhrase.length) {
        setTypedText(currentPhrase.slice(0, typedText.length + 1));
        typingTimerRef.current = setTimeout(typeNextChar, typeSpeed);
      } else if (!isDeleting && typedText.length === currentPhrase.length) {
        setIsDeleting(true);
        typingTimerRef.current = setTimeout(typeNextChar, pauseAfterType);
      } else if (isDeleting && typedText.length > 0) {
        setTypedText(typedText.slice(0, -1));
        typingTimerRef.current = setTimeout(typeNextChar, deleteSpeed);
      } else {
        setIsDeleting(false);
        setPhraseIndex((prev) => (prev + 1) % HERO_PHRASES.length);
      }
    };

    typingTimerRef.current = setTimeout(typeNextChar, typeSpeed);

    return () => {
      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current);
      }
    };
  }, [phraseIndex, typedText, isDeleting]);

  /* ── Message helpers (declared before useEffects that reference them) ── */
  const updateSessionMessages = useCallback((
    sessionId: string,
    updater: (prev: ChatMessage[]) => ChatMessage[],
    options?: { touchSession?: boolean },
  ) => {
    const prevSessionMessages = messagesBySessionRef.current.get(sessionId) ?? [];
    const nextSessionMessages = updater(prevSessionMessages);
    messagesBySessionRef.current.set(sessionId, nextSessionMessages);

    if (options?.touchSession !== false) {
      setChatSessions((prev) =>
        prev.map((session) =>
          session.id === sessionId
            ? { ...session, messages: nextSessionMessages, updatedAt: new Date().toISOString() }
            : session,
        ),
      );
    }

    if (currentSessionIdRef.current === sessionId) {
      setMessages(nextSessionMessages);
    }
  }, []);

  const addMessage = useCallback((sessionId: string, msg: ChatMessage) => {
    updateSessionMessages(sessionId, (prev) => [...prev, msg]);
  }, [updateSessionMessages]);

  const setSessionMessages = useCallback((sessionId: string, sessionMessages: ChatMessage[]) => {
    messagesBySessionRef.current.set(sessionId, sessionMessages);
    setChatSessions((prev) =>
      prev.map((session) =>
        session.id === sessionId
          ? { ...session, messages: sessionMessages, updatedAt: new Date().toISOString() }
          : session,
      ),
    );
    if (currentSessionIdRef.current === sessionId) {
      setMessages(sessionMessages);
    }
  }, []);

  // Load saved preferences from localStorage
  useEffect(() => {
    const savedMode = localStorage.getItem("pg_model_mode");
    if (savedMode && (MODEL_MODES as readonly string[]).includes(savedMode)) {
      setModelMode(savedMode as ModelMode);
    }
    const savedDrafts = localStorage.getItem("pg_drafts");
    if (savedDrafts) {
      try {
        setDrafts(JSON.parse(savedDrafts));
      } catch { /* ignore corrupt localStorage */ }
    }
    const savedFavorites = localStorage.getItem("pg_favorites");
    if (savedFavorites) {
      try {
        setFavorites(JSON.parse(savedFavorites));
      } catch { /* ignore corrupt localStorage */ }
    }
    // Load conversations: backend DB for logged-in users, localStorage for guests
    if (user?.id) {
      // Clear guest data when user is logged in
      localStorage.removeItem("pg_chat_sessions");
      console.info("[FeaturesPage] loading DB conversations for user", { userId: user.id, pgActiveConvId: localStorage.getItem("pg_active_conversation_id") });
      listConversations({ limit: 50 })
        .then((convs) => {
          console.info("[FeaturesPage] load DB conversations", { userId: user?.id, count: convs.length, titles: convs.map((c) => c.title), ids: convs.map((c) => c.id) });
          if (convs.length > 0) {
            const sessions: ChatSession[] = convs.map((cv) => ({
              id: cv.id,
              title: cv.title,
              messages: [],
              city: cv.city,
              createdAt: cv.createdAt,
              updatedAt: cv.updatedAt,
            }));
            setChatSessions(sessions);
            // Rebuild messagesBySessionRef from sessions (messages will be empty until loaded)
            const msgMap = new Map<string, ChatMessage[]>();
            sessions.forEach((s) => {
              msgMap.set(s.id, s.messages);
            });
            // Preserve any already-loaded messages from previous ref
            messagesBySessionRef.current.forEach((msgs, id) => {
              if (msgMap.has(id) && msgs.length > 0) {
                msgMap.set(id, msgs);
              }
            });
            messagesBySessionRef.current = msgMap;
            // Restore last active conversation if it exists in the list
            const savedConvId = localStorage.getItem("pg_active_conversation_id");
            if (savedConvId && convs.some((cv) => cv.id === savedConvId)) {
              setConversationId(savedConvId);
              conversationIdRef.current = savedConvId;
              setCurrentSessionId(savedConvId);
              currentSessionIdRef.current = savedConvId;
              // Auto-load messages for the active conversation from DB
              console.info("[FeaturesPage] active conversation set", { sessionId: savedConvId, conversationId: savedConvId });
              getConversation(savedConvId).then((detail) => {
                if (detail && detail.messages.length > 0) {
                  const loadedMessages = safeMapDbMessages(detail.messages);
                  setSessionMessages(savedConvId, loadedMessages);
                  setMode('chat');
                  setPhase('result');
                  const selMsg = detail.messages.find((m) => {
                    const p2 = m.payloadJson as Record<string, unknown> | undefined;
                    return p2?.type === 'plan_selected';
                  });
                  const selPayload = selMsg?.payloadJson as Record<string, unknown> | undefined;
                  if (selPayload?.selectedOptionId) {
                    setSelectedPlanId(selPayload.selectedOptionId as string);
                  }
                  // Restore trace events from last assistant message
                  const lastWithEvents = [...loadedMessages].reverse().find(
                    (m) => m.role === "assistant" && m.traceEvents && m.traceEvents.length > 0
                  );
                  if (lastWithEvents?.traceEvents) {
                    setAgentEvents(lastWithEvents.traceEvents);
                  }
                  // Auto-scroll to bottom after loading
                  setShouldAutoScroll(true);
                  requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                      const el = messagesContainerRef.current;
                      if (el) el.scrollTo({ top: el.scrollHeight, behavior: "auto" });
                    });
                  });
                }
              }).catch(() => {});
            }
          } else {
            // Empty list from DB for logged-in user — this is expected for new users
            console.info("[FeaturesPage] DB conversations empty for userId=" + user?.id + ", showing empty history");
            // Clear any stale active conversation reference
            localStorage.removeItem("pg_active_conversation_id");
            setChatSessions([]);
            messagesBySessionRef.current = new Map();
          }
        })
        .catch((err) => {
          console.error("[FeaturesPage] Failed to load conversations from DB:", err);
          console.info("[FeaturesPage] DB unavailable — login user history will be empty until next refresh");
          // Do NOT fall back to localStorage for logged-in users
          setChatSessions([]);
          messagesBySessionRef.current = new Map();
        });
    } else {
      // Guest: load from localStorage
      const savedSessions = localStorage.getItem("pg_chat_sessions");
      if (savedSessions) {
        try {
          const parsed = JSON.parse(savedSessions) as ChatSession[];
          setChatSessions(parsed);
          const map = new Map<string, ChatMessage[]>();
          parsed.forEach((session) => {
            map.set(session.id, session.messages ?? []);
          });
          messagesBySessionRef.current = map;
        } catch { /* ignore corrupt localStorage */ }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- setSessionMessages is stable (empty deps)
  }, [user?.id]);

  // Save modelMode to localStorage when changed
  useEffect(() => {
    localStorage.setItem("pg_model_mode", modelMode);
  }, [modelMode]);

  // Persist current conversationId for logged-in users (for page refresh)
  useEffect(() => {
    if (user?.id && conversationId) {
      localStorage.setItem("pg_active_conversation_id", conversationId);
    } else if (!user?.id) {
      localStorage.removeItem("pg_active_conversation_id");
    }
  }, [conversationId, user?.id]);

  // Save chat sessions to localStorage (guest only; logged-in users use DB)
  useEffect(() => {
    if (!user?.id && chatSessions.length > 0) {
      localStorage.setItem("pg_chat_sessions", JSON.stringify(chatSessions));
    }
  }, [chatSessions, user?.id]);

  /* ── Scroll to bottom helper with user intent detection ── */
  const handleMessagesScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const container = e.currentTarget;
      const { scrollTop, scrollHeight, clientHeight } = container;

      // If user is not at bottom (within 100px), disable auto-scroll
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 100;
      setShouldAutoScroll(isAtBottom);
    },
    []
  );

  /** Force scroll to bottom regardless of user scroll position — use for explicit actions */
  const forceScrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = messagesContainerRef.current;
        if (el) {
          el.scrollTo({ top: el.scrollHeight, behavior });
          setShouldAutoScroll(true);
        }
      });
    });
  }, []);

  const scrollToBottom = useCallback(() => {
    if (!shouldAutoScroll) return; // Respect user's scroll intent

    requestAnimationFrame(() => {
      const el = messagesContainerRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }, [shouldAutoScroll]);


  // Auto-scroll only when user is at bottom
  useEffect(() => {
    if (shouldAutoScroll && mode === "chat") {
      scrollToBottom();
    }
  }, [messages, mode, shouldAutoScroll, scrollToBottom]);

  /* ── Health check on mount ── */
  useEffect(() => {
    checkHealth()
      .then((r) => setHealthOk(r.ok))
      .catch(() => setHealthOk(false));
  }, []);

  /* ── Mobile viewport height fix (100vh bug) ── */
  useEffect(() => {
    const setVh = () => {
      document.documentElement.style.setProperty("--vh", `${window.innerHeight * 0.01}px`);
    };
    setVh();
    window.addEventListener("resize", setVh);
    window.addEventListener("orientationchange", setVh);
    return () => {
      window.removeEventListener("resize", setVh);
      window.removeEventListener("orientationchange", setVh);
    };
  }, []);

  /* ── Sync conversationId ref ── */
  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);

  /* ── Sync currentSessionId ref for race condition protection ── */
  useEffect(() => {
    currentSessionIdRef.current = currentSessionId;
  }, [currentSessionId]);

  /* ── Focus textarea on mode switch ── */
  useEffect(() => {
    if (mode === "idle") {
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  }, [mode]);

  const updateLastAssistant = useCallback((
    sessionId: string,
    patch: Partial<ChatMessage>,
    options?: { touchSession?: boolean },
  ) => {
    updateSessionMessages(sessionId, (prev) => {
      const next = [...prev];
      for (let i = next.length - 1; i >= 0; i--) {
        if (next[i].role === "assistant") {
          next[i] = { ...next[i], ...patch };
          break;
        }
      }
      return next;
    }, options);
  }, [updateSessionMessages]);

  /* ── Core submit flow ── */
  const doSubmit = useCallback(
    async (prompt: string) => {
      if (!prompt || isBusy) return;

      // Validate input length
      const validation = validateInputLength(prompt);
      if (!validation.valid) {
        showToast(validation.error!, "error");
        return;
      }

      console.info("[FeaturesPage] submit", {
        userId: user?.id,
        currentSessionId: currentSessionIdRef.current,
        conversationId: conversationIdRef.current,
        message: prompt.slice(0, 100),
        modelMode,
      });

      const controller = new AbortController();
      setAbortController(controller);

      setMode("chat");
      setIsBusy(true);
      setPhase("understanding");
      setAgentEvents([]); // Clear events from previous request

      let targetSessionId = currentSessionIdRef.current;
      if (!targetSessionId) {
        targetSessionId = uuid();
        const newSession: ChatSession = {
          id: targetSessionId,
          title: generateSessionTitle(prompt),
          messages: [],
          city,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        setCurrentSessionId(targetSessionId);
        currentSessionIdRef.current = targetSessionId;
        setChatSessions((prev) => [newSession, ...prev]);
        setSessionMessages(targetSessionId, []);
        // For logged-in users, mark this as a pending local ID
        // It will be migrated to the real DB conversationId when the backend responds
        if (user?.id) {
          console.info("[FeaturesPage] created pending local session", { localId: targetSessionId, userId: user?.id });
        }
      }
      if (!targetSessionId) return;

      // 1) Add user message
      const userMsg: ChatMessage = {
        id: uuid(),
        role: "user",
        content: prompt,
        createdAt: new Date().toISOString(),
      };
      addMessage(targetSessionId, userMsg);
      setInputValue("");
      setShouldAutoScroll(true); // Reset auto-scroll when user sends a message
      forceScrollToBottom("auto"); // Scroll to see the user message immediately

      // 2) Add assistant thinking placeholder
      const thinkingId = uuid();
      const thinkingMsg: ChatMessage = {
        id: thinkingId,
        role: "assistant",
        content: "",
        status: "thinking",
        chips: ["时间", "预算", city, "天气", "路线"],
        createdAt: new Date().toISOString(),
      };
      addMessage(targetSessionId, thinkingMsg);

      // Track event
      apiTrackEvent({ eventName: "send_planning_prompt", payload: { prompt, city, modelMode }, page: "features" }).catch(() => {});

      // 3) Call API with streaming
      try {
        setPhase("planning");
        let streamedContent = "";
        let renderedStreamedContent = "";
        let streamFlushFrame: number | null = null;
        let streamFlushTimer: number | null = null;
        let lastStreamFlushAt = 0;
        let agentResponse: unknown = null;

        const cancelScheduledStreamFlush = () => {
          if (streamFlushFrame !== null) {
            window.cancelAnimationFrame(streamFlushFrame);
            streamFlushFrame = null;
          }
          if (streamFlushTimer !== null) {
            window.clearTimeout(streamFlushTimer);
            streamFlushTimer = null;
          }
        };

        const flushStreamContent = () => {
          streamFlushFrame = null;
          streamFlushTimer = null;
          lastStreamFlushAt = performance.now();

          if (!targetSessionId || currentSessionIdRef.current !== targetSessionId) return;
          if (renderedStreamedContent === streamedContent) return;

          renderedStreamedContent = streamedContent;
          updateLastAssistant(
            targetSessionId,
            {
              status: "streaming" as MessageStatus,
              content: renderedStreamedContent,
              chips: undefined,
            },
            { touchSession: false },
          );
        };

        const scheduleStreamFlush = () => {
          if (streamFlushFrame !== null || streamFlushTimer !== null) return;

          const elapsed = performance.now() - lastStreamFlushAt;
          const delay = Math.max(0, STREAM_FLUSH_INTERVAL_MS - elapsed);
          streamFlushTimer = window.setTimeout(() => {
            streamFlushTimer = null;
            streamFlushFrame = window.requestAnimationFrame(flushStreamContent);
          }, delay);
        };

        try {
          await streamAgentMessage(
            {
              message: prompt,
              city,
              modelMode: toApiModelMode(modelMode),
              conversationId: conversationIdRef.current ?? undefined,
              selectedOptionId: selectedPlanId ?? undefined,
            },
            {
              signal: controller.signal,
              onChunk: (chunk) => {
                streamedContent += chunk;
                scheduleStreamFlush();
              },
              onFinalResult: (result: unknown) => {
                agentResponse = result;
              },
              onAgentEvent: (event) => {
                const traceEvent = event as AgentTraceEvent;
                setAgentEvents((prev) => {
                  // Upsert by id: if same id exists, update it; otherwise append
                  if (traceEvent.id) {
                    const idx = prev.findIndex((e) => e.id === traceEvent.id);
                    if (idx >= 0) {
                      const next = [...prev];
                      next[idx] = traceEvent;
                      return next;
                    }
                  }
                  return [...prev, traceEvent];
                });
              },
            }
          );
        } finally {
          cancelScheduledStreamFlush();
          flushStreamContent();
        }

        // Validate session hasn't changed
        if (currentSessionIdRef.current !== targetSessionId) {
          console.warn("[Session] Session changed during request, ignoring response");
          return;
        }

        const resp = agentResponse as Record<string, unknown>;
        const respType = (resp?.type as string) ?? "chat";
        const respConversationId = resp?.conversationId as string | undefined;

        // Extract metadata (provider, model, fallbackUsed)
        const metadata = resp?.metadata as Record<string, unknown> | undefined;
        const msgMetadata = metadata ? {
          provider: metadata.provider as string | undefined,
          model: metadata.model as string | undefined,
          fallbackUsed: metadata.fallbackUsed as boolean | undefined,
        } : undefined;

        // Determine if this was a fallback response
        const isFallback = metadata?.fallbackUsed === true;
        const finalStatus: MessageStatus = isFallback ? "fallback" : "done";

        if (respConversationId) {
          setConversationId(respConversationId);
          conversationIdRef.current = respConversationId;
          // Sync session ID to backend conversation ID for cross-browser consistency
          if (respConversationId !== targetSessionId) {
            setCurrentSessionId(respConversationId);
            currentSessionIdRef.current = respConversationId;
            const existingMessages = messagesBySessionRef.current.get(targetSessionId);
            if (existingMessages) {
              messagesBySessionRef.current.set(respConversationId, existingMessages);
              messagesBySessionRef.current.delete(targetSessionId);
            }
            // Update chatSessions to replace frontend UUID with backend conversation ID
            setChatSessions((prev) => prev.map((s) =>
              s.id === targetSessionId ? { ...s, id: respConversationId } : s
            ));
            targetSessionId = respConversationId;
          }
          console.info("[FeaturesPage] active conversation set", { sessionId: currentSessionIdRef.current, conversationId: respConversationId });
          localStorage.setItem("pg_active_conversation_id", respConversationId);
        }

        // Refresh sidebar from backend for logged-in users
        if (user?.id) {
          listConversations({ limit: 50 }).then((convs) => {
            if (convs.length > 0) {
              const sessions: ChatSession[] = convs.map((cv) => ({
                id: cv.id,
                title: cv.title,
                messages: messagesBySessionRef.current.get(cv.id) ?? [],
                city: cv.city,
                createdAt: cv.createdAt,
                updatedAt: cv.updatedAt,
              }));
              setChatSessions(sessions);
              // Ensure currentSessionId still points to a valid session
              const activeId = currentSessionIdRef.current;
              if (activeId && !convs.some((cv) => cv.id === activeId)) {
                // Active session was renamed or lost — try to recover
                const lastConv = convs[0];
                if (lastConv) {
                  setCurrentSessionId(lastConv.id);
                  currentSessionIdRef.current = lastConv.id;
                  setConversationId(lastConv.id);
                  conversationIdRef.current = lastConv.id;
                }
              }
            }
          }).catch((err) => {
            console.error("[FeaturesPage] Failed to refresh conversations:", err);
          });
        }
        apiTrackEvent({ eventName: "agent_response", payload: { type: respType, conversationId: respConversationId }, page: "features" }).catch(() => {});

        console.info("[FeaturesPage] response", {
          type: respType,
          conversationId: respConversationId,
          provider: metadata?.provider,
          model: metadata?.model,
          mode: metadata?.mode,
          fallbackUsed: metadata?.fallbackUsed ?? false,
          contentLength: (resp?.content as string)?.length ?? 0,
        });

        // Branch by response type
        switch (respType) {
          case "chat":
          case "identity":
          case "travel_advice": {
            const suggestions = (resp as { suggestions?: string[] })?.suggestions;
            updateLastAssistant(targetSessionId, {
              kind: respType as ChatMessageKind,
              status: finalStatus,
              content: (resp?.content as string) ?? "",
              chips: suggestions,
              metadata: msgMetadata,
            });
            setPhase("result");
            break;
          }
          case "slot_question": {
            const missingSlots = ((resp as { missingSlots?: string[] })?.missingSlots ?? []) as string[];
            const slotLabels: Record<string, string> = { origin: "从哪里出发", budget: "预算多少", partySize: "几个人", date: "什么时候", timeWindow: "时段", preference: "偏好", companions: "同行人" };
            updateLastAssistant(targetSessionId, {
              kind: "slot_question",
              status: finalStatus,
              content: (resp?.content as string) ?? "",
              chips: missingSlots.map((s) => slotLabels[s] ?? s),
              metadata: msgMetadata,
            });
            setPhase("result");
            break;
          }
          case "plan": {
            const planData = (resp as { data?: { options?: PlanningOption[]; summary?: string; executableActions?: PlanningExecutableAction[]; planningActions?: PlanningAction[] } })?.data;
            const options = planData?.options ?? [];
            const optionsWithIds = options.map((opt: PlanningOption, idx: number) => ({
              ...opt,
              id: opt.id || "plan_" + idx,
            }));
            updateLastAssistant(targetSessionId, {
              kind: "plan",
              status: finalStatus,
              content: planData?.summary ?? (resp?.content as string) ?? "",
              chips: undefined,
              plans: optionsWithIds,
              actions: (planData?.executableActions as PlanningExecutableAction[]) ?? [],
              planningActions: (planData?.planningActions as PlanningAction[]) ?? undefined,
              metadata: msgMetadata,
            });
            // Update sidebar title from plan content
            const planSummary2 = planData?.summary ?? (resp?.content as string) ?? "";
            const destMatch2 = planSummary2.match(/(杭州|上海|北京|西湖|灵隐|外滩|故宫|杭师大)[^\n]{0,12}/);
            if (destMatch2 && currentSessionIdRef.current) {
              const autoTitle = destMatch2[0].slice(0, 20);
              setChatSessions((prev) =>
                prev.map((s) => s.id === targetSessionId ? { ...s, title: autoTitle } : s)
              );
            }
            setPhase("result");
            forceScrollToBottom("smooth");
            break;
          }
          case "plan_selected": {
            const nextActions = ((resp as { nextActions?: NextActionItem[] })?.nextActions ?? []) as NextActionItem[];
            const selOptId = (resp as { selectedOptionId?: string })?.selectedOptionId;
            const selTitle = (resp as { selectedPlanTitle?: string })?.selectedPlanTitle;
            updateLastAssistant(targetSessionId, {
              kind: "plan_selected",
              status: finalStatus,
              content: (resp?.content as string) ?? "",
              chips: nextActions.map((a) => a.label),
              selectedOptionId: selOptId,
              selectedPlanTitle: selTitle,
              nextActions,
              metadata: msgMetadata,
            });
            setSelectedPlanId(selOptId ?? null);
            setPhase("selected");
            forceScrollToBottom("smooth");
            break;
          }
          case "action_confirm": {
            updateLastAssistant(targetSessionId, {
              kind: "action_confirm",
              status: finalStatus,
              content: (resp?.content as string) ?? "",
              metadata: msgMetadata,
            });
            setPhase("result");
            break;
          }
          case "error": {
            // Show friendly error, not raw backend message
            const rawError = (resp?.content as string) ?? "";
            const friendlyError = rawError.includes("fallback") || rawError.includes("基础")
              ? rawError
              : "模型服务暂时不可用，已记录错误，请稍后重试";
            updateLastAssistant(targetSessionId, {
              kind: "error",
              status: "error",
              content: friendlyError,
              metadata: msgMetadata,
            });
            setPhase("error");
            break;
          }
          default: {
            updateLastAssistant(targetSessionId, {
              status: finalStatus,
              content: (resp?.content as string) ?? "",
              metadata: msgMetadata,
            });
            setPhase("result");
          }
        }
      } catch (err) {
        // Validate session hasn't changed (race condition protection)
        if (currentSessionIdRef.current !== targetSessionId) {
          console.warn("[Session] Session changed during request, ignoring error");
          return;
        }

        // Show friendly error to user, log technical details to console
        const rawError = err instanceof Error ? err.message : String(err);
        console.error("[AgentStream]", rawError);
        const friendlyError =
          rawError.includes("abort") || rawError.includes("AbortError")
            ? "已停止生成"
            : rawError.includes("超时") || rawError.includes("timeout")
              ? "请求超时，请稍后重试"
              : rawError.includes("Failed to fetch") || rawError.includes("NetworkError")
                ? "无法连接到服务，请检查网络"
                : "模型服务暂时不可用，已记录错误，请稍后重试";
        updateLastAssistant(targetSessionId, {
          status: "error",
          content: friendlyError,
          chips: undefined,
        });
        setPhase("error");
        apiTrackEvent({ eventName: "planning_failed", payload: { error: rawError }, page: "features" }).catch(() => {});
        reportClientError({ message: rawError, route: "/api/agent/plan" }).catch(() => {});
      } finally {
        setIsBusy(false);
        setAbortController(null);
      }
    },
    [isBusy, city, modelMode, addMessage, setSessionMessages, showToast, updateLastAssistant, forceScrollToBottom, selectedPlanId, user?.id],
  );

  const handleStopGeneration = useCallback(() => {
    abortController?.abort();
    setAbortController(null);
    setIsBusy(false);
    if (!currentSessionIdRef.current) return;
    // Keep whatever content was streamed so far, mark as done
    updateLastAssistant(currentSessionIdRef.current, {
      status: "done",
      chips: undefined,
    });
  }, [abortController, updateLastAssistant]);

  /* ── Event handlers ── */
  const handleComposerSubmit = useCallback(
    (attachments: AttachmentItem[]) => {
      let prompt = inputValue.trim();
      if (attachments.length > 0) {
        const names = attachments.map((a) => a.file.name).join("、");
        prompt = prompt ? `${prompt}\n[附件: ${names}]` : `[附件: ${names}]`;
      }
      doSubmit(prompt);
    },
    [inputValue, doSubmit],
  );

  const _handleExampleChip = useCallback(
    (prompt: string) => {
      doSubmit(prompt);
    },
    [doSubmit],
  );

  const handleChipToInput = useCallback((prompt: string) => {
    setInputValue(prompt);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, []);

  const handleSelectPlan = useCallback(
    async (planId: string) => {
      console.info("[FeaturesPage] select plan clicked", { conversationId: conversationIdRef.current, selectedOptionId: planId });
      setSelectedPlanId(planId);
      setPhase("selected");
      apiTrackEvent({ eventName: "select_plan", payload: { planId, conversationId }, page: "features" }).catch(() => {});

      try {
        if (conversationIdRef.current) {
          // Dedup: skip if already have a plan_selected message for this optionId
          const existingSessionId = currentSessionIdRef.current;
          if (existingSessionId) {
            const currentMsgs = messagesBySessionRef.current.get(existingSessionId) ?? [];
            const alreadySelected = currentMsgs.some(
              (m) => m.kind === "plan_selected" && m.selectedOptionId === planId,
            );
            if (alreadySelected) {
              console.info("[FeaturesPage] skip duplicate plan_selected", { conversationId: conversationIdRef.current, selectedOptionId: planId });
              return;
            }
          }

          const result = await selectAgentPlan({
            conversationId: conversationIdRef.current,
            optionId: planId,
          });

          const allPlans = messages.flatMap((m) => m.plans ?? []);
          const selectedPlan = allPlans.find((p) => p.id === planId);
          const planTitle = selectedPlan?.title ?? result.selectedPlanTitle ?? "已选方案";

          if (currentSessionIdRef.current) {
            const confirmMsg: ChatMessage = {
              id: uuid(),
              role: "assistant",
              kind: "plan_selected",
              content: result.content ?? "已选中「" + planTitle + "」。下一步你可以：",
              status: "success",
              createdAt: new Date().toISOString(),
              chips: result.nextActions?.map((a) => a.label),
              nextActions: result.nextActions,
              selectedOptionId: planId,
              selectedPlanTitle: planTitle,
            };
            addMessage(currentSessionIdRef.current, confirmMsg);
            forceScrollToBottom("smooth");
          }
        }
      } catch (err) {
        console.error("Failed to select plan:", err);
      }
    },
    [conversationId, messages, addMessage, forceScrollToBottom],
  );

  const handleRetryLast = useCallback(() => {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (lastUser) doSubmit(lastUser.content);
  }, [messages, doSubmit]);

  const handleNewChat = useCallback(() => {
    setMode("idle");
    setMessages([]);
    setPhase("idle");
    setInputValue("");
    setSelectedPlanId(null);
    setAgentEvents([]);
    setCurrentSessionId(null);
    currentSessionIdRef.current = null;
    setConversationId(null);
    conversationIdRef.current = null;
    setSidebarOpen(false);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, []);

  const handleSessionClick = useCallback(async (sessionId: string) => {
    console.info("[FeaturesPage] click session", {
      sessionId,
      userId: user?.id,
      currentSessionId: currentSessionIdRef.current,
      conversationId: conversationIdRef.current,
    });

    // Set active session state immediately
    setCurrentSessionId(sessionId);
    currentSessionIdRef.current = sessionId;
    setConversationId(sessionId);
    conversationIdRef.current = sessionId;
    localStorage.setItem("pg_active_conversation_id", sessionId);

    if (user?.id) {
      // Logged-in user: always load from DB
      try {
        const detail = await getConversation(sessionId);
        console.info("[FeaturesPage] getConversation result", {
          sessionId,
          messageCount: detail?.messages?.length ?? 0,
          title: detail?.title,
        });

        if (detail) {
          const loadedMessages = safeMapDbMessages(detail.messages ?? []);
          setSessionMessages(sessionId, loadedMessages);
          messagesBySessionRef.current.set(sessionId, loadedMessages);
          setMessages(loadedMessages);
          setMode("chat");
          setPhase(loadedMessages.length > 0 ? "result" : "idle");

          // Restore selectedOptionId
          const selMsg = (detail.messages ?? []).find((m) => {
            const p = m.payloadJson as Record<string, unknown> | undefined;
            return p?.type === "plan_selected";
          });
          const selPayload = selMsg?.payloadJson as Record<string, unknown> | undefined;
          setSelectedPlanId(selPayload?.selectedOptionId ? (selPayload.selectedOptionId as string) : null);

          // Restore trace events from last assistant message
          const lastAssistantWithEvents = [...loadedMessages].reverse().find(
            (m) => m.role === "assistant" && m.traceEvents && m.traceEvents.length > 0
          );
          if (lastAssistantWithEvents?.traceEvents) {
            setAgentEvents(lastAssistantWithEvents.traceEvents);
          } else {
            setAgentEvents([]);
          }

          setSidebarOpen(false);
          setInputValue("");

          // Auto-scroll to bottom after messages load
          forceScrollToBottom("auto");
          return;
        }
      } catch (err) {
        console.error("[FeaturesPage] failed to load DB conversation", { sessionId, error: String(err) });
        showToast("历史记录加载失败，请稍后重试", "error");
        return;
      }
    }

    // Guest fallback: load from local chatSessions
    const session = chatSessions.find((s) => s.id === sessionId);
    if (!session) return;
    setSessionMessages(sessionId, session.messages);
    setMessages(session.messages);
    setMode("chat");
    const lastAssistant = [...session.messages].reverse().find((m) => m.role === "assistant");
    setPhase(lastAssistant?.status === "success" ? "result" : "idle");
    setSelectedPlanId(null);
    setSidebarOpen(false);
    setInputValue("");
    forceScrollToBottom("auto");
  }, [user?.id, chatSessions, setSessionMessages, showToast, forceScrollToBottom]);


  /* ── Return to home ── */
  const handleReturnHome = useCallback(() => {
    // Auto-save current conversation before navigating home
    if (inputValue.trim() || messages.length > 0) {
      let targetSessionId = currentSessionIdRef.current;
      if (!targetSessionId && messages.length > 0) {
        targetSessionId = uuid();
        const newSession: ChatSession = {
          id: targetSessionId,
          title: generateSessionTitle(messages[0].content),
          messages,
          city,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        setCurrentSessionId(targetSessionId);
        currentSessionIdRef.current = targetSessionId;
        setChatSessions((prev) => [newSession, ...prev]);
      }

      // If there's unsaved input, add it as a user message
      if (inputValue.trim() && targetSessionId) {
        const userMsg: ChatMessage = {
          id: uuid(),
          role: "user",
          content: inputValue.trim(),
          createdAt: new Date().toISOString(),
        };
        addMessage(targetSessionId, userMsg);
        setInputValue("");
      }

      // Ensure current session is updated with latest messages
      if (targetSessionId) {
        setChatSessions((prev) =>
          prev.map((s) =>
            s.id === targetSessionId
              ? { ...s, messages, updatedAt: new Date().toISOString() }
              : s
          )
        );
      }
    }
    // Navigate home immediately
    onNavigate?.("home");
  }, [inputValue, messages, city, onNavigate, addMessage]);

  const _handleConfirmReturnHome = useCallback(() => {
    onNavigate?.("home");
  }, [onNavigate]);

  /* ── Sidebar handlers ── */
  const handleNavItemClick = useCallback((id: string) => {
    switch (id) {
      case "new":
        handleNewChat();
        break;
      case "inspiration":
        setInputValue("推荐几个适合周末半日游的地点，少排队，交通方便。");
        requestAnimationFrame(() => textareaRef.current?.focus());
        break;
      case "drafts":
        if (drafts.length === 0) {
          setShowDraftNotice(true);
        } else {
          let targetSessionId = currentSessionIdRef.current;
          if (!targetSessionId) {
            targetSessionId = uuid();
            const newSession: ChatSession = {
              id: targetSessionId,
              title: "草稿清单",
              messages: [],
              city,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };
            setCurrentSessionId(targetSessionId);
            currentSessionIdRef.current = targetSessionId;
            setChatSessions((prev) => [newSession, ...prev]);
            setSessionMessages(targetSessionId, []);
          }
          addMessage(targetSessionId, {
            id: uuid(),
            role: "assistant",
            content: `你有 ${drafts.length} 个日程草稿：\n${drafts.map((d, i) => `${i + 1}. ${d}`).join("\n")}`,
            status: "success",
            createdAt: new Date().toISOString(),
          });
          setMode("chat");
        }
        break;
      case "favorites":
        if (favorites.length === 0) {
          showToast("还没有收藏方案", "info");
        } else {
          onNavigate?.("profile");
        }
        break;
    }
  }, [handleNewChat, drafts, favorites, onNavigate, showToast, addMessage, city, setSessionMessages]);

  /* ── Action handlers ── */
  const handleExecuteAction = useCallback(
    async (action: PlanningExecutableAction) => {
      apiTrackEvent({ eventName: "confirm_action", payload: { actionId: action.id, type: action.type, title: action.title }, page: "features" }).catch(() => {});

      // Backend actions that need API call
      const backendTypes = ["book_hotel", "book_restaurant", "book_transport", "buy_ticket", "reserve_activity"];
      if (backendTypes.includes(action.type)) {
        setBusyActionId(action.id);
        try {
          const result = await confirmExecAction(action.id);
          showToast(`${action.title} 已完成`, "success");
          // Update action status in messages
          if (currentSessionIdRef.current) {
            const newStatus = (result.status as string) || "done";
            updateSessionMessages(currentSessionIdRef.current, (prev) =>
              prev.map((msg) => {
                if (!msg.actions) return msg;
                return {
                  ...msg,
                  actions: msg.actions.map((a) =>
                    a.id === action.id ? { ...a, status: newStatus } : a
                  ),
                };
              }),
            );
          }
        } catch {
          showToast("操作失败，请重试", "error");
        } finally {
          setBusyActionId(null);
        }
        return;
      }

      // Local actions
      switch (action.type) {
        case "navigation": {
          const dest = action.description || city;
          window.open(`https://uri.amap.com/search?keyword=${encodeURIComponent(dest)}&city=${encodeURIComponent(city)}`, "_blank");
          break;
        }
        case "calendar_event":
        case "add_to_calendar": {
          const now = new Date();
          const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (6 - now.getDay() || 7), 14, 0);
          const end = new Date(start.getTime() + 3 * 3600_000);
          const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
          const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(action.title)}&dates=${fmt(start)}/${fmt(end)}&details=${encodeURIComponent(action.description)}`;
          window.open(url, "_blank");
          break;
        }
        case "share_message": {
          const shareData = { title: action.title, text: action.description };
          if (navigator.share) {
            navigator.share(shareData).catch(() => {});
          } else {
            navigator.clipboard.writeText(`${action.title}\n${action.description}`);
            showToast("已复制到剪贴板", "success");
          }
          break;
        }
        case "set_reminder":
        case "restaurant_reservation":
        case "ticket_lock":
          break;
        case "memory_save":
          addMemory({ category: "preference", title: action.title, detail: action.description, weight: 0.5 })
            .then(() => {})
            .catch(() => {});
          break;
        default:
          break;
      }
    },
    [city, addMemory, showToast, updateSessionMessages],
  );

  const handleUnifiedAction = useCallback(async (action: PlanningAction) => {
    console.info("[FeaturesPage] unified action", { type: action.type, label: action.label });

    // Track the action click
    try {
      await trackAction({
        conversationId: conversationIdRef.current ?? undefined,
        actionType: action.type,
        label: action.label,
      });
    } catch {
      // tracking failure is non-fatal
    }

    switch (action.type) {
      case "open_url":
        window.open(action.url, action.target ?? "_blank");
        break;
      case "map_search": {
        const query = encodeURIComponent(action.query);
        const citySuffix = action.city ? `&city=${encodeURIComponent(action.city)}` : "";
        if (action.provider === "amap") {
          window.open(`https://www.amap.com/search?query=${query}${citySuffix}`, "_blank");
        } else if (action.provider === "baidu") {
          window.open(`https://map.baidu.com/search/${query}`, "_blank");
        } else {
          window.open(`https://www.google.com/maps/search/${query}`, "_blank");
        }
        break;
      }
      case "navigation": {
        const dest = encodeURIComponent(action.destination);
        const originParam = action.origin ? `&from=${encodeURIComponent(action.origin)}` : "";
        const modeMap: Record<string, string> = { walking: "walk", driving: "drive", transit: "bus" };
        const mode = modeMap[action.mode ?? "transit"];
        if (action.provider === "amap") {
          window.open(`https://www.amap.com/dir?type=${mode}&to=${dest}${originParam}`, "_blank");
        } else {
          window.open(`https://map.baidu.com/dir/${action.origin ? encodeURIComponent(action.origin) + "/" : ""}${dest}`, "_blank");
        }
        break;
      }
      case "copy_text":
        await navigator.clipboard.writeText(action.text);
        showToast("已复制到剪贴板", "success");
        break;
      case "calendar": {
        // Use ICS file download
        const icsContent = [
          "BEGIN:VCALENDAR",
          "VERSION:2.0",
          "BEGIN:VEVENT",
          `SUMMARY:${action.title}`,
          action.startTime ? `DTSTART:${action.startTime.replace(/[-:]/g, "").replace(" ", "T")}` : "",
          action.endTime ? `DTEND:${action.endTime.replace(/[-:]/g, "").replace(" ", "T")}` : "",
          action.description ? `DESCRIPTION:${action.description}` : "",
          "END:VEVENT",
          "END:VCALENDAR",
        ].filter(Boolean).join("\r\n");
        const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${action.title}.ics`;
        a.click();
        URL.revokeObjectURL(url);
        showToast("日历文件已下载", "success");
        break;
      }
      case "mobile_handoff":
        // Show QR code modal for mobile handoff
        setHandoffPlanId(action.planId);
        setShowHandoffQR(true);
        break;
    }
  }, [showToast]);

  /* ── Phase 1: New plan action handlers ── */

  /** Resolve relative Chinese date references to ISO date strings */
  function resolveRelativeDate(dateStr: string): string {
    if (!dateStr) return "";
    // Already an absolute date (YYYY-MM-DD or YYYYMMDD)
    if (/^\d{4}-?\d{2}-?\d{2}$/.test(dateStr)) {
      return dateStr.replace(/-/g, "");
    }
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dayAfter = new Date(today);
    dayAfter.setDate(dayAfter.getDate() + 2);

    const fmt = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");

    if (/明天|tomorrow/.test(dateStr)) return fmt(tomorrow);
    if (/后天|day after/.test(dateStr)) return fmt(dayAfter);
    if (/今天|today/.test(dateStr)) return fmt(today);

    // Weekend references
    if (/周六|saturday/.test(dateStr)) {
      const d = new Date(today);
      d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7));
      return fmt(d);
    }
    if (/周日|sunday/.test(dateStr)) {
      const d = new Date(today);
      d.setDate(d.getDate() + ((7 - d.getDay() + 7) % 7 || 7));
      return fmt(d);
    }
    if (/周末|weekend/.test(dateStr)) {
      const d = new Date(today);
      d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7));
      return fmt(d);
    }

    // Fallback: use tomorrow
    return fmt(tomorrow);
  }

  const handleAdjustPlan = useCallback((plan: PlanningOption) => {
    setInputValue(`我想调整「${plan.title}」，希望…`);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, []);

  const handleGenerateCalendar = useCallback((plan: PlanningOption) => {
    runPlanAction({
      actionKey: `calendar-${plan.id}`,
      showToast,
      loadingText: "正在生成日历…",
      successText: "日历文件已下载",
      errorText: "日历生成失败",
      run: async () => {
        const { createIcs } = await import("../lib/api.js");
        const blob = await createIcs({
          title: plan.title,
          steps: plan.timeline.map((step) => ({
            id: step.id,
            startTime: step.startTime,
            endTime: step.endTime,
            type: step.type,
            title: step.title,
            poiName: step.poiName,
            description: step.description,
            estimatedCost: step.estimatedCost,
          })),
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${plan.title}.ics`;
        a.click();
        URL.revokeObjectURL(url);
      },
    });
  }, [showToast]);

  const handleSavePlan = useCallback(async (plan: PlanningOption) => {
    await runPlanAction({
      actionKey: `save-${plan.id}`,
      showToast,
      loadingText: "正在保存…",
      successText: "方案已保存",
      errorText: "保存失败，请重试",
      run: async () => {
        if (!conversationIdRef.current) throw new Error("没有活跃的对话");
        // 从当前消息中获取 executableActions
        const currentMessage = messages[messages.length - 1];
        const executableActions = currentMessage?.actions ?? [];
        await savePlanToDb({
          conversationId: conversationIdRef.current,
          planId: plan.planId,
          optionId: plan.id,
          planData: plan,
          executableActions,
        });
      },
    });
  }, [showToast, messages]);

  const handleViewReservations = useCallback((plan: PlanningOption) => {
    const steps = plan.timeline.filter((s) => s.bookingNeeded);
    if (steps.length === 0) {
      showToast("该方案没有需要预约的步骤", "info");
      return;
    }
    setReservationPlan(plan);
  }, [showToast]);

  /* ── usePlanActions hook — provides handleOpenNavigation (Phase 1) ── */
  const { handleOpenNavigation } = usePlanActions({
    showToast,
    conversationId,
    city,
    setInputValue,
    textareaRef,
    onSelectPlan: async ({ conversationId: cId, optionId }) => {
      await selectAgentPlan({ conversationId: cId, optionId });
    },
  });

  const _handleNextAction = useCallback(
    (label: string) => {
      switch (label) {
        case "保存方案":
          if (selectedPlanId) {
            selectPlan(selectedPlanId)
              .then(() => showToast("方案已保存", "success"))
              .catch(() => showToast("保存失败，请重试", "error"));
          }
          break;
        case "生成日历": {
          const plan = messages.flatMap((m) => (m.role === "assistant" && "plans" in m ? m.plans ?? [] : [])).find((p) => p.id === selectedPlanId);
          const title = plan?.title ?? "周末出行计划";
          const now = new Date();
          const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (6 - now.getDay() || 7), 14, 0);
          const end = new Date(start.getTime() + 3 * 3600_000);
          const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
          window.open(`https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${fmt(start)}/${fmt(end)}`, "_blank");
          break;
        }
        case "分享给同行人": {
          const plan = messages.flatMap((m) => (m.role === "assistant" && "plans" in m ? m.plans ?? [] : [])).find((p) => p.id === selectedPlanId);
          const title = plan?.title ?? "周末出行计划";
          const text = plan?.timeline.map((t) => `${t.startTime}–${t.endTime} ${t.title}`).join("\n") || title;
          if (navigator.share) {
            navigator.share({ title: "周末去哪儿", text }).catch(() => {});
          } else {
            navigator.clipboard.writeText(text);
            showToast("已复制到剪贴板", "success");
          }
          break;
        }
        case "查看预约建议":
          break;
        case "打开导航": {
          const plan = messages.flatMap((m) => (m.role === "assistant" && "plans" in m ? m.plans ?? [] : [])).find((p) => p.id === selectedPlanId);
          if (plan) handleOpenNavigation(plan as unknown as PlanningOption);
          else showToast("当前方案缺少可导航地点", "info");
          break;
        }
        default:
          break;
      }
    },
    [selectedPlanId, messages, showToast, handleOpenNavigation],
  );

  /* ── Render: agent execution events panel ── */
  const renderAgentEvent = useCallback(
    (evt: AgentTraceEvent, _index: number) => {
      let icon = "•";
      let statusClass = styles.eventRunning;

      if (evt.type === "stage") {
        if (evt.status === "running") {
          icon = "◌";
          statusClass = styles.eventRunning;
        } else if (evt.status === "done") {
          icon = "✓";
          statusClass = styles.eventSuccess;
        } else if (evt.status === "error") {
          icon = "✗";
          statusClass = styles.eventError;
        } else if (evt.status === "warning") {
          icon = "!";
          statusClass = styles.eventWarning;
        } else if (evt.status === "skipped") {
          icon = "–";
          statusClass = styles.eventSkipped;
        }
      } else if (evt.type === "tool") {
        if (evt.status === "running") {
          icon = "⟳";
          statusClass = styles.eventRunning;
        } else if (evt.status === "done") {
          icon = "✓";
          statusClass = styles.eventSuccess;
        } else if (evt.status === "error") {
          icon = "✗";
          statusClass = styles.eventError;
        } else if (evt.status === "fallback" || evt.fallbackUsed) {
          icon = "↻";
          statusClass = styles.eventWarning;
        }
      } else if (evt.type === "slot") {
        icon = "▸";
        statusClass = evt.status === "warning" ? styles.eventWarning : styles.eventSuccess;
      } else if (evt.type === "action_guard") {
        icon = "–";
        statusClass = styles.eventSkipped;
      } else if (evt.type === "warning") {
        icon = "!";
        statusClass = styles.eventWarning;
      }

      return (
        <div key={evt.id ?? `${evt.type}-${_index}`} className={`${styles.agentEventItem} ${statusClass}`}>
          <span className={styles.agentEventIcon}>{icon}</span>
          <div className={styles.agentEventBody}>
            <span className={styles.agentEventTitle}>{evt.label}</span>

            {/* Slot details: known slots + missing slots */}
            {evt.type === "slot" && (
              <div className={styles.agentEventSlotDetails}>
                {Object.keys(evt.knownSlots).length > 0 && (
                  <div className={styles.agentEventSlotKnown}>
                    {Object.entries(evt.knownSlots).map(([k, v]) => (
                      <span key={k} className={styles.agentEventSlotChip}>
                        {k}：{String(v)}
                      </span>
                    ))}
                  </div>
                )}
                {evt.missingSlots.length > 0 && (
                  <div className={styles.agentEventSlotMissing}>
                    缺少：{evt.missingSlots.join("、")}
                  </div>
                )}
                {evt.defaults && Object.keys(evt.defaults).length > 0 && (
                  <div className={styles.agentEventSlotDefaults}>
                    默认：{Object.entries(evt.defaults).map(([k, v]) => `${k} ${v}`).join("；")}
                  </div>
                )}
              </div>
            )}

            {/* Tool output summary */}
            {evt.type === "tool" && evt.outputSummary && (
              <div className={styles.agentEventDetail}>{evt.outputSummary}</div>
            )}

            {/* Tool/action detail or error message */}
            {evt.type !== "slot" && "detail" in evt && evt.detail && (
              <div className={styles.agentEventDetail}>{evt.detail}</div>
            )}

            {/* Action guard reason */}
            {evt.type === "action_guard" && (
              <div className={styles.agentEventDetail}>{evt.reason}</div>
            )}
          </div>
        </div>
      );
    },
    [],
  );

  /* ── Render: message content ── */
  const renderMessageContent = useCallback(
    (msg: ChatMessage) => {
      if (msg.role === "user") {
        return (
          <div className={styles.messageUser}>
            <div className={styles.messageUserBubble}>{msg.content}</div>
          </div>
        );
      }

      // Assistant message
      const _isStreaming = msg.status === "streaming" || msg.status === "thinking";
      const isDone = msg.status === "done" || msg.status === "success";
      const isError = msg.status === "error";
      const isFallback = msg.status === "fallback";

      return (
        <div className={styles.messageAssistant}>
          <div className={styles.messageAssistantBubble}>
            {/* Thinking state */}
            {msg.status === "thinking" && (
              <div className={styles.thinkingContent}>
                <div>我先整理时间、预算、同行人和位置。</div>
                {msg.chips && (
                  <div className={styles.thinkingChips}>
                    {msg.chips.map((c) => (
                      <span key={c} className={styles.thinkingChip}>
                        {c}
                      </span>
                    ))}
                  </div>
                )}
                <div className={styles.thinkingDots}>
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            )}

            {/* Streaming state — show content with cursor */}
            {msg.status === "streaming" && (
              <>
                {msg.content && (
                  <div className={`${styles.resultSummary} ${styles.streamingSummary}`}>
                    <span className={styles.streamingText}>{msg.content}</span>
                    <span className={styles.streamingCursor} />
                  </div>
                )}
                {!msg.content && (
                  <div className={styles.thinkingContent}>
                    <div>正在思考…</div>
                    <div className={styles.thinkingDots}>
                      <span />
                      <span />
                      <span />
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Error state */}
            {isError && (
              <ErrorCardView
                message={msg.content}
                onRetry={handleRetryLast}
                onNew={handleNewChat}
              />
            )}

            {/* Done / Fallback state */}
            {(isDone || isFallback) && (
              <>
                {msg.content && (
                  <div
                    className={styles.resultSummary}
                    dangerouslySetInnerHTML={{ __html: sanitizeMarkdown(msg.content) }}
                  />
                )}

                {/* Fallback badge */}
                {isFallback && (
                  <div className={styles.fallbackBadge}>
                    ⚡ 当前使用基础模式回答
                  </div>
                )}

                {/* Plan cards with embedded action chips */}
                {msg.plans && msg.plans.length > 0 && (
                  <div className={styles.planCards}>
                    {msg.plans.map((plan) => {
                      // Group actions by planId for this plan
                      const planActions = (msg.actions || []).filter(
                        (a) => a.planId === plan.id
                      );
                      return (
                        <PlanCardView
                          key={plan.id}
                          plan={plan}
                          selected={selectedPlanId === plan.id}
                          onSelect={handleSelectPlan}
                          onAdjustPlan={handleAdjustPlan}
                          onGenerateCalendar={handleGenerateCalendar}
                          onSavePlan={handleSavePlan}
                          onViewReservations={handleViewReservations}
                          onOpenNavigation={handleOpenNavigation}
                          onToast={showToast}
                          planActions={planActions}
                          onExecuteAction={handleExecuteAction}
                          busyActionId={busyActionId}
                          unifiedActions={msg.planningActions}
                          onUnifiedAction={handleUnifiedAction}
                        />
                      );
                    })}
                  </div>
                )}

                {/* Next action chips for plan_selected messages */}
                {msg.nextActions && msg.nextActions.length > 0 && (
                  <div className={styles.planSelectedActions}>
                    {msg.nextActions.map((action) => (
                      <button
                        key={action.key}
                        className={styles.planSelectedChip}
                        type="button"
                        onClick={() => doSubmit(action.label)}
                      >
                        {action.key === "save" ? "💾" :
                         action.key === "navigation" ? "🗺️" :
                         action.key === "calendar" ? "📅" :
                         action.key === "share" ? "📤" :
                         action.key === "reservation" ? "🎫" :
                         action.key === "modify" ? "✏️" : "⚡"}
                        {" "}{action.label}
                      </button>
                    ))}
                  </div>
                )}

              </>
            )}
          </div>
        </div>
      );
    },
    [selectedPlanId, handleRetryLast, handleNewChat, handleSelectPlan, handleExecuteAction, busyActionId, handleUnifiedAction, handleAdjustPlan, handleGenerateCalendar, handleSavePlan, handleViewReservations, handleOpenNavigation, showToast, doSubmit],
  );

  /* ═══════════════════════════════════════════════
     Main render
     ═══════════════════════════════════════════════ */
  return (
    <section className={styles.featureAppShell}>
      {/* Mobile menu button */}
      <button
        className={styles.sidebarMenuBtn}
        onClick={() => setSidebarOpen(true)}
        aria-label="打开菜单"
      >
        ☰
      </button>

      {/* Sidebar */}
      <FeaturesSidebar
        user={user}
        city={city}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onNewChat={handleNewChat}
        onNavItemClick={handleNavItemClick}
        chatSessions={chatSessions}
        currentSessionId={currentSessionId}
        onSessionClick={handleSessionClick}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        modelMode={modelMode}
        onModelModeChange={setModelMode}
        onReturnHome={handleReturnHome}
        onNavigate={onNavigate}
      />

      {/* Main area */}
      <main className={styles.featureMain}>
        <AmbientBackground />

        {/* 城市确认横幅：定位 fallback 时提示用户确认 */}
        {location?.needsConfirmation && location.pendingCity && (
          <div className={styles.featureLocationBanner}>
            <span>已获取当前位置，但城市解析需要确认。</span>
            <button type="button" className={styles.featureBannerConfirmBtn} onClick={() => location.onConfirmCity(location.pendingCity!)}>
              确认 {location.pendingCity}
            </button>
            <button type="button" className={styles.featureBannerDismissBtn} onClick={location.onDismissConfirm}>
              手动选择
            </button>
          </div>
        )}

        {mode === "idle" ? (
          /* ── Idle: centered title + composer ── */
          <div className={styles.featureHome}>
            <h1 className={styles.featureHomeTitle}>
              {typedText}
              <span className={styles.typewriterCursor} />
            </h1>
            <p className={styles.featureHomeSubtitle}>
              输入一句话，Agent 帮你规划完整周末
            </p>

            <Composer
              textareaRef={textareaRef}
              value={inputValue}
              onChange={setInputValue}
              onSubmit={handleComposerSubmit}
              disabled={isBusy}
              showMeta
              user={user}
              city={city}
              onCityChange={setSelectedCity}
              onOpenModal={onOpenModal}
              modelMode={modelMode}
              onModelModeChange={setModelMode}
              onToast={showToast}
            />

            <div className={styles.featureChips}>
              {SUGGESTION_PROMPTS.map((p) => (
                <button
                  key={p}
                  className={styles.featureChip}
                  onClick={() => handleChipToInput(p)}
                >
                  {p}
                </button>
              ))}
            </div>

            {healthOk !== null && (
              <div className={styles.featureHealthHint}>
                <span
                  className={styles.healthDot}
                  style={{ background: healthOk ? "#22c55e" : "#ef4444" }}
                />
                {healthOk ? "规划服务已连接" : "服务未连接，请检查后端是否启动"}
              </div>
            )}
          </div>
        ) : (
          /* ── Chat: messages + docked composer ── */
          <div className={styles.featureChat}>
            <div
              className={styles.featureMessages}
              ref={messagesContainerRef}
              onScroll={handleMessagesScroll}
            >
              <div className={styles.featureMessagesInner}>
                {messages.length === 0 ? (
                  <div className={styles.emptyMessagesHint}>
                    <p>这个会话暂无消息</p>
                    <p>发送一条消息开始规划吧</p>
                  </div>
                ) : (
                  messages.map((msg) => (
                    <div key={msg.id}>{renderMessageContent(msg)}</div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* Agent execution process panel */}
            {agentEvents.length > 0 && (
              <div className={styles.agentEventsPanel}>
                <div
                  className={styles.agentEventsHeader}
                  onClick={() => setAgentEventsCollapsed((v) => !v)}
                >
                  <span>执行过程</span>
                  <span className={styles.agentEventsToggle}>
                    {agentEventsCollapsed ? "▸" : "▾"}
                  </span>
                </div>
                {!agentEventsCollapsed && (
                  <div className={styles.agentEventsList}>
                    {agentEvents.map((evt, i) => renderAgentEvent(evt, i))}
                  </div>
                )}
              </div>
            )}

            <div className={styles.featureComposerDock} ref={composerDockRef}>
              {isBusy && (
                <button
                  type="button"
                  className={styles.stopGenerationBtn}
                  onClick={handleStopGeneration}
                >
                  ⏹ 停止生成
                </button>
              )}
              <Composer
                compact
                textareaRef={textareaRef}
                value={inputValue}
                onChange={setInputValue}
                onSubmit={handleComposerSubmit}
                disabled={isBusy}
                user={user}
                city={city}
                onCityChange={setSelectedCity}
                onOpenModal={onOpenModal}
                modelMode={modelMode}
                onModelModeChange={setModelMode}
                onToast={showToast}
              />
            </div>
          </div>
        )}
      </main>

      {/* 日程草稿提示弹窗 */}
      <WorkspaceModal
        open={showDraftNotice}
        onClose={() => setShowDraftNotice(false)}
        title="还没有日程草稿"
        width="sm"
      >
        <p className={styles.confirmText}>
          你可以把想去的地方、时间和预算发给我，我会整理成可执行路线。
        </p>
        <Button size="small" onClick={() => setShowDraftNotice(false)}>
          知道了
        </Button>
      </WorkspaceModal>

      {/* 手机扫码接续弹窗 */}
      {showHandoffQR && conversationId && (
        <WorkspaceModal
          open={showHandoffQR}
          onClose={() => setShowHandoffQR(false)}
          title="手机扫码继续"
          width="sm"
        >
          <MobileHandoffQRCode
            conversationId={conversationId}
            planId={handoffPlanId}
            onClose={() => setShowHandoffQR(false)}
          />
        </WorkspaceModal>
      )}

      {/* 预约建议弹窗 */}
      {reservationPlan && (
        <WorkspaceModal
          open={!!reservationPlan}
          onClose={() => setReservationPlan(null)}
          title="预约建议"
        >
          <div style={{ padding: "1rem" }}>
            <p style={{ marginBottom: "1rem", color: "var(--text-secondary)" }}>
              以下步骤建议提前预约：
            </p>
            {reservationPlan.timeline
              .filter((s) => s.bookingNeeded)
              .map((step) => (
                <div
                  key={step.id}
                  style={{
                    padding: "0.75rem",
                    marginBottom: "0.5rem",
                    borderRadius: "8px",
                    background: "var(--surface-2, #f5f5f5)",
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{step.title}</div>
                  {step.poiName && <div style={{ fontSize: "0.85rem", opacity: 0.8 }}>📍 {step.poiName}</div>}
                  <div style={{ fontSize: "0.85rem", opacity: 0.7 }}>
                    🕐 {step.startTime}–{step.endTime}
                  </div>
                  {step.bookingHint && (
                    <div style={{ fontSize: "0.85rem", color: "var(--accent, #e6a817)" }}>
                      🎫 {step.bookingHint}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
                    <Button
                      variant="ghost"
                      size="small"
                      onClick={() => {
                        window.open(
                          `https://www.amap.com/search?query=${encodeURIComponent(step.poiName || step.title)}`,
                          "_blank",
                        );
                      }}
                    >
                      在高德查看
                    </Button>
                    <Button
                      variant="ghost"
                      size="small"
                      onClick={() => {
                        window.open(
                          `https://i.meituan.com/s/${encodeURIComponent(step.poiName || step.title)}`,
                          "_blank",
                        );
                      }}
                    >
                      查看美团
                    </Button>
                  </div>
                </div>
              ))}
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "1rem" }}>
              <Button variant="ghost" onClick={() => setReservationPlan(null)}>
                稍后再说
              </Button>
            </div>
          </div>
        </WorkspaceModal>
      )}

      <GlassToast toast={glassToast} onDismiss={dismissToast} />
    </section>
  );
}
