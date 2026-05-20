import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { v4 as uuid } from "uuid";
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

/* ═══════════════════════════════════════════════
   FeaturesPage — Gemini-style AI Planning Workspace
   ═══════════════════════════════════════════════ */

interface FeaturesPageProps {
  user?: SessionUser | null;
  onOpenModal?: (key: ModalKey) => void;
  onRequestLocation?: () => void;
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

interface ChatMessage {
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

type AttachmentItem = {
  id: string;
  file: File;
  previewUrl?: string;
};

const MODE_OPTIONS = ["快速规划", "精细规划", "亲子优先", "省钱优先"] as const;

/* ── Sidebar mock data ── */
const SIDEBAR_NAV = [
  { icon: "✨", label: "新建规划" },
  { icon: "🔍", label: "搜索记录" },
  { icon: "📍", label: "地点灵感" },
  { icon: "📅", label: "日程草稿" },
  { icon: "⭐", label: "收藏方案" },
];

const SIDEBAR_RECENT = [
  "武康路晚餐规划",
  "亲子半日游",
  "雨天室内备选",
  "朋友聚会路线",
  "演唱会后夜宵",
  "西湖一日慢游",
  "带爸妈吃饭",
];

/* ═══════════════════════════════════════════════
   Sub-components
   ═══════════════════════════════════════════════ */

/* ── Inline Toast ── */
function InlineToast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2800);
    return () => clearTimeout(t);
  }, [onDone]);
  return <div className={styles.composerToast}>{message}</div>;
}

/* ── Ambient Background ── */
function AmbientBackground() {
  return (
    <div className={styles.featureAmbient} aria-hidden="true">
      <div className={`${styles.ambientOrb} ${styles.ambientOrb1}`} />
      <div className={`${styles.ambientOrb} ${styles.ambientOrb2}`} />
      <div className={`${styles.ambientCard} ${styles.ambientCard1}`} />
      <div className={`${styles.ambientCard} ${styles.ambientCard2}`} />
      <div className={`${styles.ambientLine} ${styles.ambientLine1}`} />
      <div className={`${styles.ambientLine} ${styles.ambientLine2}`} />
      <div className={`${styles.ambientDot} ${styles.ambientDot1}`} />
      <div className={`${styles.ambientDot} ${styles.ambientDot2}`} />
    </div>
  );
}

