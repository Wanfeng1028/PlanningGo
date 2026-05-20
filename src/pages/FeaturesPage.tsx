import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { v4 as uuid } from "uuid";
import { ArrowLeft } from "lucide-react";
import {
  requestPlanning,
  quoteAction as apiQuoteAction,
  confirmAction as apiConfirmAction,
  cancelAction as apiCancelAction,
  confirmExecAction,
  checkHealth,
  addMemory,
  selectPlan,
  listConversations,
  getConversation,
  togglePlanFavorite,
  trackEvent as apiTrackEvent,
  reportClientError,
  type PlanningOption,
  type PlanningExecutableAction,
  type ConversationItem,
} from "../lib/api";
import {
  FeaturePopover,
  PopoverItem,
  ConfirmActions,
} from "../components/FeatureModal";
import { WorkspaceModal } from "../components/WorkspaceModal";
import { GlassToast, useGlassToast } from "../components/GlassToast";
import { Button } from "../components/Button";
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

interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  city: string;
  createdAt: string;
  updatedAt: string;
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

/** 输入框下方的建议提示词 */
const SUGGESTION_PROMPTS = [
  "武康路晚餐规划",
  "亲子半日游",
  "雨天室内备选",
  "朋友聚会路线",
  "演唱会后夜宵",
  "西湖一日慢游",
  "带爸妈吃饭",
];

/** 城市-区 数据（常用城市） */
const CITY_DISTRICTS: Record<string, string[]> = {
  "上海市": ["黄浦区","徐汇区","长宁区","静安区","普陀区","虹口区","杨浦区","浦东新区","闵行区","宝山区","嘉定区","松江区","青浦区","奉贤区","金山区","崇明区"],
  "北京市": ["东城区","西城区","朝阳区","丰台区","石景山区","海淀区","门头沟区","房山区","通州区","顺义区","昌平区","大兴区"],
  "杭州市": ["上城区","拱墅区","西湖区","滨江区","萧山区","余杭区","临平区","富阳区","临安区"],
  "南京市": ["玄武区","秦淮区","建邺区","鼓楼区","栖霞区","雨花台区","江宁区","浦口区","六合区"],
  "成都市": ["锦江区","青羊区","金牛区","武侯区","成华区","龙泉驿区","青白江区","新都区","温江区","双流区"],
  "广州市": ["越秀区","海珠区","荔湾区","天河区","白云区","黄埔区","番禺区","花都区","南沙区"],
  "深圳市": ["罗湖区","福田区","南山区","宝安区","龙岗区","龙华区","坪山区","光明区"],
  "武汉市": ["江岸区","江汉区","硚口区","汉阳区","武昌区","青山区","洪山区","东西湖区","蔡甸区","江夏区"],
  "西安市": ["新城区","碑林区","莲湖区","灞桥区","未央区","雁塔区","阎良区","临潼区","长安区"],
  "重庆市": ["渝中区","大渡口区","江北区","沙坪坝区","九龙坡区","南岸区","北碚区","渝北区","巴南区"],
  "苏州市": ["姑苏区","虎丘区","吴中区","相城区","吴江区","工业园区"],
  "天津市": ["和平区","河东区","河西区","南开区","河北区","红桥区","东丽区","西青区","津南区","北辰区","滨海新区"],
  "长沙市": ["芙蓉区","天心区","岳麓区","开福区","雨花区","望城区"],
  "郑州市": ["中原区","二七区","管城回族区","金水区","上街区","惠济区"],
  "青岛市": ["市南区","市北区","黄岛区","崂山区","李沧区","城阳区"],
  "厦门市": ["思明区","海沧区","湖里区","集美区","同安区","翔安区"],
  "昆明市": ["五华区","盘龙区","官渡区","西山区","东川区","呈贡区"],
  "合肥市": ["瑶海区","庐阳区","蜀山区","包河区"],
  "福州市": ["鼓楼区","台江区","仓山区","马尾区","晋安区","长乐区"],
  "无锡市": ["锡山区","惠山区","滨湖区","梁溪区","新吴区","江阴市","宜兴市"],
};
const CITY_LIST = Object.keys(CITY_DISTRICTS);

/** 格式化相对时间 */
function formatRelativeTime(isoStr: string): string {
  const now = Date.now();
  const then = new Date(isoStr).getTime();
  const diffMin = Math.floor((now - then) / 60000);
  if (diffMin < 1) return "刚刚";
  if (diffMin < 60) return `${diffMin}分钟前`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}小时前`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}天前`;
  return new Date(isoStr).toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}

