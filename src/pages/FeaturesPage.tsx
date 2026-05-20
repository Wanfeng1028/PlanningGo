import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { v4 as uuid } from "uuid";
import { ArrowLeft } from "lucide-react";
import {
  requestPlanning,
  quoteAction as apiQuoteAction,
  confirmAction as apiConfirmAction,
  cancelAction as apiCancelAction,
  checkHealth,
  type PlanningOption,
  type PlanningExecutableAction,
} from "../lib/api";
import {
  FeatureModal,
  FeaturePopover,
  PopoverItem,
  ConfirmActions,
} from "../components/FeatureModal";
import type { ModalKey, NavKey, SessionUser } from "../types";
import styles from "./FeaturesPage.module.scss";

/* ═══════════════════════════════════════════════
   FeaturesPage — Gemini-style AI Planning Workspace
   ═══════════════════════════════════════════════ */

interface FeaturesPageProps {
  user?: SessionUser | null;
  onOpenModal?: (key: ModalKey) => void;
  onRequestLocation?: () => void;
  onNavigate?: (key: NavKey) => void;
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

type VoiceState =
  | "idle"
  | "listening"
  | "no-speech"
  | "not-allowed"
  | "not-supported"
  | "error"
  | "processing";

const MODEL_MODES = ["Flash", "Pro"] as const;
type ModelMode = typeof MODEL_MODES[number];

/** 将前端 ModelMode 转为后端期望的小写格式 */
function toApiModelMode(mode: ModelMode): "flash" | "pro" {
  return mode.toLowerCase() as "flash" | "pro";
}

/* ── Sidebar mock data ── */
const SIDEBAR_NAV = [
  { icon: "✨", label: "新建规划", id: "new" },
  { icon: "🔍", label: "搜索记录", id: "search" },
  { icon: "📍", label: "地点灵感", id: "inspiration" },
  { icon: "📅", label: "日程草稿", id: "drafts" },
  { icon: "⭐", label: "收藏方案", id: "favorites" },
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
function InlineToast({
  message,
  onDone,
}: {
  message: string;
  onDone: () => void;
}) {
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
      <div className={styles.ambientGrid} />
      <div className={`${styles.ambientOrb} ${styles.ambientOrb1}`} />
      <div className={`${styles.ambientOrb} ${styles.ambientOrb2}`} />
      <div className={`${styles.ambientCard} ${styles.ambientCard1}`}>
        <div className={`${styles.ambientCardContent} ${styles.ambientCardContent1}`}>
          <span className={styles.ambientLabel}>今日路线</span>
          <span className={styles.ambientTitle}>朝阳公园 → 三里屯</span>
          <span className={styles.ambientMeta}><span>📍</span> 2.3km · 步行28min</span>
        </div>
      </div>
      <div className={`${styles.ambientCard} ${styles.ambientCard2}`}>
        <div className={`${styles.ambientCardContent} ${styles.ambientCardContent2}`}>
          <span className={styles.ambientIcon}>🌧️</span>
          <div className={styles.ambientText}>
            <span className={styles.ambientLabel}>备选方案</span>
            <span className={styles.ambientTitle}>雨天室内路线</span>
          </div>
        </div>
      </div>
      <div className={styles.ambientRoute}>
        <svg viewBox="0 0 200 150">
          <path d="M 10 10 C 50 10, 40 80, 100 75 S 160 130, 190 120" />
        </svg>
        <div className={styles.ambientRouteDot} />
        <div className={styles.ambientRouteDot} />
      </div>
      <div className={`${styles.ambientLine} ${styles.ambientLine1}`} />
      <div className={`${styles.ambientLine} ${styles.ambientLine2}`} />
      <div className={`${styles.ambientLine} ${styles.ambientLine3}`} />
      <div className={`${styles.ambientDot} ${styles.ambientDot1}`} />
      <div className={`${styles.ambientDot} ${styles.ambientDot2}`} />
      <div className={`${styles.ambientDot} ${styles.ambientDot3}`} />
    </div>
  );
}

/* ── Sidebar ── */
function Sidebar({
  user,
  open,
  onClose,
  onNewChat,
  onNavItemClick,
  onRecentClick,
  searchQuery,
  onSearchChange,
  modelMode,
  onModelModeChange,
  onToast,
  onReturnHome,
}: {
  user?: SessionUser | null;
  open: boolean;
  onClose: () => void;
  onNewChat: () => void;
  onNavItemClick: (id: string) => void;
  onRecentClick: (title: string) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  modelMode: ModelMode;
  onModelModeChange: (mode: ModelMode) => void;
  onToast: (msg: string) => void;
  onReturnHome?: () => void;
}) {
  const [showSearch, setShowSearch] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const handleNavClick = (id: string) => {
    if (id === "search") {
      setShowSearch(!showSearch);
    } else {
      onNavItemClick(id);
    }
    onClose();
  };

  const filteredRecent = searchQuery
    ? SIDEBAR_RECENT.filter((t) => t.toLowerCase().includes(searchQuery.toLowerCase()))
    : SIDEBAR_RECENT;

  return (
    <>
      {open && <div className={styles.sidebarOverlay} onClick={onClose} />}
      <aside className={`${styles.featureSidebar} ${open ? styles.featureSidebarOpen : ""}`}>
        {/* Header */}
        <div className={styles.sidebarHeader}>
          <div className={styles.sidebarLogoRow}>
            <div className={styles.sidebarLogo}>谱</div>
            <span className={styles.sidebarBrand}>周末有谱</span>
          </div>
          {onReturnHome && (
            <button className={styles.returnHomeBtn} onClick={onReturnHome}>
              <ArrowLeft size={14} />
              返回官网
            </button>
          )}
        </div>

        <button className={styles.sidebarNewBtn} onClick={onNewChat}>
          ✨ 新建规划
        </button>

        {/* Nav */}
        <nav className={styles.sidebarNav}>
          <div className={styles.sidebarNavLabel}>功能</div>
          {SIDEBAR_NAV.map((item) => (
            <button key={item.id} className={styles.sidebarNavItem} onClick={() => handleNavClick(item.id)}>
              <span className={styles.sidebarNavIcon}>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        {/* Search */}
        {showSearch && (
          <div className={styles.sidebarSearchBox}>
            <input
              type="text"
              placeholder="搜索记录..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className={styles.sidebarSearchInput}
            />
          </div>
        )}

        {/* Recent */}
        <div className={styles.sidebarNavLabel}>最近规划</div>
        <div className={styles.sidebarRecent}>
          {filteredRecent.length > 0 ? (
            filteredRecent.map((title) => (
              <button key={title} className={styles.sidebarRecentItem} onClick={() => onRecentClick(title)}>
                <span className={styles.recentDot} />
                {title}
              </button>
            ))
          ) : (
            <div className={styles.sidebarEmpty}>没有找到匹配记录</div>
          )}
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
          <button className={styles.sidebarSettingsBtn} title="设置" onClick={() => setShowSettings(true)}>
            ⚙
          </button>
        </div>
      </aside>

      {/* Settings Modal */}
      <FeatureModal
        open={showSettings}
        onClose={() => { setShowSettings(false); setShowClearConfirm(false); }}
        title="设置"
        subtitle="管理你的规划偏好"
      >
        <div className={styles.settingsList}>
          <button className={styles.settingsItem} onClick={() => {
            const next = modelMode === "Flash" ? "Pro" : "Flash";
            onModelModeChange(next);
            onToast(`已切换为 ${next} 模式`);
          }}>
            <span className={styles.settingsItemIcon}>🤖</span>
            <span className={styles.settingsItemContent}>
              <span className={styles.settingsItemLabel}>模型偏好</span>
              <span className={styles.settingsItemDesc}>
                当前：{modelMode === "Flash" ? "Flash · 快速规划" : "Pro · 深度推理"}
              </span>
            </span>
            <span className={styles.settingsItemValue}>{modelMode}</span>
          </button>

          <button className={styles.settingsItem}>
            <span className={styles.settingsItemIcon}>📍</span>
            <span className={styles.settingsItemContent}>
              <span className={styles.settingsItemLabel}>位置偏好</span>
              <span className={styles.settingsItemDesc}>用于推荐附近目的地</span>
            </span>
            <span className={styles.settingsItemValue}>{user?.city || "上海"}</span>
          </button>

          <button className={styles.settingsItem} onClick={() => setShowClearConfirm(true)}>
            <span className={styles.settingsItemIcon}>🗑️</span>
            <span className={styles.settingsItemContent}>
              <span className={styles.settingsItemLabel}>清空本地记录</span>
              <span className={styles.settingsItemDesc}>删除草稿和收藏数据</span>
            </span>
          </button>
        </div>
      </FeatureModal>

      {/* Clear Confirm Modal */}
      <FeatureModal
        open={showClearConfirm}
        onClose={() => setShowClearConfirm(false)}
        title="清空本地记录"
        width="sm"
        danger
      >
        <p className={styles.confirmText}>
          确定清空本地规划记录吗？清空后草稿和收藏数据将无法恢复。
        </p>
        <ConfirmActions
          confirmLabel="清空记录"
          danger
          onCancel={() => setShowClearConfirm(false)}
          onConfirm={() => {
            localStorage.removeItem("pg_drafts");
            localStorage.removeItem("pg_favorites");
            onToast("本地记录已清空");
            setShowClearConfirm(false);
            setShowSettings(false);
          }}
        />
      </FeatureModal>
    </>
  );
}

/* ── Composer (Like-style slim capsule) ── */
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
  modelMode: ModelMode;
  onModelModeChange: (mode: ModelMode) => void;
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
  modelMode,
  onModelModeChange,
}: ComposerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const valueRef = useRef(value);
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");

  // Popover states
  const [plusOpen, setPlusOpen] = useState(false);
  const [modeOpen, setModeOpen] = useState(false);
  const [companionOpen, setCompanionOpen] = useState(false);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

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

  /* ── Plus menu actions ── */
  const PLUS_ITEMS = [
    { icon: "📍", label: "添加地点", desc: "输入出发地或目的地", action: "location" as const },
    { icon: "🖼", label: "添加图片", desc: "图片识别稍后开放", action: "image" as const },
    { icon: "⚙", label: "添加偏好", desc: "少排队、室内优先等", action: "preference" as const },
    { icon: "👥", label: "添加同行人", desc: "家人、朋友、情侣、独自", action: "companion" as const },
    { icon: "💰", label: "添加预算", desc: "人均消费范围", action: "budget" as const },
  ];

  const handlePlusAction = useCallback((action: string) => {
    setPlusOpen(false);
    switch (action) {
      case "location":
        onChange(value ? `${value}\n出发地：` : "出发地：");
        requestAnimationFrame(() => textareaRef.current?.focus());
        break;
      case "image":
        handleFilePick();
        break;
      case "preference":
        onChange(value ? `${value}\n偏好：少排队、少走路、室内优先` : "偏好：少排队、少走路、室内优先");
        requestAnimationFrame(() => textareaRef.current?.focus());
        break;
      case "companion":
        setCompanionOpen(true);
        break;
      case "budget":
        onChange(value ? `${value}\n预算：人均 200` : "预算：人均 200");
        requestAnimationFrame(() => textareaRef.current?.focus());
        break;
    }
  }, [value, onChange, textareaRef, handleFilePick]);

  const COMPANION_OPTIONS = [
    { value: "家人", icon: "👨‍👩‍👧‍👦", label: "家庭出行" },
    { value: "朋友", icon: "👥", label: "朋友聚会" },
    { value: "情侣", icon: "💑", label: "情侣约会" },
    { value: "独自", icon: "🚶", label: "独自出行" },
  ];

  const handleCompanionSelect = useCallback((companion: string) => {
    setCompanionOpen(false);
    onChange(value ? `${value}\n同行人：${companion}` : `同行人：${companion}`);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, [value, onChange, textareaRef]);

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
      setVoiceState("not-supported");
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = "zh-CN";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    let finalTranscript = "";
    let hasResult = false;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      hasResult = true;
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
      setIsRecording(false);
      recognitionRef.current = null;

      switch (event.error) {
        case "not-allowed":
          setVoiceState("not-allowed");
          break;
        case "no-speech":
          if (!hasResult) setVoiceState("no-speech");
          break;
        case "audio-capture":
          setVoiceState("error");
          break;
        case "network":
          setVoiceState("error");
          break;
        case "aborted":
          break;
        default:
          setVoiceState("error");
      }
    };

    recognition.onend = () => {
      setIsRecording(false);
      recognitionRef.current = null;
      if (hasResult) {
        setVoiceState("processing");
        setTimeout(() => {
          setVoiceState("idle");
          requestAnimationFrame(() => textareaRef.current?.focus());
        }, 600);
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
    setVoiceState("listening");
  }, [isRecording, SpeechRecognitionCtor, onChange, textareaRef]);

  /* ── Mode select ── */
  const handleModeSelect = useCallback((mode: ModelMode) => {
    onModelModeChange(mode);
    setModeOpen(false);
    onToast?.(`已切换为 ${mode} 模式`);
  }, [onModelModeChange, onToast]);

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
    if (file.type.includes("word") || file.name.endsWith(".doc") || file.name.endsWith(".docx")) return "📝";
    if (file.type.includes("sheet") || file.name.endsWith(".xls") || file.name.endsWith(".xlsx")) return "📊";
    return "📎";
  };

  const voicePanelData = useMemo(() => {
    switch (voiceState) {
      case "listening":
        return { title: "正在听你说…", desc: "说出时间、预算、同行人和想去的方向", showStop: true, showRetry: false, showClose: false };
      case "no-speech":
        return { title: "没有听到内容", desc: "可以再试一次，或者直接打字输入", showStop: false, showRetry: true, showClose: true };
      case "not-allowed":
        return { title: "麦克风权限未开启", desc: "请在浏览器地址栏允许麦克风权限后重试", showStop: false, showRetry: false, showClose: true };
      case "not-supported":
        return { title: "当前浏览器不支持语音输入", desc: "可以直接用文字描述你的周末需求", showStop: false, showRetry: false, showClose: true };
      case "processing":
        return { title: "正在整理语音…", desc: "我会把识别内容填入输入框", showStop: false, showRetry: false, showClose: false };
      case "error":
        return { title: "语音服务暂时不可用", desc: "可以稍后重试，或者直接打字描述", showStop: false, showRetry: true, showClose: true };
      default:
        return null;
    }
  }, [voiceState]);

  return (
    <div
      className={`${styles.featureComposer} ${compact ? styles.featureComposerCompact : ""}`}
    >
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
                <span className={styles.attachmentFileIcon}>
                  {fileIcon(att.file)}
                </span>
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
        {/* Plus button with popover menu */}
        <div className={styles.composerPopoverWrap}>
          <button
            className={styles.composerIconButton}
            type="button"
            aria-label="添加内容"
            onClick={() => setPlusOpen((v) => !v)}
            disabled={disabled}
          >
            +
          </button>
          <FeaturePopover open={plusOpen} onClose={() => setPlusOpen(false)}>
            {PLUS_ITEMS.map((item) => (
              <PopoverItem
                key={item.action}
                icon={item.icon}
                label={item.label}
                desc={item.desc}
                onClick={() => handlePlusAction(item.action)}
              />
            ))}
          </FeaturePopover>
        </div>

        <textarea
          ref={textareaRef}
          className={styles.composerTextarea}
          placeholder={placeholder || "明天带娃半天，预算 300，想玩点不一样的…"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
        />

        {/* Model mode selector with popover */}
        <div className={styles.composerPopoverWrap}>
          <button
            className={styles.composerModeButton}
            type="button"
            onClick={() => setModeOpen((v) => !v)}
          >
            {modelMode}
          </button>
          <FeaturePopover open={modeOpen} onClose={() => setModeOpen(false)}>
            <PopoverItem
              label="Flash"
              desc="快速规划，适合普通周末路线"
              check={modelMode === "Flash"}
              onClick={() => handleModeSelect("Flash")}
            />
            <PopoverItem
              label="Pro"
              desc="复杂约束，多人偏好、天气、排队综合推理"
              check={modelMode === "Pro"}
              onClick={() => handleModeSelect("Pro")}
            />
          </FeaturePopover>
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
            <span className={styles.composerMetaItem}>
              👤 {user.name || "已登录"}
            </span>
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

      {/* Voice Panel — floating above composer */}
      {voicePanelData && (
        <div className={styles.voicePanel}>
          <button
            className={styles.voiceCloseBtn}
            type="button"
            aria-label="关闭"
            onClick={() => {
              if (isRecording && recognitionRef.current) recognitionRef.current.stop();
              setVoiceState("idle");
            }}
          >
            ×
          </button>

          <div className={styles.voiceOrb}>
            {voiceState === "listening" || voiceState === "processing" ? (
              <><span /><span /><span /></>
            ) : voiceState === "no-speech" ? (
              <span className={styles.voiceOrbIcon}>🔇</span>
            ) : voiceState === "not-allowed" ? (
              <span className={styles.voiceOrbIcon}>🚫</span>
            ) : (
              <span className={styles.voiceOrbIcon}>⚠</span>
            )}
          </div>

          <div className={styles.voiceTitle}>{voicePanelData.title}</div>
          <div className={styles.voiceHint}>{voicePanelData.desc}</div>

          <div className={styles.voiceActions}>
            {voicePanelData.showStop && (
              <button
                className={styles.voiceStopBtn}
                type="button"
                onClick={() => {
                  if (recognitionRef.current) recognitionRef.current.stop();
                }}
              >
                停止
              </button>
            )}
            {voicePanelData.showRetry && (
              <button
                className={styles.voiceRetryBtn}
                type="button"
                onClick={() => {
                  setVoiceState("idle");
                  requestAnimationFrame(() => toggleRecording());
                }}
              >
                再试一次
              </button>
            )}
            {voicePanelData.showClose && (
              <button
                className={styles.voiceCloseTextBtn}
                type="button"
                onClick={() => setVoiceState("idle")}
              >
                {voiceState === "no-speech" ? "关闭" : "知道了"}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Companion Selection Modal */}
      <FeatureModal
        open={companionOpen}
        onClose={() => setCompanionOpen(false)}
        title="选择同行人"
        subtitle="帮助 AI 更好地规划适合的路线"
        width="sm"
      >
        <div className={styles.companionGrid}>
          {COMPANION_OPTIONS.map((co) => (
            <button
              key={co.value}
              className={styles.companionOption}
              onClick={() => handleCompanionSelect(co.value)}
            >
              <span className={styles.companionIcon}>{co.icon}</span>
              <span className={styles.companionLabel}>{co.label}</span>
            </button>
          ))}
        </div>
      </FeatureModal>
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
      {plan.summary && (
        <div className={styles.planCardReason}>{plan.summary}</div>
      )}

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
          <span
            key={r}
            className={`${styles.planMetaTag} ${styles.planMetaTagRisk}`}
          >
            ⚠ {r}
          </span>
        ))}
        {plan.highlights.map((h) => (
          <span
            key={h}
            className={`${styles.planMetaTag} ${styles.planMetaTagDefault}`}
          >
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
  const isNetworkError =
    message.includes("无法连接") ||
    message.includes("Failed to fetch") ||
    message.includes("NetworkError");

  return (
    <>
      <div className={styles.errorCard}>
        <div className={styles.errorCardTitle}>
          {isNetworkError ? "⚠ 规划服务暂时不可用" : "⚠ 出了点问题"}
        </div>
        <div className={styles.errorCardMessage}>{message}</div>

        <div className={styles.errorCardActions}>
          <button
            className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
            onClick={onRetry}
          >
            重试
          </button>
          {isNetworkError && (
            <button
              className={`${styles.actionBtn} ${styles.actionBtnSecondary}`}
              onClick={() => setShowHint(true)}
            >
              查看启动说明
            </button>
          )}
          <button
            className={`${styles.actionBtn} ${styles.actionBtnSecondary}`}
            onClick={onNew}
          >
            新一轮
          </button>
        </div>
      </div>

      {/* Startup Instructions Modal */}
      <FeatureModal
        open={showHint}
        onClose={() => setShowHint(false)}
        title="本地服务启动说明"
        subtitle="确保前后端服务正常运行"
        width="sm"
      >
        <div className={styles.startupSteps}>
          <div className={styles.startupStep}>
            <span className={styles.startupStepNum}>1</span>
            <div className={styles.startupStepContent}>
              <strong>启动后端服务</strong>
              <code>npm run dev:api</code>
            </div>
          </div>
          <div className={styles.startupStep}>
            <span className={styles.startupStepNum}>2</span>
            <div className={styles.startupStepContent}>
              <strong>启动前端服务</strong>
              <code>npm run dev</code>
            </div>
          </div>
          <div className={styles.startupStep}>
            <span className={styles.startupStepNum}>3</span>
            <div className={styles.startupStepContent}>
              <strong>环境配置</strong>
              <span>在 .env.local 中设置</span>
              <code>VITE_API_BASE=http://127.0.0.1:3001</code>
            </div>
          </div>
        </div>
        <div className={styles.startupActions}>
          <button
            className={styles.startupBtn}
            onClick={() => setShowHint(false)}
          >
            知道了
          </button>
        </div>
      </FeatureModal>
    </>
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

const HERO_PHRASES = [
  "周末去哪儿",
  "今天怎么安排",
  "带谁一起出发",
  "雨天也有备选",
  "一句话生成路线",
  "把纠结变成安排",
] as const;

export default function FeaturesPage({ user, onOpenModal, onNavigate }: FeaturesPageProps) {
  const [mode, setMode] = useState<"idle" | "chat">("idle");
  const [inputValue, setInputValue] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [phase, setPhase] = useState<ChatPhase>("idle");
  const [isBusy, setIsBusy] = useState(false);
  const [healthOk, setHealthOk] = useState<boolean | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [modelMode, setModelMode] = useState<ModelMode>("Flash");
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [showReturnConfirm, setShowReturnConfirm] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [drafts, setDrafts] = useState<string[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [typedText, setTypedText] = useState("");
  const [isTyping, setIsTyping] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimerRef = useRef<NodeJS.Timeout | null>(null);

  const city = user?.city || "上海";

  /* ── Typewriter effect for hero title ── */
  useEffect(() => {
    const currentPhrase = HERO_PHRASES[phraseIndex];
    const typeSpeed = 80;
    const deleteSpeed = 40;
    const pauseAfterType = 2800;
    const pauseAfterDelete = 500;

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

  // Load saved preferences from localStorage
  useEffect(() => {
    const savedMode = localStorage.getItem("pg_model_mode") as ModelMode;
    if (savedMode === "Flash" || savedMode === "Pro") {
      setModelMode(savedMode);
    }
    const savedDrafts = localStorage.getItem("pg_drafts");
    if (savedDrafts) {
      try {
        setDrafts(JSON.parse(savedDrafts));
      } catch {}
    }
    const savedFavorites = localStorage.getItem("pg_favorites");
    if (savedFavorites) {
      try {
        setFavorites(JSON.parse(savedFavorites));
      } catch {}
    }
  }, []);

  // Save modelMode to localStorage when changed
  useEffect(() => {
    localStorage.setItem("pg_model_mode", modelMode);
  }, [modelMode]);

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

  const updateLastAssistant = useCallback((patch: Partial<ChatMessage>) => {
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
  }, []);

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
          modelMode: toApiModelMode(modelMode),
        });

        // 确保 options 数组存在且不为空
        if (result.options && result.options.length > 0) {
          // 为每个 option 生成唯一 ID（如果后端没有提供）
          const optionsWithIds = result.options.map((opt, idx) => ({
            ...opt,
            id: opt.id || `plan_${idx}`,
          }));

          updateLastAssistant({
            status: "success",
            content: result.summary || "为你找到以下方案：",
            chips: undefined,
            plans: optionsWithIds,
            actions: result.executableActions || [],
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
        const errorMsg =
          err instanceof Error ? err.message : "规划服务暂时不可用";
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
    [isBusy, city, modelMode, addMessage, updateLastAssistant],
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

  const handleExampleChip = useCallback(
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
    (planId: string) => {
      setSelectedPlanId(planId);
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
    setSelectedPlanId(null);
    setSidebarOpen(false);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, []);

  /* ── Return to home ── */
  const handleReturnHome = useCallback(() => {
    // If there's content or messages, show confirmation
    if (inputValue.trim() || messages.length > 0) {
      setShowReturnConfirm(true);
    } else {
      onNavigate?.("home");
    }
  }, [inputValue, messages, onNavigate]);

  const handleConfirmReturnHome = useCallback(() => {
    setShowReturnConfirm(false);
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
        setToast("已填入地点灵感");
        break;
      case "drafts":
        if (drafts.length === 0) {
          addMessage({
            id: uuid(),
            role: "assistant",
            content: "还没有日程草稿。你可以把想去的地方、时间和预算发给我，我会整理成可执行路线。",
            status: "success",
            createdAt: new Date().toISOString(),
          });
          setMode("chat");
        } else {
          addMessage({
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
          addMessage({
            id: uuid(),
            role: "assistant",
            content: "还没有收藏方案，生成方案后可以收藏。",
            status: "success",
            createdAt: new Date().toISOString(),
          });
          setMode("chat");
        } else {
          addMessage({
            id: uuid(),
            role: "assistant",
            content: `已收藏 ${favorites.length} 个方案：\n${favorites.map((f, i) => `${i + 1}. ${f}`).join("\n")}`,
            status: "success",
            createdAt: new Date().toISOString(),
          });
          setMode("chat");
        }
        break;
    }
  }, [handleNewChat, drafts, favorites, addMessage]);

  const handleRecentClick = useCallback((title: string) => {
    setInputValue(title);
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
                {msg.content && (
                  <div className={styles.resultSummary}>{msg.content}</div>
                )}

                {/* Plan cards */}
                {msg.plans && msg.plans.length > 0 && (
                  <div className={styles.planCards}>
                    {msg.plans.map((plan) => (
                      <PlanCardView
                        key={plan.id}
                        plan={plan}
                        selected={selectedPlanId === plan.id}
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
                        <div className={styles.actionCardTitle}>
                          {action.title}
                        </div>
                        <div className={styles.actionCardDesc}>
                          {action.description}
                        </div>
                        {action.priceEstimate && (
                          <div className={styles.actionCardPrice}>
                            预估：{action.priceEstimate}
                          </div>
                        )}
                        <div className={styles.actionCardActions}>
                          <button
                            className={`${styles.actionBtn} ${styles.actionBtnSecondary}`}
                            onClick={() => setToast(`${action.title}将在后续版本中推出`)}
                          >
                            {action.status === "waiting_confirm" ? "确认" : "查看"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Next action chips */}
                {phase === "selected" && (
                  <div className={styles.nextActionChips}>
                    {[
                      "保存方案",
                      "生成日历",
                      "分享给同行人",
                      "查看预约建议",
                      "打开导航",
                    ].map((label) => (
                      <button
                        key={label}
                        className={styles.nextActionChip}
                        onClick={() => setToast(`${label}将在后续版本中推出`)}
                      >
                        {label}
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
        onNavItemClick={handleNavItemClick}
        onRecentClick={handleRecentClick}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        modelMode={modelMode}
        onModelModeChange={setModelMode}
        onToast={(msg) => setToast(msg)}
        onReturnHome={handleReturnHome}
      />

      {/* Main area */}
      <main className={styles.featureMain}>
        <AmbientBackground />

        {mode === "idle" ? (
          /* ── Idle: centered title + composer ── */
          <div className={styles.featureHome}>
            <h1 className={styles.featureHomeTitle}>
              {typedText}
              <span className={styles.typewriterCursor} />
            </h1>
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
              modelMode={modelMode}
              onModelModeChange={setModelMode}
            />

            {toast && (
              <InlineToast message={toast} onDone={() => setToast(null)} />
            )}

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
                {healthOk ? "规划服务已连接" : "服务未连接，请检查后端是否启动"}
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
                user={user}
                city={city}
                onOpenModal={onOpenModal}
                onToast={setToast}
                modelMode={modelMode}
                onModelModeChange={setModelMode}
              />
              {toast && (
                <InlineToast message={toast} onDone={() => setToast(null)} />
              )}
            </div>
          </div>
        )}
      </main>

      {/* 返回官网确认弹窗 */}
      <FeatureModal
        open={showReturnConfirm}
        onClose={() => setShowReturnConfirm(false)}
        title="离开规划工作区？"
        width="sm"
      >
        <p className={styles.confirmText}>
          当前规划内容将保留在本地存储中，下次进入可以继续查看。
        </p>
        <ConfirmActions
          cancelLabel="继续规划"
          confirmLabel="返回官网"
          onConfirm={handleConfirmReturnHome}
          onCancel={() => setShowReturnConfirm(false)}
        />
      </FeatureModal>
    </section>
  );
}
