import { useCallback, useEffect, useMemo, useState } from "react";
import {
  User,
  Brain,
  Users,
  Clock,
  Bell,
  Shield,
  Code2,
  Settings,
  LogOut,
  Trash2,
  Star,
  Heart,
  Check,
  X,
  Plus,
  Eye,
  EyeOff,
  Copy,
  RotateCw,
  Info,
  Menu,
  Sparkles,
  MapPin,
  Utensils,
  Activity,
  Calendar,
  Globe,
  Smartphone,
} from "lucide-react";
import { Button } from "../components/Button";
import { RevealGroup } from "../components/RevealGroup";
import { GlassToast, useGlassToast } from "../components/GlassToast";
import {
  getProfileBundle,
  getMemories,
  addMemory,
  deleteMemory,
  getCompanions,
  addCompanion,
  deleteCompanion,
  getPlanHistory,
  ratePlan,
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  getNotificationPreferences,
  updateNotificationPreferences,
  getPermissions,
  updatePermissions,
  updatePersona,
  getSessions,
  revokeSession,
  getDeveloperDashboard,
  createNewApiKey,
  revokeApiKey,
  deleteWebhook,
  replayWebhook,
  getToolLogs,
  changePassword,
  clearMemory,
  exportPrivacy,
  deleteAccount,
  updateAccount,
} from "../lib/api";
import { toArray } from "../lib/toArray";
import type {
  ModalKey,
  SessionUser,
  ProfileBundle,
  MemoryInsight,
  AiInsight,
  CompanionProfile,
  PlanHistoryItem,
  NotificationItem,
  NotificationPreferences,
  PermissionSettings,
  SessionInfo,
  ApiKeyInfo,
  WebhookInfo,
  ToolLogItem,
  ProfileStats,
} from "../types";
import styles from "./ProfilePage.module.scss";

// ── Tab definitions ──

type TabKey = "persona" | "memory" | "companion" | "history" | "notifications" | "privacy" | "developer" | "account";

interface TabDef {
  key: TabKey;
  label: string;
  icon: typeof User;
  guestHidden?: boolean;
}

const TABS: TabDef[] = [
  { key: "persona", label: "人物画像", icon: Brain },
  { key: "memory", label: "记忆与洞察", icon: Sparkles },
  { key: "companion", label: "同行人", icon: Users },
  { key: "history", label: "历史与评分", icon: Clock },
  { key: "notifications", label: "通知中心", icon: Bell },
  { key: "privacy", label: "隐私与安全", icon: Shield },
  { key: "developer", label: "开发者模式", icon: Code2, guestHidden: true },
  { key: "account", label: "账号管理", icon: Settings },
];

// ── Category labels ──

const CATEGORY_LABELS: Record<string, string> = {
  family: "家庭",
  food: "饮食",
  route: "路线",
  collaboration: "协作",
};

const DIET_OPTIONS = ["清淡", "微辣", "重辣", "素食", "海鲜", "烧烤", "火锅"];
const ACTIVITY_OPTIONS = ["户外运动", "文艺展览", "亲子活动", "美食探店", "剧本杀", "桌游", "K歌", "密室逃脱"];
const PACE_OPTIONS = ["慢节奏", "适中", "快节奏"];
const RISK_OPTIONS = ["稳妥优先", "平衡", "探索型"];

// ── Props ──

interface ProfilePageProps {
  user: SessionUser;
  onOpenModal: (key: ModalKey) => void;
  onLogout: () => void;
}

// ── Component ──