/* ═══════════════════════════════════════════════
   Sub-components
   ═══════════════════════════════════════════════ */

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
  city,
  open,
  onClose,
  onNewChat,
  onNavItemClick,
  chatSessions,
  onSessionClick,
  searchQuery,
  onSearchChange,
  modelMode,
  onModelModeChange,
  onReturnHome,
  onNavigate,
}: {
  user?: SessionUser | null;
  city: string;
  open: boolean;
  onClose: () => void;
  onNewChat: () => void;
  onNavItemClick: (id: string) => void;
  chatSessions: ChatSession[];
  onSessionClick: (sessionId: string) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  modelMode: ModelMode;
  onModelModeChange: (mode: ModelMode) => void;
  onReturnHome?: () => void;
  onNavigate?: (key: NavKey) => void;
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

  const filteredSessions = searchQuery
    ? chatSessions.filter((s) => s.title.toLowerCase().includes(searchQuery.toLowerCase()))
    : chatSessions;

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

        {/* Recent sessions */}
        <div className={styles.sidebarNavLabel}>最近规划</div>
        <div className={styles.sidebarRecent}>
          {filteredSessions.length > 0 ? (
            filteredSessions.map((session) => (
              <button key={session.id} className={styles.sidebarRecentItem} onClick={() => onSessionClick(session.id)}>
                <span className={styles.recentDot} />
                <span className={styles.recentItemContent}>
                  <span className={styles.recentItemTitle}>{session.title}</span>
                  <span className={styles.recentItemTime}>{formatRelativeTime(session.updatedAt)}</span>
                </span>
              </button>
            ))
          ) : (
            <div className={styles.sidebarEmpty}>{searchQuery ? "没有找到匹配记录" : "还没有对话记录"}</div>
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
      <WorkspaceModal
        open={showSettings}
        onClose={() => { setShowSettings(false); setShowClearConfirm(false); }}
        title="设置"
        subtitle="管理你的规划偏好"
      >
        <div className={styles.settingsList}>
          <button className={styles.settingsItem} onClick={() => {
            const next = modelMode === "Flash" ? "Pro" : "Flash";
            onModelModeChange(next);
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

          <button className={styles.settingsItem} onClick={() => { onNavigate?.("profile"); onClose(); }}>
            <span className={styles.settingsItemIcon}>📍</span>
            <span className={styles.settingsItemContent}>
              <span className={styles.settingsItemLabel}>位置偏好</span>
              <span className={styles.settingsItemDesc}>用于推荐附近目的地</span>
            </span>
            <span className={styles.settingsItemValue}>{city}</span>
          </button>

          <button className={styles.settingsItem} onClick={() => setShowClearConfirm(true)}>
            <span className={styles.settingsItemIcon}>🗑️</span>
            <span className={styles.settingsItemContent}>
              <span className={styles.settingsItemLabel}>清空本地记录</span>
              <span className={styles.settingsItemDesc}>删除草稿和收藏数据</span>
            </span>
          </button>
        </div>
      </WorkspaceModal>

      {/* Clear Confirm Modal */}
      <WorkspaceModal
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
            setShowClearConfirm(false);
            setShowSettings(false);
          }}
        />
      </WorkspaceModal>
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
  onCityChange?: (city: string) => void;
  onOpenModal?: (key: ModalKey) => void;
  modelMode: ModelMode;
  onModelModeChange: (mode: ModelMode) => void;
  onToast?: (text: string, type?: "success" | "error" | "info") => void;
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
  onCityChange,
  onOpenModal,
  modelMode,
  onModelModeChange,
  onToast,
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
  const [cityOpen, setCityOpen] = useState(false);
  const [cityStep, setCityStep] = useState<"city" | "district">("city");
  const [selectedCityName, setSelectedCityName] = useState<string>("");

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
          return next.slice(0, 9);
        }
        return next;
      });

      e.target.value = "";
    },
    [],
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
    onToast?.(`已切换到 ${mode} 模式`, "info");
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
          <button
            className={styles.composerMetaCity}
            onClick={() => { setCityOpen(true); setCityStep("city"); setSelectedCityName(""); }}
            title="选择城市和地区"
          >
            📍 {city}
          </button>
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
          <span className={styles.composerMetaItem}></span>

          {/* City Selector Modal */}
          <WorkspaceModal
            open={cityOpen}
            onClose={() => setCityOpen(false)}
            title={cityStep === "city" ? "选择城市" : `选择区域 — ${selectedCityName}`}
            subtitle="用于规划路线、天气和附近地点"
            width="sm"
          >
            {cityStep === "city" ? (
              <div className={styles.cityGrid}>
                {CITY_LIST.map((c) => (
                  <button
                    key={c}
                    className={styles.cityGridItem}
                    onClick={() => {
                      setSelectedCityName(c);
                      const districts = CITY_DISTRICTS[c];
                      if (districts && districts.length > 0) {
                        setCityStep("district");
                      } else {
                        onCityChange?.(c);
                        setCityOpen(false);
                      }
                    }}
                  >
                    {c.replace("市", "")}
                  </button>
                ))}
              </div>
            ) : (
              <div className={styles.cityGrid}>
                <button
                  className={`${styles.cityGridItem} ${styles.cityGridItemBack}`}
                  onClick={() => setCityStep("city")}
                >
                  ← 返回选择城市
                </button>
                <button
                  className={styles.cityGridItem}
                  onClick={() => {
                    onCityChange?.(selectedCityName);
                    setCityOpen(false);
                  }}
                >
                  {selectedCityName.replace("市", "")}（全市）
                </button>
                {CITY_DISTRICTS[selectedCityName]?.map((d) => (
                  <button
                    key={d}
                    className={styles.cityGridItem}
                    onClick={() => {
                      onCityChange?.(`${selectedCityName.replace("市", "")} ${d}`);
                      setCityOpen(false);
                    }}
                  >
                    {d}
                  </button>
                ))}
              </div>
            )}
          </WorkspaceModal>
        </div>
      )}

      {/* Voice Modal */}
      <WorkspaceModal
        open={!!voicePanelData}
        onClose={() => {
          if (isRecording && recognitionRef.current) recognitionRef.current.stop();
          setVoiceState("idle");
        }}
        title={voicePanelData?.title ?? "语音输入"}
        width="sm"
      >
        <div className={styles.voiceBody}>
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

          {voicePanelData && (
            <>
              <div className={styles.voiceDesc}>{voicePanelData.desc}</div>

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
            </>
          )}
        </div>
      </WorkspaceModal>

      {/* Companion Selection Modal */}
      <WorkspaceModal
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
      </WorkspaceModal>
    </div>
  );
}

