import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { v4 as uuid } from "uuid";
import { Button } from "../components/Button";
import {
  requestPlanning,
  quoteAction as apiQuoteAction,
  confirmAction as apiConfirmAction,
  cancelAction as apiCancelAction,
  checkHealth,
  getApiBase,
  type PlanningOption,
  type PlanningExecutableAction,
} from "../lib/api";
import type { ModalKey, SessionUser } from "../types";
import styles from "./FeaturesPage.module.scss";

/* ── Types ── */

type Phase =
  | "idle"
  | "understanding"
  | "planning"
  | "result"
  | "selected"
  | "executing"
  | "done"
  | "error";

type UserMessage = { id: string; role: "user"; content: string; ts: number };

type AssistantMessage = {
  id: string;
  role: "assistant";
  type: "text" | "plan_cards" | "thinking" | "action_cards" | "action_result";
  content: string;
  ts: number;
  plans?: PlanningPlanCard[];
  actions?: ExecutionActionCard[];
};

type ChatMessage = UserMessage | AssistantMessage;

type PlanningPlanCard = {
  id: string;
  title: string;
  summary: string;
  reason?: string;
  timeline: { time: string; title: string; subtitle?: string }[];
  tags: string[];
  budget: string;
  distance?: string;
  risk?: string;
};

type ExecutionActionCard = {
  id: string;
  type: string;
  title: string;
  description: string;
  status: string;
  confirmLabel?: string;
  cancelLabel?: string;
  priceEstimate?: string;
};

/* ── Constants ── */

const EXAMPLE_CHIPS = [
  { label: "👨‍👩‍👧 带娃半日游", prompt: "明天带娃半天，三个小时，要有趣又有教育意义" },
  { label: "👫 情侣约会", prompt: "周六情侣约会，浪漫一点，预算 500 以内" },
  { label: "🌧️ 雨天室内", prompt: "下雨天适合去哪里玩，最好在室内，交通方便" },
  { label: "🎤 演唱会夜", prompt: "晚上有演唱会，白天怎么安排最充实" },
];

const WHAT_IF_OPTIONS = [
  { key: "rain" as const, label: "🌧️ 如果下雨" },
  { key: "late" as const, label: "⏰ 如果迟到 1 小时" },
  { key: "budget" as const, label: "💰 预算减半" },
];

/* ── Props ── */

interface FeaturesPageProps {
  user?: SessionUser | null;
  onOpenModal?: (key: ModalKey) => void;
  onRequestLocation?: () => void;
}

/* ── Attachment type ── */

type AttachmentItem = {
  id: string;
  file: File;
  previewUrl?: string;
};

/* ── Inline Toast component ── */

function InlineToast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2200);
    return () => clearTimeout(t);
  }, [onDone]);
  return <div className={styles.composerToast}>{message}</div>;
}

/* ── Ambient background (idle only) ── */

function AmbientBackground() {
  return (
    <div className={styles.featureAmbient} aria-hidden="true">
      <div className={`${styles.bgOrb} ${styles.bgOrb1}`} />
      <div className={`${styles.bgOrb} ${styles.bgOrb2}`} />
      <div className={`${styles.bgOrb} ${styles.bgOrb3}`} />
      <div className={`${styles.bgOrb} ${styles.bgOrb4}`} />
      <div className={`${styles.bgCard} ${styles.bgCard1}`}>
        <span>🍜</span>
        <strong>武康路晚餐</strong>
        <em>17:30 · 人均 ¥180</em>
      </div>
      <div className={`${styles.bgCard} ${styles.bgCard2}`}>
        <span>☀️</span>
        <strong>周六 24℃</strong>
        <em>傍晚可能有雨</em>
      </div>
      <div className={`${styles.bgCard} ${styles.bgCard3}`}>
        <span>🗺️</span>
        <strong>3 套备选方案</strong>
        <em>亲子 / 雨天 / 朋友</em>
      </div>
      <div className={styles.bgGrid} />
    </div>
  );
}