export function ProfilePage({ user, onOpenModal, onLogout }: ProfilePageProps) {
  const isGuest = user.mode === "guest";
  const [tab, setTab] = useState<TabKey>("persona");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  // ── Data state ──
  const [bundle, setBundle] = useState<ProfileBundle | null>(null);
  const [stats, setStats] = useState<ProfileStats>({
    planCount: 0,
    memoryCount: 0,
    favoriteCount: 0,
    unreadNotifications: 0,
    personaCompleteness: 0,
  });
  const [memories, setMemories] = useState<MemoryInsight[]>([]);
  const [insights, setInsights] = useState<AiInsight[]>([]);
  const [companions, setCompanions] = useState<CompanionProfile[]>([]);
  const [history, setHistory] = useState<PlanHistoryItem[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notifPrefs, setNotifPrefs] = useState<NotificationPreferences | null>(null);
  const [permissions, setPermissions] = useState<PermissionSettings | null>(null);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [devMetrics, setDevMetrics] = useState<Array<{ label: string; value: string }>>([]);
  const [apiKeys, setApiKeys] = useState<ApiKeyInfo[]>([]);
  const [webhooks, setWebhooks] = useState<WebhookInfo[]>([]);
  const [toolLogs, setToolLogs] = useState<ToolLogItem[]>([]);
  const [newKeyReveal, setNewKeyReveal] = useState<string | null>(null);

  // ── Form state ──
  const [personaForm, setPersonaForm] = useState({
    displayName: "",
    city: "",
    startPoint: "",
    transportMode: "driving",
    distanceLimitKm: 30,
    pace: "适中",
    budgetMin: 100,
    budgetMax: 500,
    dietPreference: [] as string[],
    avoidFoods: [] as string[],
    activityTags: [] as string[],
    avoidActivityTags: [] as string[],
    riskPreference: "平衡",
  });

  const [showAddMemory, setShowAddMemory] = useState(false);
  const [memoryForm, setMemoryForm] = useState({ category: "family", title: "", detail: "", weight: 0.5 });

  const [showAddCompanion, setShowAddCompanion] = useState(false);
  const [companionForm, setCompanionForm] = useState({
    name: "",
    type: "adult",
    relation: "",
    ageGroup: "adult",
    preferences: [] as string[],
    avoid: [] as string[],
    mobility: "normal",
    diet: "",
    notes: "",
  });

  const [passwordForm, setPasswordForm] = useState({ current: "", next: "", confirm: "" });
  const [showPasswords, setShowPasswords] = useState(false);

  const { toast, show, dismiss } = useGlassToast();
  const [confirmDialog, setConfirmDialog] = useState<{ title: string; desc: string; onConfirm: () => void } | null>(null);

  // ── Data fetching ──

  const fetchBundle = useCallback(async () => {
    try {
      const data = await getProfileBundle();
      setBundle(data);
      setStats(data.stats);
      setPersonaForm((prev) => ({
        ...prev,
        displayName: data.user.displayName || user.name,
        city: data.profile.city || user.city,
        startPoint: data.profile.startPoint,
        transportMode: data.profile.transportMode,
        distanceLimitKm: data.profile.distanceLimitKm,
        pace: data.profile.pace,
        budgetMin: data.profile.budgetMin,
        budgetMax: data.profile.budgetMax,
        dietPreference: data.profile.dietPreference || [],
        avoidFoods: data.profile.avoidFoods || [],
        activityTags: data.profile.activityTags || [],
        avoidActivityTags: data.profile.avoidActivityTags || [],
        riskPreference: data.profile.riskPreference,
      }));
    } catch {
      // guest mode or network error — use defaults
    }
  }, [user.name, user.city]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    await fetchBundle();
    try {
      const [memData, compData, histData, notifData, prefData, permData, sessData] = await Promise.allSettled([
        getMemories(),
        isGuest ? Promise.resolve([]) : getCompanions(),
        getPlanHistory(),
        getNotifications(),
        getNotificationPreferences(),
        getPermissions(),
        isGuest ? Promise.resolve([]) : getSessions(),
      ]);

      if (memData.status === "fulfilled") {
        setMemories(toArray<MemoryInsight>(memData.value, "items", "memories"));
      }
      if (compData.status === "fulfilled") {
        setCompanions(toArray<CompanionProfile>(compData.value, "items", "companions"));
      }
      if (histData.status === "fulfilled") {
        setHistory(toArray<PlanHistoryItem>(histData.value, "items", "history"));
      }
      if (notifData.status === "fulfilled") {
        setNotifications(toArray<NotificationItem>(notifData.value, "items", "notifications"));
      }
      if (prefData.status === "fulfilled") setNotifPrefs(prefData.value as NotificationPreferences);
      if (permData.status === "fulfilled") {
        setPermissions(permData.value as PermissionSettings);
      } else {
        // API 失败时从 localStorage 恢复
        try {
          const local = JSON.parse(localStorage.getItem("pg_permissions") || "{}");
          if (Object.keys(local).length > 0) {
            setPermissions({
              locationEnabled: local.locationEnabled ?? false,
              memoryEnabled: local.memoryEnabled ?? false,
              calendarEnabled: local.calendarEnabled ?? false,
              shareEnabled: local.shareEnabled ?? false,
              developerEnabled: local.developerEnabled ?? false,
            });
          }
        } catch {}
      }
      if (sessData.status === "fulfilled") {
        setSessions(toArray<SessionInfo>(sessData.value, "sessions"));
      }
    } catch {
      // partial failure is ok
    }
    setLoading(false);
  }, [fetchBundle, isGuest]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // ── Dev data (lazy load on tab switch) ──

  const fetchDevData = useCallback(async () => {
    try {
      const [dashData, logsData] = await Promise.allSettled([getDeveloperDashboard(), getToolLogs()]);
      if (dashData.status === "fulfilled") {
        const d = dashData.value;
        setDevMetrics(d.metrics);
        setApiKeys(toArray<ApiKeyInfo>(d.apiKeys, "items"));
        setWebhooks(toArray<WebhookInfo>(d.webhooks, "items"));
      }
      if (logsData.status === "fulfilled") {
        setToolLogs(toArray<ToolLogItem>(logsData.value, "items"));
      }
    } catch {
      // ok
    }
  }, []);

  useEffect(() => {
    if (tab === "developer" && !isGuest) fetchDevData();
  }, [tab, isGuest, fetchDevData]);

  // ── Handlers ──

  const handleSavePersona = async () => {
    try {
      await Promise.all([
        updateAccount({
          displayName: personaForm.displayName,
          city: personaForm.city,
          startPoint: personaForm.startPoint,
        }),
        updatePersona({
          city: personaForm.city,
          startPoint: personaForm.startPoint,
          transportMode: personaForm.transportMode,
          distanceLimitKm: personaForm.distanceLimitKm,
          pace: personaForm.pace,
          riskPreference: personaForm.riskPreference,
          budgetMin: personaForm.budgetMin,
          budgetMax: personaForm.budgetMax,
          dietPreference: personaForm.dietPreference,
          avoidFoods: personaForm.avoidFoods,
          activityTags: personaForm.activityTags,
          avoidActivityTags: personaForm.avoidActivityTags,
        }),
      ]);
      show("已保存");
      fetchBundle();
    } catch {
      show("保存失败");
    }
  };

  const handleAddMemory = async () => {
    try {
      await addMemory(memoryForm);
      setShowAddMemory(false);
      setMemoryForm({ category: "family", title: "", detail: "", weight: 0.5 });
      const val = await getMemories();
      setMemories(toArray<MemoryInsight>(val, "items"));
      show("记忆已添加");
    } catch {
      show("添加失败");
    }
  };

  const handleDeleteMemory = (id: string) => {
    setConfirmDialog({
      title: "删除记忆",
      desc: "删除后不可恢复，确定要删除这条记忆吗？",
      onConfirm: async () => {
        try {
          await deleteMemory(id);
          setMemories((prev) => prev.filter((m) => m.id !== id));
          show("已删除");
        } catch {
          show("删除失败");
        }
        setConfirmDialog(null);
      },
    });
  };

  const handleAddCompanion = async () => {
    try {
      await addCompanion({ ...companionForm, isDefault: false });
      setShowAddCompanion(false);
      setCompanionForm({ name: "", type: "adult", relation: "", ageGroup: "adult", preferences: [], avoid: [], mobility: "normal", diet: "", notes: "" });
      const val = await getCompanions();
      setCompanions(toArray<CompanionProfile>(val, "items"));
      show("同行人已添加");
    } catch {
      show("添加失败");
    }
  };

  const handleDeleteCompanion = (id: string) => {
    setConfirmDialog({
      title: "删除同行人",
      desc: "确定要删除这位同行人吗？",
      onConfirm: async () => {
        try {
          await deleteCompanion(id);
          setCompanions((prev) => prev.filter((c) => c.id !== id));
          show("已删除");
        } catch {
          show("删除失败");
        }
        setConfirmDialog(null);
      },
    });
  };

  const handleRate = async (planId: string, rating: number) => {
    try {
      await ratePlan(planId, rating);
      setHistory((prev) => prev.map((h) => (h.id === planId ? { ...h, rating } : h)));
    } catch {
      // silent
    }
  };

  const handleToggleFav = async (planId: string) => {
    try {
      const item = history.find((h) => h.id === planId);
      if (!item) return;
      await ratePlan(planId, item.rating ?? 0, !item.favorite);
      setHistory((prev) => prev.map((h) => (h.id === planId ? { ...h, favorite: !h.favorite } : h)));
    } catch {
      // silent
    }
  };

  const handleMarkRead = async (id: string) => {
    try {
      await markNotificationRead(id);
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    } catch {
      // silent
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch {
      // silent
    }
  };

  const handleDeleteNotif = async (id: string) => {
    try {
      await deleteNotification(id);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    } catch {
      // silent
    }
  };

  const handleTogglePerm = async (key: keyof PermissionSettings) => {
    if (!permissions) return;
    const prev = permissions[key];
    const next = !prev;
    // 乐观更新：先翻转 UI
    setPermissions({ ...permissions, [key]: next });
    try {
      await updatePermissions({ [key]: next });
      show("设置已保存");
    } catch {
      // API 失败时回滚并保存到 localStorage
      setPermissions((p) => (p ? { ...p, [key]: prev } : p));
      try {
        const local = JSON.parse(localStorage.getItem("pg_permissions") || "{}");
        local[key] = next;
        localStorage.setItem("pg_permissions", JSON.stringify(local));
        // 恢复乐观更新
        setPermissions((p) => (p ? { ...p, [key]: next } : p));
        show("已保存到本地");
      } catch {
        show("设置失败，请重试");
      }
    }
  };

  const handleRevokeSession = (id: string) => {
    setConfirmDialog({
      title: "撤销会话",
      desc: "撤销后该设备需要重新登录。",
      onConfirm: async () => {
        try {
          await revokeSession(id);
          setSessions((prev) => prev.filter((s) => s.id !== id));
        } catch {
          // silent
        }
        setConfirmDialog(null);
      },
    });
  };

  const handleCreateApiKey = async () => {
    try {
      const res = await createNewApiKey("New Key");
      // 服务端在创建时额外返回 key 字段（明文，仅此一次）
      const rawKey = (res as unknown as Record<string, unknown>).key;
      if (typeof rawKey === "string") setNewKeyReveal(rawKey);
      fetchDevData();
    } catch {
      show("创建失败");
    }
  };

  const handleRevokeApiKey = (id: string) => {
    setConfirmDialog({
      title: "撤销 API Key",
      desc: "撤销后不可恢复，使用该 Key 的调用将立即失败。",
      onConfirm: async () => {
        try {
          await revokeApiKey(id);
          setApiKeys((prev) => prev.map((k) => (k.id === id ? { ...k, status: "revoked" } : k)));
        } catch {
          // silent
        }
        setConfirmDialog(null);
      },
    });
  };

  const handleDeleteWebhook = (id: string) => {
    setConfirmDialog({
      title: "删除 Webhook",
      desc: "确定要删除这个 Webhook 吗？",
      onConfirm: async () => {
        try {
          await deleteWebhook(id);
          setWebhooks((prev) => prev.filter((w) => w.id !== id));
        } catch {
          // silent
        }
        setConfirmDialog(null);
      },
    });
  };

  const handleChangePassword = async () => {
    if (passwordForm.next !== passwordForm.confirm) {
      show("两次密码不一致");
      return;
    }
    try {
      await changePassword({ currentPassword: passwordForm.current, newPassword: passwordForm.next });
      setPasswordForm({ current: "", next: "", confirm: "" });
      show("密码已修改");
    } catch {
      show("修改失败");
    }
  };

  const handleClearMemory = () => {
    setConfirmDialog({
      title: "清除所有记忆",
      desc: "这将清除所有 AI 记忆数据，不可恢复。",
      onConfirm: async () => {
        try {
          await clearMemory();
          setMemories([]);
          show("记忆已清除");
        } catch {
          show("清除失败");
        }
        setConfirmDialog(null);
      },
    });
  };

  const handleExportData = async () => {
    try {
      await exportPrivacy();
      show("导出已触发，稍后查看");
    } catch {
      show("导出失败");
    }
  };

  const handleDeleteAccount = () => {
    setConfirmDialog({
      title: "注销账号",
      desc: "此操作不可逆！所有数据将被永久删除。",
      onConfirm: async () => {
        try {
          await deleteAccount();
          onLogout();
        } catch {
          show("注销失败");
        }
        setConfirmDialog(null);
      },
    });
  };

  const handleCopyKey = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => { });
    show("已复制");
  };

  // ── Computed ──

  const visibleTabs = useMemo(() => TABS.filter((t) => !t.guestHidden || !isGuest), [isGuest]);
  const initials = (user.name || "U").slice(0, 1).toUpperCase();
  const unreadCount = notifications.filter((n) => !n.read).length;

  // ── Render helpers ──

  const Toggle = ({ active, onToggle }: { active: boolean; onToggle: () => void }) => (
    <button
      type="button"
      className={`${styles.toggle} ${active ? styles.toggleActive : ""}`}
      onClick={onToggle}
      aria-pressed={active}
    >
      <span className={styles.toggleKnob} />
    </button>
  );

  const StarRating = ({ value, onChange }: { value: number | null; onChange: (v: number) => void }) => (
    <div className={styles.starRating}>
      {[1, 2, 3, 4, 5].map((s) => (
        <button
          key={s}
          type="button"
          className={`${styles.starBtn} ${s <= (value ?? 0) ? styles.starFilled : ""}`}
          onClick={() => onChange(s)}
        >
          <Star size={16} />
        </button>
      ))}
    </div>
  );

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "刚刚";
    if (mins < 60) return `${mins} 分钟前`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} 小时前`;
    const days = Math.floor(hours / 24);
    return `${days} 天前`;
  };

  // ── Tab content renderers ──

  const renderPersona = () => (
    <RevealGroup>
      <div className={styles.tabHeader}>
        <h2 className={styles.tabTitle}>人物画像</h2>
        <p className={styles.tabDesc}>管理你的出行偏好，让规划更懂你</p>
      </div>

      {isGuest && (
        <div className={styles.hintBanner}>
          <Info size={16} />
          游客模式下偏好仅保存在本地，注册后可云端同步。
        </div>
      )}

      <div className={styles.glassCard}>
        <h3 className={styles.glassCardTitle}>基本信息</h3>
        <div className={styles.personaGrid}>
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>昵称</label>
            <input
              className={styles.fieldInput}
              value={personaForm.displayName}
              onChange={(e) => setPersonaForm({ ...personaForm, displayName: e.target.value })}
              placeholder="你的昵称"
            />
          </div>
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>城市</label>
            <input
              className={styles.fieldInput}
              value={personaForm.city}
              onChange={(e) => setPersonaForm({ ...personaForm, city: e.target.value })}
              placeholder="所在城市"
            />
          </div>
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>出发地</label>
            <input
              className={styles.fieldInput}
              value={personaForm.startPoint}
              onChange={(e) => setPersonaForm({ ...personaForm, startPoint: e.target.value })}
              placeholder="常用出发地"
            />
          </div>
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>出行方式</label>
            <select
              className={styles.fieldSelect}
              value={personaForm.transportMode}
              onChange={(e) => setPersonaForm({ ...personaForm, transportMode: e.target.value })}
            >
              <option value="driving">自驾</option>
              <option value="transit">公共交通</option>
              <option value="walking">步行</option>
              <option value="cycling">骑行</option>
            </select>
          </div>
        </div>

        <div className={styles.fieldGroup} style={{ marginBottom: 20 }}>
          <label className={styles.fieldLabel}>距离上限</label>
          <div className={styles.sliderRow}>
            <input
              type="range"
              className={styles.fieldSlider}
              min={5}
              max={100}
              value={personaForm.distanceLimitKm}
              onChange={(e) => setPersonaForm({ ...personaForm, distanceLimitKm: Number(e.target.value) })}
            />
            <span className={styles.sliderValue}>{personaForm.distanceLimitKm} km</span>
          </div>
        </div>

        <div className={styles.saveRow}>
          <Button onClick={handleSavePersona}>保存</Button>
        </div>
      </div>

      <div className={styles.glassCard}>
        <h3 className={styles.glassCardTitle}>节奏偏好</h3>
        <div className={styles.tagSection}>
          <p className={styles.tagSectionTitle}>节奏</p>
          <div className={styles.tagGrid}>
            {PACE_OPTIONS.map((p) => (
              <button
                key={p}
                type="button"
                className={`${styles.tagPill} ${personaForm.pace === p ? styles.tagPillActive : ""}`}
                onClick={() => setPersonaForm({ ...personaForm, pace: p })}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.riskToggle}>
          {RISK_OPTIONS.map((r) => (
            <button
              key={r}
              type="button"
              className={`${styles.riskOption} ${personaForm.riskPreference === r ? styles.riskOptionActive : ""}`}
              onClick={() => setPersonaForm({ ...personaForm, riskPreference: r })}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.glassCard}>
        <h3 className={styles.glassCardTitle}>预算范围</h3>
        <div className={styles.budgetRow}>
          <div className={styles.budgetSlider}>
            <span className={styles.budgetValue}>¥{personaForm.budgetMin}</span>
            <input
              type="range"
              className={styles.fieldSlider}
              min={0}
              max={2000}
              step={50}
              value={personaForm.budgetMin}
              onChange={(e) => setPersonaForm({ ...personaForm, budgetMin: Number(e.target.value) })}
            />
          </div>
          <span className={styles.budgetSep}>—</span>
          <div className={styles.budgetSlider}>
            <input
              type="range"
              className={styles.fieldSlider}
              min={0}
              max={5000}
              step={50}
              value={personaForm.budgetMax}
              onChange={(e) => setPersonaForm({ ...personaForm, budgetMax: Number(e.target.value) })}
            />
            <span className={styles.budgetValue}>¥{personaForm.budgetMax}</span>
          </div>
        </div>
      </div>

      <div className={styles.glassCard}>
        <h3 className={styles.glassCardTitle}>饮食偏好</h3>
        <div className={styles.tagSection}>
          <p className={styles.tagSectionTitle}>喜欢的口味</p>
          <div className={styles.tagGrid}>
            {DIET_OPTIONS.map((d) => (
              <button
                key={d}
                type="button"
                className={`${styles.tagPill} ${personaForm.dietPreference.includes(d) ? styles.tagPillActive : ""}`}
                onClick={() =>
                  setPersonaForm({
                    ...personaForm,
                    dietPreference: personaForm.dietPreference.includes(d)
                      ? personaForm.dietPreference.filter((x) => x !== d)
                      : [...personaForm.dietPreference, d],
                  })
                }
              >
                {d}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.glassCard}>
        <h3 className={styles.glassCardTitle}>活动偏好</h3>
        <div className={styles.tagSection}>
          <p className={styles.tagSectionTitle}>喜欢的活动</p>
          <div className={styles.tagGrid}>
            {ACTIVITY_OPTIONS.map((a) => (
              <button
                key={a}
                type="button"
                className={`${styles.tagPill} ${personaForm.activityTags.includes(a) ? styles.tagPillActive : ""}`}
                onClick={() =>
                  setPersonaForm({
                    ...personaForm,
                    activityTags: personaForm.activityTags.includes(a)
                      ? personaForm.activityTags.filter((x) => x !== a)
                      : [...personaForm.activityTags, a],
                  })
                }
              >
                {a}
              </button>
            ))}
          </div>
        </div>
      </div>
    </RevealGroup>
  );

  const renderMemory = () => (
    <RevealGroup>
      <div className={styles.tabHeader}>
        <h2 className={styles.tabTitle}>记忆与洞察</h2>
        <p className={styles.tabDesc}>AI 会根据你的记忆和偏好，给出个性化建议</p>
      </div>

      {insights.length > 0 && (
        <div className={styles.insightsGrid}>
          {insights.map((ins) => (
            <div key={ins.id} className={styles.insightCard}>
              <p className={styles.insightText}>{ins.text}</p>
              <span className={styles.insightConfidence}>置信度 {Math.round(ins.confidence * 100)}%</span>
            </div>
          ))}
        </div>
      )}

      <div className={styles.glassCard}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <h3 className={styles.glassCardTitle} style={{ margin: 0 }}>我的记忆</h3>
          {!isGuest && (
            <Button size="small" onClick={() => setShowAddMemory(!showAddMemory)}>
              <Plus size={14} /> 添加
            </Button>
          )}
        </div>

        {showAddMemory && (
          <div className={styles.addMemoryForm}>
            <div className={styles.addMemoryRow}>
              <select
                className={styles.fieldSelect}
                value={memoryForm.category}
                onChange={(e) => setMemoryForm({ ...memoryForm, category: e.target.value })}
              >
                <option value="family">家庭</option>
                <option value="food">饮食</option>
                <option value="route">路线</option>
                <option value="collaboration">协作</option>
              </select>
              <input
                className={styles.fieldInput}
                placeholder="标题"
                value={memoryForm.title}
                onChange={(e) => setMemoryForm({ ...memoryForm, title: e.target.value })}
              />
            </div>
            <textarea
              className={styles.fieldInput}
              style={{ height: 80, padding: "10px 14px", resize: "vertical" }}
              placeholder="详细描述..."
              value={memoryForm.detail}
              onChange={(e) => setMemoryForm({ ...memoryForm, detail: e.target.value })}
            />
            <div className={styles.weightSliderRow}>
              <span>权重</span>
              <input
                type="range"
                className={styles.fieldSlider}
                min={0}
                max={1}
                step={0.1}
                value={memoryForm.weight}
                onChange={(e) => setMemoryForm({ ...memoryForm, weight: Number(e.target.value) })}
              />
              <span className={styles.sliderValue}>{memoryForm.weight.toFixed(1)}</span>
            </div>
            <div className={styles.formActions}>
              <Button variant="ghost" onClick={() => setShowAddMemory(false)}>
                取消
              </Button>
              <Button onClick={handleAddMemory}>保存</Button>
            </div>
          </div>
        )}

        <div className={styles.memoryList}>
          {memories.length === 0 ? (
            <div className={styles.guestEmpty}>
              <Sparkles size={40} />
              <p className={styles.guestEmptyTitle}>暂无记忆</p>
              <p className={styles.guestEmptyDesc}>AI 会记住你的偏好和习惯，帮助生成更个性化的规划。</p>
            </div>
          ) : (
            memories.map((m) => (
              <div key={m.id} className={styles.memoryItem}>
                <span className={styles.memoryCategory}>{CATEGORY_LABELS[m.category] ?? m.category}</span>
                <div className={styles.memoryBody}>
                  <p className={styles.memoryTitle}>{m.title}</p>
                  <p className={styles.memoryDetail}>{m.detail}</p>
                  <div className={styles.memoryMeta}>
                    <span className={styles.memoryWeight}>⚡ {m.weight.toFixed(1)}</span>
                    <span>{m.source}</span>
                    <span>{timeAgo(m.updatedAt)}</span>
                  </div>
                </div>
                <div className={styles.memoryActions}>
                  <button
                    type="button"
                    className={styles.memoryActionBtn}
                    onClick={() => handleDeleteMemory(m.id)}
                    title="删除"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </RevealGroup>
  );

  const renderCompanion = () => (
    <RevealGroup>
      <div className={styles.tabHeader}>
        <h2 className={styles.tabTitle}>同行人</h2>
        <p className={styles.tabDesc}>管理家人、朋友的偏好，规划会自动适配</p>
      </div>

      {isGuest ? (
        <div className={styles.glassCard}>
          <div className={styles.guestEmpty}>
            <Users size={40} />
            <p className={styles.guestEmptyTitle}>注册后管理同行人</p>
            <p className={styles.guestEmptyDesc}>添加家人和朋友的信息，规划时会自动考虑每个人的需求。</p>
            <Button onClick={() => onOpenModal("register")}>注册账号</Button>
          </div>
        </div>
      ) : (
        <>
          <div className={styles.companionGrid}>
            {companions.map((c) => (
              <div key={c.id} className={styles.companionCard}>
                <div className={styles.companionHeader}>
                  <h3 className={styles.companionName}>{c.name}</h3>
                  <div className={styles.companionActions}>
                    <button type="button" className={styles.memoryActionBtn} onClick={() => handleDeleteCompanion(c.id)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <div className={styles.companionField}>
                  <User size={14} /> {c.relation || c.type} · {c.ageGroup}
                </div>
                <div className={styles.companionField}>
                  <Activity size={14} /> 行动力: {c.mobility}
                </div>
                {c.diet && (
                  <div className={styles.companionField}>
                    <Utensils size={14} /> {c.diet}
                  </div>
                )}
                {c.notes && (
                  <div className={styles.companionField}>
                    <Info size={14} /> {c.notes}
                  </div>
                )}
                {c.preferences.length > 0 && (
                  <div className={styles.companionTags}>
                    {c.preferences.map((p) => (
                      <span key={p} className={styles.companionTag}>{p}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {showAddCompanion ? (
            <div className={styles.companionForm}>
              <div className={styles.companionFormGrid}>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>姓名</label>
                  <input
                    className={styles.fieldInput}
                    value={companionForm.name}
                    onChange={(e) => setCompanionForm({ ...companionForm, name: e.target.value })}
                    placeholder="同行人姓名"
                  />
                </div>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>关系</label>
                  <input
                    className={styles.fieldInput}
                    value={companionForm.relation}
                    onChange={(e) => setCompanionForm({ ...companionForm, relation: e.target.value })}
                    placeholder="如：配偶、孩子、朋友"
                  />
                </div>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>年龄段</label>
                  <select
                    className={styles.fieldSelect}
                    value={companionForm.ageGroup}
                    onChange={(e) => setCompanionForm({ ...companionForm, ageGroup: e.target.value })}
                  >
                    <option value="toddler">幼儿</option>
                    <option value="child">儿童</option>
                    <option value="teen">青少年</option>
                    <option value="adult">成人</option>
                    <option value="senior">长者</option>
                  </select>
                </div>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>行动力</label>
                  <select
                    className={styles.fieldSelect}
                    value={companionForm.mobility}
                    onChange={(e) => setCompanionForm({ ...companionForm, mobility: e.target.value })}
                  >
                    <option value="low">低</option>
                    <option value="normal">正常</option>
                    <option value="high">高</option>
                  </select>
                </div>
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>备注</label>
                <input
                  className={styles.fieldInput}
                  value={companionForm.notes}
                  onChange={(e) => setCompanionForm({ ...companionForm, notes: e.target.value })}
                  placeholder="特殊需求或备注"
                />
              </div>
              <div className={styles.formActions}>
                <Button variant="ghost" onClick={() => setShowAddCompanion(false)}>
                  取消
                </Button>
                <Button onClick={handleAddCompanion}>添加</Button>
              </div>
            </div>
          ) : (
            <Button onClick={() => setShowAddCompanion(true)}>
              <Plus size={14} /> 添加同行人
            </Button>
          )}
        </>
      )}
    </RevealGroup>
  );

  const renderHistory = () => (
    <RevealGroup>
      <div className={styles.tabHeader}>
        <h2 className={styles.tabTitle}>历史与评分</h2>
        <p className={styles.tabDesc}>查看历史规划，给好评帮助 AI 更懂你</p>
      </div>

      <div className={styles.historyList}>
        {history.length === 0 ? (
          <div className={styles.glassCard}>
            <div className={styles.guestEmpty}>
              <Clock size={40} />
              <p className={styles.guestEmptyTitle}>暂无历史规划</p>
              <p className={styles.guestEmptyDesc}>完成一次规划后，历史记录会出现在这里。</p>
            </div>
          </div>
        ) : (
          history.map((h) => (
            <div key={h.id} className={styles.historyItem}>
              <div className={styles.historyBody}>
                <h3 className={styles.historyTitle}>{h.title}</h3>
                <p className={styles.historySummary}>{h.summary}</p>
                <div className={styles.historyMeta}>
                  <span className={`${styles.statusBadge} ${h.status === "pending" ? styles.statusBadgePending : ""}`}>
                    {h.status === "completed" ? "已完成" : h.status === "active" ? "进行中" : "待确认"}
                  </span>
                  <span className={styles.historyDate}>{timeAgo(h.createdAt)}</span>
                  {h.city && <span className={styles.historyTag}>{h.city}</span>}
                  {h.budget && <span className={styles.historyTag}>{h.budget}</span>}
                </div>
              </div>
              <div className={styles.historyActions}>
                <StarRating value={h.rating} onChange={(v) => handleRate(h.id, v)} />
                <button
                  type="button"
                  className={`${styles.favBtn} ${h.favorite ? styles.favActive : ""}`}
                  onClick={() => handleToggleFav(h.id)}
                >
                  <Heart size={16} fill={h.favorite ? "currentColor" : "none"} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </RevealGroup>
  );

  const renderNotifications = () => (
    <RevealGroup>
      <div className={styles.tabHeader}>
        <h2 className={styles.tabTitle}>通知中心</h2>
        <p className={styles.tabDesc}>管理通知和提醒偏好</p>
      </div>

      <div className={styles.glassCard}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <h3 className={styles.glassCardTitle} style={{ margin: 0 }}>
            通知 <span style={{ fontSize: 13, fontWeight: 400, color: "var(--color-text-secondary)" }}>({unreadCount} 未读)</span>
          </h3>
          {unreadCount > 0 && (
            <Button size="small" variant="ghost" onClick={handleMarkAllRead}>
              全部已读
            </Button>
          )}
        </div>

        <div className={styles.notifList}>
          {notifications.length === 0 ? (
            <div className={styles.guestEmpty}>
              <Bell size={40} />
              <p className={styles.guestEmptyTitle}>暂无通知</p>
            </div>
          ) : (
            notifications.map((n) => (
              <div key={n.id} className={`${styles.notifItem} ${!n.read ? styles.notifUnread : ""}`}>
                <div className={styles.notifIcon}>
                  <Bell size={18} />
                </div>
                <div className={styles.notifBody}>
                  <p className={styles.notifTitle}>{n.title}</p>
                  <p className={styles.notifMessage}>{n.message}</p>
                  <span className={styles.notifTime}>{timeAgo(n.createdAt)}</span>
                </div>
                <div className={styles.notifActions}>
                  {!n.read && (
                    <button type="button" className={styles.notifActionBtn} onClick={() => handleMarkRead(n.id)} title="标为已读">
                      <Check size={14} />
                    </button>
                  )}
                  <button type="button" className={`${styles.notifActionBtn} ${styles.notifActionBtnDelete}`} onClick={() => handleDeleteNotif(n.id)} title="删除">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {notifPrefs && (
        <div className={styles.glassCard}>
          <h3 className={styles.glassCardTitle}>通知偏好</h3>
          <div className={styles.prefsGrid}>
            {([
              ["departureReminder", "出发提醒"],
              ["reservationReminder", "预订提醒"],
              ["shareFeedback", "分享反馈"],
              ["weatherAlert", "天气预警"],
              ["planExpiry", "规划过期"],
              ["emailEnabled", "邮件通知"],
              ["browserEnabled", "浏览器通知"],
              ["calendarEnabled", "日历同步"],
            ] as const).map(([key, label]) => (
              <div key={key} className={styles.prefItem}>
                <span className={styles.prefLabel}>{label}</span>
                <Toggle
                  active={notifPrefs[key]}
                  onToggle={async () => {
                    const prev = notifPrefs[key];
                    const next = { ...notifPrefs, [key]: !prev };
                    setNotifPrefs(next);
                    try {
                      await updateNotificationPreferences(next);
                    } catch {
                      setNotifPrefs((p) => (p ? { ...p, [key]: prev } : p));
                      show("设置失败，请重试");
                    }
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </RevealGroup>
  );

  const renderPrivacy = () => (
    <RevealGroup>
      <div className={styles.tabHeader}>
        <h2 className={styles.tabTitle}>隐私与安全</h2>
        <p className={styles.tabDesc}>管理权限、会话和数据</p>
      </div>

      {permissions && (
        <div className={styles.glassCard}>
          <h3 className={styles.glassCardTitle}>权限设置</h3>
          <div className={styles.permList}>
            {([
              ["locationEnabled", MapPin, "定位权限", "允许获取位置以优化路线推荐"],
              ["memoryEnabled", Brain, "记忆权限", "允许 AI 记住你的偏好和习惯"],
              ["calendarEnabled", Calendar, "日历权限", "允许同步行程到日历"],
              ["shareEnabled", Globe, "分享权限", "允许生成分享链接"],
              ["developerEnabled", Code2, "开发者模式", "开启 API Key 和 Webhook 管理"],
            ] as const).map(([key, Icon, label, desc]) => (
              <div key={key} className={styles.permItem}>
                <div className={styles.permInfo}>
                  <div className={styles.permIcon}>
                    <Icon size={18} />
                  </div>
                  <div>
                    <div className={styles.permLabel}>{label}</div>
                    <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{desc}</div>
                  </div>
                </div>
                <Toggle active={permissions[key]} onToggle={() => handleTogglePerm(key)} />
              </div>
            ))}
          </div>
        </div>
      )}

      {!isGuest && (
        <div className={styles.glassCard}>
          <h3 className={styles.glassCardTitle}>活跃会话</h3>
          <div className={styles.sessionList}>
            {sessions.map((s) => (
              <div key={s.id} className={styles.sessionItem}>
                <div className={styles.sessionInfo}>
                  <div className={styles.sessionDevice}>
                    <Smartphone size={14} style={{ display: "inline", verticalAlign: -2, marginRight: 6 }} />
                    {s.userAgent || "未知设备"}
                  </div>
                  <div className={styles.sessionMeta}>
                    {s.ipAddress} · {timeAgo(s.lastSeenAt)}
                  </div>
                </div>
                {s.current ? (
                  <span className={styles.sessionCurrent}>当前</span>
                ) : (
                  <button type="button" className={styles.dangerBtn} style={{ padding: "4px 12px", fontSize: 12 }} onClick={() => handleRevokeSession(s.id)}>
                    撤销
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className={styles.glassCard}>
        <div className={styles.dangerZone}>
          <h3 className={styles.dangerTitle}>危险操作</h3>
          <div className={styles.dangerActions}>
            <button type="button" className={styles.dangerBtn} onClick={handleExportData}>
              导出我的数据
            </button>
            <button type="button" className={styles.dangerBtn} onClick={handleClearMemory}>
              清除所有记忆
            </button>
            <button type="button" className={styles.dangerBtn} onClick={handleDeleteAccount}>
              注销账号
            </button>
          </div>
        </div>
      </div>
    </RevealGroup>
  );

  const renderDeveloper = () => (
    <RevealGroup>
      <div className={styles.tabHeader}>
        <h2 className={styles.tabTitle}>开发者模式</h2>
        <p className={styles.tabDesc}>API Key、Webhook 和工具日志</p>
      </div>

      <div className={styles.glassCard}>
        <div className={styles.registerCta}>
          <Code2 size={48} />
          <p className={styles.registerCtaTitle}>开发者模式</p>
          <p className={styles.registerCtaDesc}>稍后开放，敬请期待</p>
        </div>
      </div>
    </RevealGroup>
  );

  const renderAccount = () => (
    <RevealGroup>
      <div className={styles.tabHeader}>
        <h2 className={styles.tabTitle}>账号管理</h2>
        <p className={styles.tabDesc}>管理账号信息和安全设置</p>
      </div>

      {isGuest ? (
        <div className={styles.glassCard}>
          <div className={styles.registerCta}>
            <User size={48} />
            <p className={styles.registerCtaTitle}>注册完整账号</p>
            <p className={styles.registerCtaDesc}>
              注册后可保存偏好到云端、管理同行人、使用开发者 API 等完整功能。
            </p>
            <Button onClick={() => onOpenModal("register")}>注册账号</Button>
          </div>
        </div>
      ) : (
        <>
          <div className={styles.glassCard}>
            <h3 className={styles.glassCardTitle}>账号信息</h3>
            <div className={styles.accountInfo}>
              <div className={styles.accountField}>
                <span className={styles.accountFieldLabel}>邮箱</span>
                <span className={styles.accountFieldValue}>{bundle?.user.email || user.name}</span>
              </div>
              <div className={styles.accountField}>
                <span className={styles.accountFieldLabel}>昵称</span>
                <span className={styles.accountFieldValue}>{bundle?.user.displayName || user.name}</span>
              </div>
              <div className={styles.accountField}>
                <span className={styles.accountFieldLabel}>角色</span>
                <span className={styles.accountFieldValue}>{bundle?.user.role || "user"}</span>
              </div>
              <div className={styles.accountField}>
                <span className={styles.accountFieldLabel}>注册时间</span>
                <span className={styles.accountFieldValue}>
                  {bundle?.user.createdAt ? new Date(bundle.user.createdAt).toLocaleDateString("zh-CN") : "-"}
                </span>
              </div>
            </div>
          </div>

          <div className={styles.glassCard}>
            <h3 className={styles.glassCardTitle}>修改密码</h3>
            <div className={styles.passwordForm}>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>当前密码</label>
                <div style={{ position: "relative" }}>
                  <input
                    className={styles.fieldInput}
                    type={showPasswords ? "text" : "password"}
                    value={passwordForm.current}
                    onChange={(e) => setPasswordForm({ ...passwordForm, current: e.target.value })}
                    style={{ width: "100%", paddingRight: 40 }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswords(!showPasswords)}
                    style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--color-text-secondary)" }}
                  >
                    {showPasswords ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>新密码</label>
                <input
                  className={styles.fieldInput}
                  type={showPasswords ? "text" : "password"}
                  value={passwordForm.next}
                  onChange={(e) => setPasswordForm({ ...passwordForm, next: e.target.value })}
                />
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>确认新密码</label>
                <input
                  className={styles.fieldInput}
                  type={showPasswords ? "text" : "password"}
                  value={passwordForm.confirm}
                  onChange={(e) => setPasswordForm({ ...passwordForm, confirm: e.target.value })}
                />
              </div>
              <div className={styles.saveRow}>
                <Button onClick={handleChangePassword}>修改密码</Button>
              </div>
            </div>
          </div>
        </>
      )}
    </RevealGroup>
  );

  const tabRenderers: Record<TabKey, () => React.ReactNode> = {
    persona: renderPersona,
    memory: renderMemory,
    companion: renderCompanion,
    history: renderHistory,
    notifications: renderNotifications,
    privacy: renderPrivacy,
    developer: renderDeveloper,
    account: renderAccount,
  };

  // ── Main render ──

  if (loading) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner} />
      </div>
    );
  }

  return (
    <div className={styles.profileLayout}>
      {/* Mobile sidebar toggle */}
      <button
        type="button"
        className={styles.mobileToggle}
        onClick={() => setSidebarOpen(!sidebarOpen)}
      >
        <Menu size={22} />
      </button>

      {/* Sidebar overlay (mobile) */}
      {sidebarOpen && (
        <div className={styles.sidebarOverlay} onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ""}`}>
        <div className={styles.sidebarProfile}>
          <div className={styles.avatar}>{initials}</div>
          <div className={styles.displayName}>{user.name}</div>
          {isGuest && <span className={styles.guestBadge}>游客模式</span>}
        </div>

        <div className={styles.statsRow}>
          <div className={styles.statItem}>
            <span className={styles.statValue}>{stats.planCount}</span>
            <span className={styles.statLabel}>规划</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statValue}>{stats.memoryCount}</span>
            <span className={styles.statLabel}>记忆</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statValue}>{stats.unreadNotifications}</span>
            <span className={styles.statLabel}>通知</span>
          </div>
        </div>

        <nav className={styles.navTabs}>
          {visibleTabs.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                type="button"
                className={`${styles.navTab} ${tab === t.key ? styles.navTabActive : ""}`}
                onClick={() => {
                  setTab(t.key);
                  setSidebarOpen(false);
                }}
              >
                <Icon size={18} />
                <span className={styles.navTabLabel}>{t.label}</span>
              </button>
            );
          })}
        </nav>

        <div className={styles.sidebarBottom}>
          <button type="button" className={styles.logoutBtn} onClick={onLogout}>
            <LogOut size={16} />
            {isGuest ? "退出游客" : "退出登录"}
          </button>
        </div>
      </aside>

      {/* Content */}
      <div className={styles.contentPanel}>
        {tabRenderers[tab]?.()}
      </div>

      {/* Confirm dialog */}
      {confirmDialog && (
        <div className={styles.confirmOverlay} onClick={() => setConfirmDialog(null)}>
          <div className={styles.confirmDialog} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.confirmTitle}>{confirmDialog.title}</h3>
            <p className={styles.confirmDesc}>{confirmDialog.desc}</p>
            <div className={styles.confirmActions}>
              <Button variant="ghost" onClick={() => setConfirmDialog(null)}>
                取消
              </Button>
              <Button onClick={confirmDialog.onConfirm}>确认</Button>
            </div>
          </div>
        </div>
      )}

      <GlassToast toast={toast} onDismiss={dismiss} />
    </div>
  );
}