/* ── Plan Card ── */
function PlanCardView({
  plan,
  selected,
  onSelect,
  planActions,
  onExecuteAction,
  busyActionId,
}: {
  plan: PlanningOption;
  selected: boolean;
  onSelect: (id: string) => void;
  planActions?: PlanningExecutableAction[];
  onExecuteAction?: (action: PlanningExecutableAction) => void;
  busyActionId?: string | null;
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

      {/* Compact action chips */}
      {planActions && planActions.length > 0 && (
        <div className={styles.actionDock}>
          {planActions.map((action) => (
            <button
              key={action.id}
              className={styles.actionChipBtn}
              disabled={action.status !== "waiting_confirm" || busyActionId === action.id}
              onClick={() => onExecuteAction?.(action)}
            >
              <span className={styles.actionChipIcon}>{
                action.type === "book_hotel" ? "🏨" :
                action.type === "book_restaurant" ? "🍽️" :
                action.type === "book_transport" ? "🚆" :
                action.type === "buy_ticket" ? "🎫" :
                action.type === "reserve_activity" ? "🎯" :
                action.type === "add_to_calendar" ? "📅" :
                action.type === "set_reminder" ? "⏰" : "✅"
              }</span>
              <span className={styles.actionChipBody}>
                <span className={styles.actionChipTitle}>{action.title}</span>
                {action.description && <span className={styles.actionChipDesc}>{action.description}</span>}
              </span>
              {action.priceEstimate && (
                <span className={styles.actionChipPrice}>{action.priceEstimate}</span>
              )}
              {busyActionId === action.id && (
                <span className={styles.actionChipStatus} style={{ color: "#E6A817" }}>…</span>
              )}
            </button>
          ))}
        </div>
      )}
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
      <WorkspaceModal
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
      </WorkspaceModal>
    </>
  );
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

export default function FeaturesPage({ user, onOpenModal, onNavigate, onRequestLocation, location }: FeaturesPageProps) {
  const [mode, setMode] = useState<"idle" | "chat">("idle");
  const [inputValue, setInputValue] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [phase, setPhase] = useState<ChatPhase>("idle");
  const [isBusy, setIsBusy] = useState(false);
  const [healthOk, setHealthOk] = useState<boolean | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [modelMode, setModelMode] = useState<ModelMode>("Flash");
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [showDraftNotice, setShowDraftNotice] = useState(false);
  const [showModeNotice, setShowModeNotice] = useState(false);
  const [modeNoticeMessage, setModeNoticeMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [drafts, setDrafts] = useState<string[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const conversationIdRef = useRef<string | null>(null);
  const [backendSessions, setBackendSessions] = useState<ConversationItem[]>([]);
  const [busyActionId, setBusyActionId] = useState<string | null>(null);
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [typedText, setTypedText] = useState("");
  const [isTyping, setIsTyping] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const composerDockRef = useRef<HTMLDivElement>(null);
  const typingTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const city = selectedCity || location?.city || user?.city || "选择城市";

  const { toast: glassToast, show: showToast, dismiss: dismissToast } = useGlassToast();

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
    // Load sessions from localStorage as fallback
    const savedSessions = localStorage.getItem("pg_chat_sessions");
    if (savedSessions) {
      try {
        setChatSessions(JSON.parse(savedSessions));
      } catch {}
    }

    // Load conversations from backend
    listConversations({ limit: 30 })
      .then((convs) => {
        if (convs.length > 0) setBackendSessions(convs);
      })
      .catch(() => {});
  }, []);

  // Save modelMode to localStorage when changed
  useEffect(() => {
    localStorage.setItem("pg_model_mode", modelMode);
  }, [modelMode]);

  // Save chat sessions to localStorage when changed
  useEffect(() => {
    if (chatSessions.length > 0) {
      localStorage.setItem("pg_chat_sessions", JSON.stringify(chatSessions));
    }
  }, [chatSessions]);

  // Auto-sync messages → current session
  useEffect(() => {
    if (!currentSessionId || messages.length === 0) return;
    setChatSessions((prev) =>
      prev.map((s) =>
        s.id === currentSessionId
          ? { ...s, messages, updatedAt: new Date().toISOString() }
          : s,
      ),
    );
  }, [messages, currentSessionId]);

  /* ── Scroll to bottom helper (use scrollTop to avoid ancestor scroll) ── */
  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      const el = messagesContainerRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }, []);

  /* ── Health check on mount ── */
  useEffect(() => {
    checkHealth()
      .then((r) => setHealthOk(r.ok))
      .catch(() => setHealthOk(false));
  }, []);

  /* ── Sync conversationId ref ── */
  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);

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

      // Create new session if needed
      if (!currentSessionId) {
        const sid = uuid();
        const newSession: ChatSession = {
          id: sid,
          title: prompt.length > 20 ? prompt.slice(0, 20) + "…" : prompt,
          messages: [],
          city,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        setCurrentSessionId(sid);
        setChatSessions((prev) => [newSession, ...prev]);
      }

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

      // Track event
      apiTrackEvent({ eventName: "send_planning_prompt", payload: { prompt, city, modelMode }, page: "features" }).catch(() => {});

      // 3) Call API
      try {
        setPhase("planning");
        const result = await requestPlanning({
          prompt,
          city,
          companions: "family",
          modelMode: toApiModelMode(modelMode),
          conversationId: conversationIdRef.current ?? undefined,
        });

        // Store conversationId from backend
        if (result.conversationId) {
          setConversationId(result.conversationId);
          conversationIdRef.current = result.conversationId;
        }

        // Refresh backend sessions list
        listConversations({ limit: 30 }).then(setBackendSessions).catch(() => {});

        apiTrackEvent({ eventName: "planning_success", payload: { conversationId: result.conversationId, planId: result.planId }, page: "features" }).catch(() => {});

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
        apiTrackEvent({ eventName: "planning_failed", payload: { error: errorMsg }, page: "features" }).catch(() => {});
        reportClientError({ message: errorMsg, route: "/api/agent/plan" }).catch(() => {});
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
      // Plan card auto-expands with action chips — no extra message needed
      apiTrackEvent({ eventName: "select_plan", payload: { planId, conversationId }, page: "features" }).catch(() => {});
    },
    [conversationId],
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
    setCurrentSessionId(null);
    setConversationId(null);
    conversationIdRef.current = null;
    setSidebarOpen(false);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, []);

  const handleSessionClick = useCallback(async (sessionId: string) => {
    // Try to load from backend first
    try {
      const detail = await getConversation(sessionId);
      if (detail && detail.messages.length > 0) {
        const loadedMessages: ChatMessage[] = detail.messages.map((m) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          content: m.content,
          createdAt: m.createdAt,
        }));
        setCurrentSessionId(sessionId);
        setConversationId(sessionId);
        conversationIdRef.current = sessionId;
        setMessages(loadedMessages);
        setMode("chat");
        setPhase("result");
        setSelectedPlanId(null);
        setSidebarOpen(false);
        setInputValue("");
        return;
      }
    } catch {
      // fall through to localStorage
    }

    // Fallback: localStorage sessions
    const session = chatSessions.find((s) => s.id === sessionId);
    if (!session) return;
    setCurrentSessionId(sessionId);
    setMessages(session.messages);
    setMode("chat");
    const lastAssistant = [...session.messages].reverse().find((m) => m.role === "assistant");
    if (lastAssistant && "status" in lastAssistant && lastAssistant.status === "success") {
      setPhase("result");
    } else {
      setPhase("idle");
    }
    setSelectedPlanId(null);
    setSidebarOpen(false);
    setInputValue("");
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, [chatSessions]);

  /* ── Return to home ── */
  const handleReturnHome = useCallback(() => {
    // Auto-save current conversation before navigating home
    if (inputValue.trim() || messages.length > 0) {
      // If there's unsaved input, add it as a user message
      if (inputValue.trim()) {
        const userMsg: ChatMessage = {
          id: uuid(),
          role: "user",
          content: inputValue.trim(),
          createdAt: new Date().toISOString(),
        };
        addMessage(userMsg);
        setInputValue("");
      }

      // Ensure current session is updated with latest messages
      if (currentSessionId) {
        setChatSessions((prev) =>
          prev.map((s) =>
            s.id === currentSessionId
              ? { ...s, messages, updatedAt: new Date().toISOString() }
              : s
          )
        );
      } else if (messages.length > 0) {
        // Create a new session if one doesn't exist
        const sid = uuid();
        const newSession: ChatSession = {
          id: sid,
          title: messages[0].content.length > 20 ? messages[0].content.slice(0, 20) + "…" : messages[0].content,
          messages,
          city,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        setCurrentSessionId(sid);
        setChatSessions((prev) => [newSession, ...prev]);
      }
    }
    // Navigate home immediately
    onNavigate?.("home");
  }, [inputValue, messages, currentSessionId, city, onNavigate]);

  const handleConfirmReturnHome = useCallback(() => {
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
          showToast("还没有收藏方案", "info");
        } else {
          onNavigate?.("profile");
        }
        break;
    }
  }, [handleNewChat, drafts, favorites, onNavigate, showToast]);

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
          setMessages((prev) =>
            prev.map((msg) => {
              if (!msg.actions) return msg;
              return {
                ...msg,
                actions: msg.actions.map((a) =>
                  a.id === action.id ? { ...a, status: result.status || "done" } : a
                ),
              };
            })
          );
        } catch (err) {
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
    [city, addMemory, showToast],
  );

  const handleNextAction = useCallback(
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
            navigator.share({ title: "周末有谱", text }).catch(() => {});
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
          const dest = plan?.title ?? city;
          window.open(`https://uri.amap.com/search?keyword=${encodeURIComponent(dest)}&city=${encodeURIComponent(city)}`, "_blank");
          break;
        }
        default:
          break;
      }
    },
    [selectedPlanId, messages, city, showToast],
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
                          planActions={planActions}
                          onExecuteAction={handleExecuteAction}
                          busyActionId={busyActionId}
                        />
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      );
    },
    [selectedPlanId, handleRetryLast, handleNewChat, handleSelectPlan, handleExecuteAction, busyActionId],
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
        city={city}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onNewChat={handleNewChat}
        onNavItemClick={handleNavItemClick}
        chatSessions={chatSessions}
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
            <div className={styles.featureMessages} ref={messagesContainerRef}>
              <div className={styles.featureMessagesInner}>
                {messages.map((msg) => (
                  <div key={msg.id}>{renderMessageContent(msg)}</div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            </div>

            <div className={styles.featureComposerDock} ref={composerDockRef}>
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

      {/* 模式切换提示弹窗 */}
      <WorkspaceModal
        open={showModeNotice}
        onClose={() => setShowModeNotice(false)}
        title="模式切换"
        width="sm"
      >
        <p className={styles.confirmText}>
          {modeNoticeMessage}
        </p>
        <Button size="small" onClick={() => setShowModeNotice(false)}>
          知道了
        </Button>
      </WorkspaceModal>

      <GlassToast toast={glassToast} onDismiss={dismissToast} />
    </section>
  );
}