/* ── Gemini-style Composer ── */

interface ComposerProps {
  compact?: boolean;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (v: string) => void;
  onSubmit: (attachments: AttachmentItem[]) => void;
  disabled?: boolean;
  placeholder?: string;
  showMeta?: boolean;
  user?: SessionUser | null;
  city?: string;
  onOpenModal?: (key: ModalKey) => void;
  onToast?: (msg: string) => void;
}

/* ── Speech Recognition typings ── */
interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}
interface SpeechRecognitionErrorEvent {
  error: string;
}

function Composer({
  compact,
  textareaRef,
  value,
  onChange,
  onSubmit,
  disabled,
  placeholder,
  showMeta,
  user,
  city,
  onOpenModal,
  onToast,
}: ComposerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const valueRef = useRef(value);
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [isRecording, setIsRecording] = useState(false);

  // Keep ref in sync so speech recognition callback always sees latest value
  useEffect(() => { valueRef.current = value; }, [value]);

  /* ── Cleanup preview URLs on unmount ── */
  useEffect(() => {
    return () => {
      attachments.forEach((a) => {
        if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── File pick handler ── */
  const handleFilePick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFilesSelected = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;

      const newItems: AttachmentItem[] = [];
      for (const file of Array.from(files)) {
        const isImage = file.type.startsWith("image/");
        newItems.push({
          id: uuid(),
          file,
          previewUrl: isImage ? URL.createObjectURL(file) : undefined,
        });
      }

      setAttachments((prev) => {
        const next = [...prev, ...newItems];
        if (next.length > 9) {
          onToast?.("最多附加 9 个文件");
          return next.slice(0, 9);
        }
        return next;
      });

      // reset input so same file can be re-selected
      e.target.value = "";
    },
    [onToast],
  );

  const handleRemoveAttachment = useCallback((id: string) => {
    setAttachments((prev) => {
      const item = prev.find((a) => a.id === id);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((a) => a.id !== id);
    });
  }, []);

  /* ── Voice recording ── */
  const SpeechRecognitionCtor = useMemo(() => {
    const w = window as any;
    return w.SpeechRecognition || w.webkitSpeechRecognition || null;
  }, []);

  const toggleRecording = useCallback(() => {
    if (isRecording && recognitionRef.current) {
      recognitionRef.current.stop();
      return;
    }

    if (!SpeechRecognitionCtor) {
      onToast?.("当前浏览器不支持语音输入，请使用 Chrome");
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = "zh-CN";
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.maxAlternatives = 1;

    let finalTranscript = "";

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interim += transcript;
        }
      }
      const combined = (valueRef.current ? valueRef.current : "") + finalTranscript + interim;
      onChange(combined);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error !== "aborted") {
        onToast?.(`语音识别出错：${event.error}`);
      }
      setIsRecording(false);
    };

    recognition.onend = () => {
      setIsRecording(false);
      recognitionRef.current = null;
      // Focus textarea after recording ends
      requestAnimationFrame(() => textareaRef.current?.focus());
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
    onToast?.("正在录音，点击麦克风停止");
  }, [isRecording, SpeechRecognitionCtor, onChange, onToast, textareaRef]);

  /* ── Submit ── */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSubmit = () => {
    if (disabled) return;
    onSubmit(attachments);
    // Clean up attachment previews
    attachments.forEach((a) => {
      if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
    });
    setAttachments([]);
  };

  const fileIcon = (file: File) => {
    if (file.type.startsWith("image/")) return null;
    if (file.type.includes("pdf")) return "📄";
    if (file.type.includes("word") || file.name.endsWith(".doc") || file.name.endsWith(".docx"))
      return "📝";
    if (file.type.includes("sheet") || file.name.endsWith(".xls") || file.name.endsWith(".xlsx"))
      return "📊";
    return "📎";
  };

  return (
    <div className={`${styles.featureComposer} ${compact ? styles.featureComposerCompact : ""}`}>
      {/* hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
        style={{ display: "none" }}
        onChange={handleFilesSelected}
      />

      {/* attachment previews */}
      {attachments.length > 0 && (
        <div className={styles.composerAttachments}>
          {attachments.map((att) => (
            <div key={att.id} className={styles.composerAttachmentThumb}>
              {att.previewUrl ? (
                <img src={att.previewUrl} alt={att.file.name} />
              ) : (
                <span className={styles.attachmentFileIcon}>{fileIcon(att.file)}</span>
              )}
              <button
                className={styles.composerAttachmentRemove}
                type="button"
                aria-label={`移除 ${att.file.name}`}
                onClick={() => handleRemoveAttachment(att.id)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div className={styles.composerInputRow}>
        <button
          className={styles.composerIconButton}
          type="button"
          aria-label="添加附件"
          onClick={handleFilePick}
          disabled={disabled}
        >
          +
        </button>
        <textarea
          ref={textareaRef}
          className={styles.composerTextarea}
          placeholder={placeholder || "明天带娃半天，预算 300，想玩点不一样的…"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
        />
        <button
          className={`${styles.composerIconButton} ${isRecording ? styles.composerVoiceActive : ""}`}
          type="button"
          aria-label={isRecording ? "停止录音" : "语音输入"}
          onClick={toggleRecording}
          disabled={disabled && !isRecording}
        >
          {isRecording ? <span className={styles.voiceDot} /> : "🎙"}
        </button>
        <button
          className={styles.composerSendButton}
          type="button"
          disabled={disabled || (!value.trim() && attachments.length === 0)}
          onClick={handleSubmit}
        >
          开始规划
        </button>
      </div>
      {showMeta && (
        <div className={styles.composerMetaRow}>
          <span className={styles.composerMetaItem}>📍 {city || "上海"}</span>
          {user ? (
            <span className={styles.composerMetaItem}>👤 {user.name || "已登录"}</span>
          ) : (
            <button
              className={styles.composerMetaLink}
              onClick={() => onOpenModal?.("login")}
            >
              登录解锁更多
            </button>
          )}
          <span className={styles.composerMetaItem}>预约和付款前会先确认</span>
        </div>
      )}
    </div>
  );
}

/* ── Main Component ── */

export default function FeaturesPage({ user, onOpenModal, onRequestLocation }: FeaturesPageProps) {
  void onRequestLocation;

  /* ── State ── */
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [city] = useState("上海");
  const [phase, setPhase] = useState<Phase>("idle");
  const [planId, setPlanId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionQuotingId, setActionQuotingId] = useState<string | null>(null);
  const [actionQuotedPreview, setActionQuotedPreview] = useState<{
    actionId: string;
    title: string;
    price?: string;
    cancelLabel?: string;
  } | null>(null);
  const [cachedActions, setCachedActions] = useState<ExecutionActionCard[]>([]);
  const [backendOk, setBackendOk] = useState<boolean | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const endRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastPlanIdRef = useRef<string | null>(null);

  const isBusy = phase === "understanding" || phase === "planning";
  const isChat = phase !== "idle";

  /* ── Health check ── */
  useEffect(() => {
    let cancelled = false;
    checkHealth().then((res) => {
      if (!cancelled) setBackendOk(res.ok);
    });
    return () => { cancelled = true; };
  }, []);

  /* ── Auto-scroll messages ── */
  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    requestAnimationFrame(() => {
      endRef.current?.scrollIntoView({ behavior });
    });
  }, []);

  useEffect(() => {
    if (isChat) scrollToBottom();
  }, [messages, actionQuotedPreview, actionQuotingId, isChat, scrollToBottom]);

  /* ── Helpers ── */
  const addMessage = (msg: ChatMessage) => setMessages((prev) => [...prev, msg]);

  const appendAssistantText = (content: string) => {
    addMessage({ id: uuid(), role: "assistant", type: "text", content, ts: Date.now() });
  };

  const removeMessage = (id: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== id));
  };

  /* ── Adapters ── */
  const adaptPlan = (opt: PlanningOption): PlanningPlanCard => ({
    id: opt.id,
    title: opt.title,
    summary: opt.summary,
    timeline: opt.timeline.map((step) => ({
      time: step.startTime,
      title: step.title,
      subtitle: step.poiName
        ? `${step.poiName}${step.durationMinutes ? ` · ${step.durationMinutes}min` : ""}`
        : step.durationMinutes
          ? `${step.durationMinutes}min`
          : undefined,
    })),
    tags: opt.highlights.slice(0, 4),
    budget: `¥${opt.totalCostMin}–${opt.totalCostMax}`,
    distance: opt.walkingKm ? `${opt.walkingKm}km` : undefined,
    risk: opt.risks?.[0],
  });

  const adaptActions = (actions: PlanningExecutableAction[]): ExecutionActionCard[] =>
    actions.map((a) => ({
      id: a.id,
      type: a.type,
      title: a.title,
      description: a.description,
      status: a.status,
      priceEstimate: a.priceEstimate,
      confirmLabel: actionConfirmLabel(a.type),
      cancelLabel: "取消",
    }));

  const actionConfirmLabel = (type: string) => {
    if (type.includes("reservation")) return "预点餐";
    if (type.includes("ticket")) return "锁优惠";
    if (type.includes("calendar")) return "下载 ICS";
    if (type.includes("share")) return "发送到群里";
    if (type.includes("navigation")) return "打开地图";
    if (type.includes("memory")) return "保存回忆";
    return "确认";
  };

  /* ── Core: submit planning request ── */
  const doSubmit = async (prompt: string) => {
    if (!prompt || isBusy) return;

    setError(null);
    setInputValue("");
    setActionQuotedPreview(null);
    setActionQuotingId(null);

    addMessage({ id: uuid(), role: "user", content: prompt, ts: Date.now() });
    setPhase("understanding");

    // Streaming typewriter
    const understandingId = uuid();
    const fullText = "正在理解你的需求，马上生成方案…";
    let currentText = "";
    for (let i = 0; i < fullText.length; i++) {
      currentText += fullText[i];
      const text = currentText;
      setMessages((prev) => {
        const exists = prev.some((m) => m.id === understandingId);
        if (exists) {
          return prev.map((m) =>
            m.id === understandingId ? { ...m, content: text } : m
          );
        }
        return [
          ...prev,
          {
            id: understandingId,
            role: "assistant" as const,
            type: "text" as const,
            content: text,
            ts: Date.now(),
          },
        ];
      });
      await new Promise((r) => setTimeout(r, 35));
    }

    setPhase("planning");

    try {
      const result = await requestPlanning({ prompt, city });
      setBackendOk(true);
      removeMessage(understandingId);

      const planCards = result.options.map(adaptPlan);
      const actions = adaptActions(result.executableActions);
      setPlanId(result.planId);
      setCachedActions(actions);
      lastPlanIdRef.current = result.planId;

      appendAssistantText(result.summary || "这是为你生成的方案：");
      addMessage({
        id: uuid(),
        role: "assistant",
        type: "plan_cards",
        content: "",
        plans: planCards,
        ts: Date.now(),
      });
      setPhase("result");
    } catch (err) {
      removeMessage(understandingId);
      const raw = err instanceof Error ? err.message : "请求失败";
      const isNetwork = raw.includes("无法连接") || raw.includes("Failed to fetch") || raw.includes("网络");
      const friendly = isNetwork
        ? "没有连上规划服务。请确认后端已启动：npm run dev:api，并检查 VITE_API_BASE 配置。"
        : raw;
      setBackendOk(false);
      setError(friendly);
      setPhase("error");
    }
  };

  const handleComposerSubmit = () => doSubmit(inputValue.trim());

  const handleExampleChip = (prompt: string) => doSubmit(prompt);

  const handleChipToInput = (prompt: string) => {
    setInputValue(prompt);
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  /* ── Composer buttons ── */
  const handlePlusClick = () => setToast("附件与更多输入方式稍后接入");
  const handleVoiceClick = () => setToast("语音输入稍后接入");

  /* ── Plan selection ── */
  const handleSelectPlan = async (cardId: string, title: string) => {
    if (phase === "executing") return;
    setPhase("executing");
    setActionQuotedPreview(null);
    setActionQuotingId(null);
    appendAssistantText(`已选择「${title}」，正在处理…`);

    try {
      const selectedActions =
        cachedActions.length > 0
          ? cachedActions.filter((a) => !(a as any).optionId || (a as any).optionId === cardId)
          : [];

      if (selectedActions.length > 0) {
        addMessage({
          id: uuid(),
          role: "assistant",
          type: "action_cards",
          content: "以下是可以立即执行的操作：",
          actions: selectedActions,
          ts: Date.now(),
        });
      } else {
        appendAssistantText("这套方案已选中，后续将接入预约、日历和分享。");
      }
      setPhase("selected");
    } catch (err) {
      appendAssistantText(err instanceof Error ? err.message : "选择方案失败");
      setPhase("error");
    }
  };

  /* ── Action operations ── */
  const handleQuoteAction = async (actionId: string) => {
    setActionQuotingId(actionId);
    setActionQuotedPreview(null);
    try {
      const result = await apiQuoteAction(actionId);
      setCachedActions((prev) =>
        prev.map((a) =>
          a.id === actionId
            ? { ...a, status: result.status, priceEstimate: result.priceEstimate }
            : a
        )
      );
      setActionQuotedPreview({
        actionId,
        title: result.title,
        price: result.priceEstimate,
        cancelLabel: "取消",
      });
    } catch (err) {
      appendAssistantText(err instanceof Error ? err.message : "获取报价失败");
    } finally {
      setActionQuotingId(null);
    }
  };

  const handleConfirmAction = async (actionId: string) => {
    setActionQuotingId(actionId);
    try {
      const result = await apiConfirmAction(actionId);
      setCachedActions((prev) =>
        prev.map((a) => (a.id === actionId ? { ...a, status: result.status } : a))
      );
      setActionQuotedPreview(null);

      const action = cachedActions.find((a) => a.id === actionId);
      const label = action?.type.includes("reservation")
        ? "预订成功"
        : action?.type.includes("ticket")
          ? "已锁定优惠"
          : action?.type.includes("calendar")
            ? "ICS 已生成"
            : "操作成功";
      appendAssistantText(`✅ ${label} — ${action?.title || ""}`);

      if (action?.type.includes("share")) {
        appendAssistantText("📋 已复制分享链接，快发给朋友吧！");
      }
      if (action?.type.includes("memory") && user?.id) {
        appendAssistantText("记忆已同步到个人主页 🧠");
      }

      const allDone = cachedActions
        .filter((a) => a.id !== actionId)
        .every((a) => a.status === "confirmed" || a.status === "cancelled");
      if (allDone) {
        setPhase("done");
        appendAssistantText("所有操作已完成 🎉");
      } else {
        setPhase("selected");
      }
    } catch (err) {
      appendAssistantText(err instanceof Error ? err.message : "确认失败");
    } finally {
      setActionQuotingId(null);
    }
  };

  const handleCancelAction = async (actionId: string) => {
    setActionQuotingId(actionId);
    try {
      const result = await apiCancelAction(actionId);
      setCachedActions((prev) =>
        prev.map((a) => (a.id === actionId ? { ...a, status: result.status } : a))
      );
      setActionQuotedPreview(null);

      const allDone = cachedActions
        .filter((a) => a.id !== actionId)
        .every((a) => a.status === "confirmed" || a.status === "cancelled");
      if (allDone) {
        setPhase("done");
        appendAssistantText("所有操作已完成 🎉");
      } else {
        setPhase("selected");
      }
    } catch (err) {
      appendAssistantText(err instanceof Error ? err.message : "取消失败");
    } finally {
      setActionQuotingId(null);
    }
  };

  const handleWhatIf = async (scenario: "rain" | "late" | "budget") => {
    if (!lastPlanIdRef.current) return;
    const prompt =
      scenario === "rain"
        ? "如果下雨怎么办"
        : scenario === "late"
          ? "如果迟到 1 小时怎么办"
          : "预算减半怎么调整";
    doSubmit(`${prompt}，基于当前方案调整`);
  };

  const handleNewRound = () => {
    setMessages([]);
    setPhase("idle");
    setPlanId(null);
    setError(null);
    setCachedActions([]);
    setActionQuotedPreview(null);
    setActionQuotingId(null);
    lastPlanIdRef.current = null;
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  /* ── Message renderer ── */
  const renderMessage = (msg: ChatMessage) => {
    if (msg.role === "user") {
      return (
        <div key={msg.id} className={styles.featureMessageRowRight}>
          <div className={styles.featureUserBubble}>
            <p>{msg.content}</p>
          </div>
        </div>
      );
    }

    if (msg.type === "thinking") {
      return (
        <div key={msg.id} className={styles.featureMessageRowLeft}>
          <div className={styles.featureAssistantBubble}>
            <div className={styles.featureThinkingDots}>
              <span /><span /><span />
            </div>
          </div>
        </div>
      );
    }

    if (msg.type === "text") {
      return (
        <div key={msg.id} className={styles.featureMessageRowLeft}>
          <div className={styles.featureAssistantBubble}>
            <p>{msg.content}</p>
          </div>
        </div>
      );
    }

    if (msg.type === "plan_cards" && msg.plans) {
      return (
        <div key={msg.id} className={styles.featureMessageRowLeft}>
          <div className={styles.featureAssistantBubble}>
            {msg.content && <p>{msg.content}</p>}
            <div className={styles.featurePlanCardsScroll}>
              {msg.plans.map((card) => (
                <div key={card.id} className={styles.featurePlanCard}>
                  <div className={styles.featurePlanCardHeader}>
                    <h4>{card.title}</h4>
                  </div>
                  <p className={styles.featurePlanCardSummary}>{card.summary}</p>
                  {card.reason && (
                    <p className={styles.featurePlanCardReason}>{card.reason}</p>
                  )}
                  {card.timeline.length > 0 && (
                    <div className={styles.featureTimeline}>
                      {card.timeline.map((step, i) => (
                        <div key={i} className={styles.featureTimelineItem}>
                          <span className={styles.featureTimelineTime}>{step.time}</span>
                          <span className={styles.featureTimelineTitle}>{step.title}</span>
                          {step.subtitle && (
                            <span className={styles.featureTimelineSub}>{step.subtitle}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {card.tags.length > 0 && (
                    <div className={styles.featurePlanTags}>
                      {card.tags.map((t, i) => (
                        <span key={i} className={styles.featurePlanTag}>{t}</span>
                      ))}
                    </div>
                  )}
                  <div className={styles.featurePlanMeta}>
                    <span>💰 {card.budget}</span>
                    {card.distance && <span>🚶 {card.distance}</span>}
                  </div>
                  {card.risk && <p className={styles.featurePlanRisk}>⚠️ {card.risk}</p>}
                  {phase === "result" && (
                    <Button
                      variant="primary"
                      size="small"
                      className={styles.featurePlanSelectBtn}
                      onClick={() => handleSelectPlan(card.id, card.title)}
                    >
                      选这个方案
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    if (msg.type === "action_cards" && msg.actions) {
      return (
        <div key={msg.id} className={styles.featureMessageRowLeft}>
          <div className={styles.featureAssistantBubble}>
            {msg.content && <p>{msg.content}</p>}
            <div className={styles.featureActionCardsGrid}>
              {msg.actions.map((action) => (
                <div
                  key={action.id}
                  className={`${styles.featureActionCard} ${
                    action.status === "confirmed" ? styles.featureActionCardConfirmed : ""
                  } ${action.status === "cancelled" ? styles.featureActionCardCancelled : ""}`}
                >
                  <div className={styles.featureActionCardHeader}>
                    <span className={styles.featureActionTypeIcon}>
                      {action.type.includes("reservation") && "🍽️"}
                      {action.type.includes("ticket") && "🎫"}
                      {action.type.includes("calendar") && "📅"}
                      {action.type.includes("share") && "📤"}
                      {action.type.includes("navigation") && "🗺️"}
                      {action.type.includes("memory") && "🧠"}
                    </span>
                    <span className={styles.featureActionTitle}>{action.title}</span>
                    {action.status === "confirmed" && (
                      <span className={styles.featureActionConfirmedBadge}>✅ 已确认</span>
                    )}
                    {action.status === "cancelled" && (
                      <span className={styles.featureActionCancelledBadge}>已取消</span>
                    )}
                  </div>
                  <p className={styles.featureActionDesc}>{action.description}</p>

                  {actionQuotedPreview?.actionId === action.id && (
                    <div className={styles.featureActionPreview}>
                      <div className={styles.featureActionPreviewContent}>
                        <div className={styles.featureActionPreviewTitle}>
                          {actionQuotedPreview.title}
                        </div>
                        {actionQuotedPreview.price && (
                          <div className={styles.featureActionPreviewPrice}>
                            {actionQuotedPreview.price}
                          </div>
                        )}
                      </div>
                      <div className={styles.featureActionPreviewActions}>
                        <Button
                          variant="primary"
                          size="small"
                          disabled={actionQuotingId === action.id}
                          onClick={() => handleConfirmAction(action.id)}
                        >
                          {action.confirmLabel || "确认"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="small"
                          disabled={actionQuotingId === action.id}
                          onClick={() => {
                            setActionQuotedPreview(null);
                            handleCancelAction(action.id);
                          }}
                        >
                          {actionQuotedPreview.cancelLabel || "取消"}
                        </Button>
                      </div>
                    </div>
                  )}

                  {action.status !== "confirmed" &&
                    action.status !== "cancelled" &&
                    !actionQuotedPreview?.actionId && (
                      <div className={styles.featureActionBtns}>
                        {action.priceEstimate && action.status === "quoted" ? (
                          <>
                            <Button
                              variant="primary"
                              size="small"
                              disabled={actionQuotingId === action.id}
                              onClick={() => handleConfirmAction(action.id)}
                            >
                              {actionQuotingId === action.id
                                ? "处理中…"
                                : action.confirmLabel || "确认"}
                            </Button>
                            <Button
                              variant="ghost"
                              size="small"
                              disabled={actionQuotingId === action.id}
                              onClick={() => handleCancelAction(action.id)}
                            >
                              取消
                            </Button>
                          </>
                        ) : (
                          <Button
                            variant="primary"
                            size="small"
                            disabled={actionQuotingId === action.id}
                            onClick={() => handleQuoteAction(action.id)}
                          >
                            {actionQuotingId === action.id
                              ? "查询中…"
                              : action.confirmLabel || "查看详情"}
                          </Button>
                        )}
                      </div>
                    )}
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    if (msg.type === "action_result") {
      return (
        <div key={msg.id} className={styles.featureMessageRowLeft}>
          <div className={styles.featureAssistantBubble}>
            <p>{msg.content}</p>
          </div>
        </div>
      );
    }

    return null;
  };

  /* ── Show what-if bar ── */
  const showWhatIfBar = phase === "selected" || phase === "done";

  /* ═══════════════════════════════════════════════
     IDLE STATE — Gemini-style centered entry
     ═══════════════════════════════════════════════ */
  if (!isChat) {
    return (
      <div className={styles.featureShell}>
        <AmbientBackground />

        <div className={styles.featureHome}>
          <h1 className={styles.featureTitle}>周末去哪儿</h1>
          <p className={styles.featureSubtitle}>输入一句话，Agent帮你规划完美周末</p>

          <Composer
            textareaRef={textareaRef}
            value={inputValue}
            onChange={setInputValue}
            onSubmit={handleComposerSubmit}
            disabled={isBusy}
            showMeta
            user={user}
            city={city}
            onOpenModal={onOpenModal}
            onToast={setToast}
          />

          {toast && <InlineToast message={toast} onDone={() => setToast(null)} />}

          <div className={styles.featurePromptChips}>
            {EXAMPLE_CHIPS.map((chip) => (
              <button
                key={chip.label}
                className={styles.featurePromptChip}
                onClick={() => handleExampleChip(chip.prompt)}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>

        {backendOk === false && (
          <div className={styles.featureHealthHint}>
            规划服务暂时没连上，请确认 <code>npm run dev:api</code> 已启动
          </div>
        )}
      </div>
    );
  }

  /* ═══════════════════════════════════════════════
     CHAT STATE — single-viewport workspace
     ═══════════════════════════════════════════════ */
  return (
    <div className={styles.featureShell}>
      <AmbientBackground />

      <div className={styles.featureChat}>
        {/* Messages */}
        <div className={styles.featureMessages}>
          <div className={styles.featureMessagesInner}>
            {messages.map(renderMessage)}
            <div ref={endRef} />
          </div>
        </div>

        {/* What-if bar */}
        {showWhatIfBar && (
          <div className={styles.featureWhatIfBar}>
            <span className={styles.featureWhatIfLabel}>💡 如果…</span>
            {WHAT_IF_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                className={styles.featureWhatIfBtn}
                onClick={() => handleWhatIf(opt.key)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}

        {/* Error card */}
        {phase === "error" && error && (
          <div className={styles.featureErrorCard}>
            <div className={styles.featureErrorTitle}>{error}</div>
            <div className={styles.featureErrorActions}>
              <Button
                variant="primary"
                size="small"
                onClick={() => {
                  setError(null);
                  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
                  if (lastUserMsg) doSubmit(lastUserMsg.content);
                }}
              >
                重试
              </Button>
              <Button variant="ghost" size="small" onClick={handleNewRound}>
                新一轮
              </Button>
              {backendOk === false && (
                <button
                  className={styles.featureErrorHelpToggle}
                  onClick={(e) => {
                    const el = e.currentTarget.nextElementSibling as HTMLElement;
                    if (el) el.hidden = !el.hidden;
                  }}
                >
                  查看启动说明
                </button>
              )}
            </div>
            {backendOk === false && (
              <div className={styles.featureErrorHelp} hidden>
                <pre>{`npm run dev          # 启动前端 (5173)
npm run dev:api      # 启动后端 (3001)

# .env.local
VITE_API_BASE=${getApiBase()}
PORT=3001`}</pre>
              </div>
            )}
          </div>
        )}

        {/* Docked composer */}
        <div className={styles.featureComposerDock}>
          <div className={styles.featureComposerDockInner}>
            <button
              className={styles.featureNewRoundBtn}
              onClick={handleNewRound}
              title="新一轮规划"
            >
              🔄
            </button>
            <Composer
              compact
              textareaRef={textareaRef}
              value={inputValue}
              onChange={setInputValue}
              onSubmit={handleComposerSubmit}
              disabled={isBusy}
              placeholder={
                phase === "result"
                  ? "选一个方案，或继续描述…"
                  : phase === "selected" || phase === "done"
                    ? "还想调整什么？"
                    : "继续描述…"
              }
              onToast={setToast}
            />
            {toast && <InlineToast message={toast} onDone={() => setToast(null)} />}
          </div>
        </div>
      </div>
    </div>
  );
}