/* ── Sidebar ── */
function Sidebar({
  user,
  open,
  onClose,
  onNewChat,
}: {
  user?: SessionUser | null;
  open: boolean;
  onClose: () => void;
  onNewChat: () => void;
}) {
  return (
    <>
      {open && <div className={styles.sidebarOverlay} onClick={onClose} />}
      <aside className={`${styles.featureSidebar} ${open ? styles.featureSidebarOpen : ""}`}>
        {/* Header */}
        <div className={styles.sidebarHeader}>
          <div className={styles.sidebarLogo}>谱</div>
          <span className={styles.sidebarBrand}>周末有谱</span>
        </div>

        <button className={styles.sidebarNewBtn} onClick={onNewChat}>
          ✨ 新建规划
        </button>

        {/* Nav */}
        <nav className={styles.sidebarNav}>
          <div className={styles.sidebarNavLabel}>功能</div>
          {SIDEBAR_NAV.map((item) => (
            <button key={item.label} className={styles.sidebarNavItem}>
              <span className={styles.sidebarNavIcon}>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        {/* Recent */}
        <div className={styles.sidebarNavLabel}>最近规划</div>
        <div className={styles.sidebarRecent}>
          {SIDEBAR_RECENT.map((title) => (
            <button key={title} className={styles.sidebarRecentItem}>
              <span className={styles.recentDot} />
              {title}
            </button>
          ))}
        </div>

        {/* Footer */}
        <div className={styles.sidebarFooter}>
          <div className={styles.sidebarAvatar}>
            {user?.name?.[0] || "游"}
          </div>
          <div className={styles.sidebarUserInfo}>
            <div className={styles.sidebarUserName}>{user?.name || "游客"}</div>
            <div className={styles.sidebarUserTag}>
              {user?.mode === "registered" ? "已注册" : "体验模式"}
            </div>
          </div>
          <button className={styles.sidebarSettingsBtn} title="设置">
            ⚙
          </button>
        </div>
      </aside>
    </>
  );
}

/* ── Composer (Gemini-style slim capsule) ── */
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
  const [modeOpen, setModeOpen] = useState(false);
  const [modeIndex, setModeIndex] = useState(1); // "精细规划"

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
      requestAnimationFrame(() => textareaRef.current?.focus());
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
    onToast?.("正在录音，点击麦克风停止");
  }, [isRecording, SpeechRecognitionCtor, onChange, onToast, textareaRef]);

  /* ── Mode dropdown ── */
  const handleModeClick = useCallback(() => {
    setModeOpen((v) => !v);
  }, []);

  const handleModeSelect = useCallback((idx: number) => {
    setModeIndex(idx);
    setModeOpen(false);
    onToast?.(`已切换为「${MODE_OPTIONS[idx]}」模式`);
  }, [onToast]);

  // Close mode dropdown on outside click
  useEffect(() => {
    if (!modeOpen) return;
    const close = () => setModeOpen(false);
    document.addEventListener("click", close, { once: true });
    return () => document.removeEventListener("click", close);
  }, [modeOpen]);

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
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
        style={{ display: "none" }}
        onChange={handleFilesSelected}
      />

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

        <div style={{ position: "relative" }}>
          <button
            className={styles.composerModeButton}
            type="button"
            onClick={handleModeClick}
          >
            {MODE_OPTIONS[modeIndex]}
          </button>
          {modeOpen && (
            <div className={styles.composerModeDropdown}>
              {MODE_OPTIONS.map((label, idx) => (
                <button
                  key={label}
                  className={`${styles.composerModeItem} ${idx === modeIndex ? styles.composerModeItemActive : ""}`}
                  onClick={(e) => { e.stopPropagation(); handleModeSelect(idx); }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

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
          发送
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

/* ── Plan Card ── */
function PlanCardView({
  plan,
  selected,
  onSelect,
}: {
  plan: PlanningOption;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <div className={styles.planCard}>
      <div className={styles.planCardTitle}>{plan.title}</div>
      {plan.summary && <div className={styles.planCardReason}>{plan.summary}</div>}

      {plan.timeline.length > 0 && (
        <ul className={styles.planCardTimeline}>
          {plan.timeline.map((step) => (
            <li key={step.id}>
              {step.startTime}–{step.endTime} {step.title}
              {step.poiName ? ` · ${step.poiName}` : ""}
            </li>
          ))}
        </ul>
      )}

      <div className={styles.planCardMeta}>
        {plan.totalCostMin > 0 && (
          <span className={`${styles.planMetaTag} ${styles.planMetaTagBudget}`}>
            ¥{plan.totalCostMin}–{plan.totalCostMax}
          </span>
        )}
        {plan.walkingKm && plan.walkingKm > 0 && (
          <span className={`${styles.planMetaTag} ${styles.planMetaTagRoute}`}>
            步行 {plan.walkingKm}km
          </span>
        )}
        {plan.risks.map((r) => (
          <span key={r} className={`${styles.planMetaTag} ${styles.planMetaTagRisk}`}>
            ⚠ {r}
          </span>
        ))}
        {plan.highlights.map((h) => (
          <span key={h} className={`${styles.planMetaTag} ${styles.planMetaTagDefault}`}>
            ✦ {h}
          </span>
        ))}
      </div>

      <div className={styles.planCardActions}>
        <button
          className={`${styles.actionBtn} ${selected ? styles.actionBtnPrimary : styles.actionBtnSecondary}`}
          onClick={() => onSelect(plan.id)}
        >
          {selected ? "✓ 已选择" : "选这套"}
        </button>
      </div>
    </div>
  );
}

/* ── Error Card (inside message stream) ── */
function ErrorCardView({
  message,
  onRetry,
  onNew,
}: {
  message: string;
  onRetry: () => void;
  onNew: () => void;
}) {
  const [showHint, setShowHint] = useState(false);

  return (
    <div className={styles.errorCard}>
      <div className={styles.errorCardTitle}>⚠ 规划服务连接失败</div>
      <div className={styles.errorCardMessage}>{message}</div>

      <div className={styles.errorCardHint}>
        {`# .env.local
VITE_API_BASE=${getApiBase()}

# 启动后端
npm run dev:api

# 启动前端
npm run dev`}
      </div>

      <div className={styles.errorCardActions}>
        <button
          className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
          onClick={onRetry}
        >
          重试
        </button>
        <button
          className={`${styles.actionBtn} ${styles.actionBtnSecondary}`}
          onClick={() => setShowHint((v) => !v)}
        >
          {showHint ? "收起说明" : "查看启动说明"}
        </button>
        <button
          className={`${styles.actionBtn} ${styles.actionBtnSecondary}`}
          onClick={onNew}
        >
          新一轮
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════════ */

const EXAMPLE_PROMPTS = [
  "明天带娃半天，预算 300",
  "朋友来上海，找小众路线",
  "下雨天室内好去处",
  "纪念日约会西餐路线",
];

export default function FeaturesPage({ user, onOpenModal }: FeaturesPageProps) {
  const [mode, setMode] = useState<"idle" | "chat">("idle");
  const [inputValue, setInputValue] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [phase, setPhase] = useState<ChatPhase>("idle");
  const [isBusy, setIsBusy] = useState(false);
  const [healthOk, setHealthOk] = useState<boolean | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const city = user?.city || "上海";

  /* ── Scroll to bottom helper ── */
  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    });
  }, []);

  /* ── Health check on mount ── */
  useEffect(() => {
    checkHealth()
      .then((r) => setHealthOk(r.ok))
      .catch(() => setHealthOk(false));
  }, []);

  /* ── Auto-scroll when messages change ── */
  useEffect(() => {
    if (mode === "chat") scrollToBottom();
  }, [messages, mode, scrollToBottom]);

  /* ── Focus textarea on mode switch ── */
  useEffect(() => {
    if (mode === "idle") {
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  }, [mode]);

  /* ── Message helpers ── */
  const addMessage = useCallback((msg: ChatMessage) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  const updateLastAssistant = useCallback(
    (patch: Partial<ChatMessage>) => {
      setMessages((prev) => {
        const next = [...prev];
        for (let i = next.length - 1; i >= 0; i--) {
          if (next[i].role === "assistant") {
            next[i] = { ...next[i], ...patch };
            break;
          }
        }
        return next;
      });
    },
    [],
  );

  /* ── Core submit flow ── */
  const doSubmit = useCallback(
    async (prompt: string) => {
      if (!prompt || isBusy) return;

      setMode("chat");
      setIsBusy(true);
      setPhase("understanding");

      // 1) Add user message
      const userMsg: ChatMessage = {
        id: uuid(),
        role: "user",
        content: prompt,
        createdAt: new Date().toISOString(),
      };
      addMessage(userMsg);
      setInputValue("");

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
      addMessage(thinkingMsg);

      // 3) Call API
      try {
        setPhase("planning");
        const result = await requestPlanning({
          prompt,
          city,
          companions: "family",
        });

        if (result.options && result.options.length > 0) {
          updateLastAssistant({
            status: "success",
            content: result.summary || "为你找到以下方案：",
            chips: undefined,
            plans: result.options,
            actions: result.executableActions,
          });
          setPhase("result");
        } else {
          updateLastAssistant({
            status: "success",
            content: result.summary || "已完成规划。",
            chips: undefined,
          });
          setPhase("done");
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "规划服务暂时不可用";
        updateLastAssistant({
          status: "error",
          content: errorMsg,
          chips: undefined,
        });
        setPhase("error");
      } finally {
        setIsBusy(false);
      }
    },
    [isBusy, city, addMessage, updateLastAssistant],
  );

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

  const handleExampleChip = useCallback((prompt: string) => {
    doSubmit(prompt);
  }, [doSubmit]);

  const handleChipToInput = useCallback((prompt: string) => {
    setInputValue(prompt);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, []);

  const handleSelectPlan = useCallback(
    (planId: string) => {
      setPhase("selected");
      const actionMsg: ChatMessage = {
        id: uuid(),
        role: "assistant",
        content: "这套方案可以继续处理以下事项，你想先做哪一步？",
        status: "success",
        createdAt: new Date().toISOString(),
      };
      addMessage(actionMsg);
      scrollToBottom();
    },
    [addMessage, scrollToBottom],
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
    setSidebarOpen(false);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, []);

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
                      <span key={c} className={styles.thinkingChip}>{c}</span>
                    ))}
                  </div>
                )}
                <div className={styles.thinkingDots}>
                  <span /><span /><span />
                </div>
              </div>
            )}

            {/* Error state */}
            {msg.status === "error" && (
              <ErrorCardView
                message={msg.content}
                onRetry={handleRetryLast}
                onNew={handleNewChat}
              />
            )}

            {/* Success state */}
            {msg.status === "success" && (
              <>
                {msg.content && <div className={styles.resultSummary}>{msg.content}</div>}

                {/* Plan cards */}
                {msg.plans && msg.plans.length > 0 && (
                  <div className={styles.planCards}>
                    {msg.plans.map((plan) => (
                      <PlanCardView
                        key={plan.id}
                        plan={plan}
                        selected={phase === "selected" || phase === "done"}
                        onSelect={handleSelectPlan}
                      />
                    ))}
                  </div>
                )}

                {/* Executable actions */}
                {msg.actions && msg.actions.length > 0 && (
                  <div className={styles.actionCards}>
                    {msg.actions.map((action) => (
                      <div key={action.id} className={styles.actionCard}>
                        <div className={styles.actionCardTitle}>{action.title}</div>
                        <div className={styles.actionCardDesc}>{action.description}</div>
                        {action.priceEstimate && (
                          <div className={styles.actionCardPrice}>预估：{action.priceEstimate}</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Next action chips */}
                {phase === "selected" && (
                  <div className={styles.nextActionChips}>
                    {["保存方案", "生成日历", "分享给同行人", "查看预约建议", "打开导航"].map(
                      (label) => (
                        <button
                          key={label}
                          className={styles.nextActionChip}
                          onClick={() => setToast(`${label}功能开发中`)}
                        >
                          {label}
                        </button>
                      ),
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      );
    },
    [phase, handleRetryLast, handleNewChat, handleSelectPlan, setToast],
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
      <Sidebar
        user={user}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onNewChat={handleNewChat}
      />

      {/* Main area */}
      <main className={styles.featureMain}>
        <AmbientBackground />

        {mode === "idle" ? (
          /* ── Idle: centered title + composer ── */
          <div className={styles.featureHome}>
            <h1 className={styles.featureHomeTitle}>周末去哪儿</h1>
            <p className={styles.featureHomeSubtitle}>
              输入一句话，AI 帮你规划完整周末
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
              onOpenModal={onOpenModal}
              onToast={setToast}
            />

            {toast && <InlineToast message={toast} onDone={() => setToast(null)} />}

            <div className={styles.featureChips}>
              {EXAMPLE_PROMPTS.map((p) => (
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
                {healthOk
                  ? "规划服务已连接"
                  : `未连接后端 · ${getApiBase()}`}
              </div>
            )}
          </div>
        ) : (
          /* ── Chat: messages + docked composer ── */
          <div className={styles.featureChat}>
            <div className={styles.featureMessages}>
              <div className={styles.featureMessagesInner}>
                {messages.map((msg) => (
                  <div key={msg.id}>{renderMessageContent(msg)}</div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            </div>

            <div className={styles.featureComposerDock}>
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
        )}
      </main>
    </section>
  );
}
