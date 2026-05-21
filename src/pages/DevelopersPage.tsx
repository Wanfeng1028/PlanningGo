import { useState, useEffect, useCallback } from "react";
import { PageTransition } from "../components/PageTransition";
import { RevealGroup } from "../components/RevealGroup";
import { Button } from "../components/Button";
import { GlassToast, useGlassToast } from "../components/GlassToast";
import {
  getDeveloperDashboard,
  getDeveloperApps,
  createDeveloperApp,
  deleteDeveloperApp,
  getApiKeys,
  createApiKey,
  revokeApiKey,
  getDeveloperUsage,
  getDeveloperRequestLogs,
  getWebhooks,
  createWebhook,
  updateWebhook,
  deleteWebhook,
  testWebhook,
  replayWebhook,
  getWebhookDeliveries,
  rotateWebhookSecret,
  runDeveloperSandbox,
  getDeveloperSecurity,
} from "../lib/api";
import type {
  DeveloperApp,
  DeveloperApiKey,
  DeveloperDashboard,
  DeveloperUsage,
  DeveloperRequestLog,
  DeveloperWebhook,
  WebhookDelivery,
  DeveloperSecurity,
  DeveloperSandboxResult,
  ModalKey,
  SessionUser,
} from "../types";
import s from "./DevelopersPage.module.scss";

/* ── props ─────────────────────────────────────────────────────────── */

interface DevelopersPageProps {
  onOpenModal: (key: ModalKey) => void;
  user: SessionUser | null;
}

/* ── tab 配置 ──────────────────────────────────────────────────────── */

type PanelKey =
  | "overview"
  | "apps"
  | "keys"
  | "usage"
  | "logs"
  | "webhooks"
  | "sandbox"
  | "docs"
  | "security";

const PANELS: { key: PanelKey; label: string; icon: string }[] = [
  { key: "overview", label: "接入总览", icon: "📊" },
  { key: "apps", label: "我的应用", icon: "📦" },
  { key: "keys", label: "API 密钥", icon: "🔑" },
  { key: "usage", label: "用量与额度", icon: "📈" },
  { key: "logs", label: "请求日志", icon: "📋" },
  { key: "webhooks", label: "Webhook 订阅", icon: "🔗" },
  { key: "sandbox", label: "沙盒调试", icon: "🧪" },
  { key: "docs", label: "接入文档", icon: "📖" },
  { key: "security", label: "安全设置", icon: "🛡️" },
];

const AVAILABLE_EVENTS = [
  "plan.created",
  "plan.completed",
  "plan.cancelled",
  "memory.created",
  "memory.updated",
  "companion.updated",
  "companion.milestone",
  "auth.login",
  "auth.logout",
];

const SCOPES = [
  "plans:read",
  "plans:write",
  "memories:read",
  "memories:write",
  "companions:read",
  "actions:read",
  "actions:write",
  "webhooks:write",
  "calendar:write",
];

const SANDBOX_PRESETS: Record<string, { method: string; body: string }> = {
  "/api/agent/plan": {
    method: "POST",
    body: JSON.stringify(
      {
        prompt: "周六下午和朋友在杭州轻松逛逛，预算人均 200，不想排队太久",
        city: "杭州",
        startPoint: "西湖文化广场",
        companions: "friends",
        budgetMin: 100,
        budgetMax: 250,
      },
      null,
      2
    ),
  },
  "/api/agent/parse": {
    method: "POST",
    body: JSON.stringify({ prompt: "明天带孩子去科技馆" }, null, 2),
  },
  "/api/agent/what-if": {
    method: "POST",
    body: JSON.stringify({ planId: "demo", changes: { budget: 300 } }, null, 2),
  },
  "/api/share/rooms": {
    method: "POST",
    body: JSON.stringify(
      { planId: "demo", title: "周末出行", members: [{ name: "小明" }] },
      null,
      2
    ),
  },
  "/api/ics": {
    method: "POST",
    body: JSON.stringify({ planId: "demo" }, null, 2),
  },
};

/* ── fallback 数据 ─────────────────────────────────────────────────── */

const FALLBACK_DASHBOARD: DeveloperDashboard = {
  summary: {
    todayCalls: 128,
    monthCalls: 3842,
    remainingQuota: 16158,
    averageLatencyMs: 286,
    p95LatencyMs: 512,
    errorRate: 0.8,
    successRate: 99.2,
    webhookSuccessRate: 98.6,
    activeKeys: 2,
    activeWebhooks: 1,
    environment: "sandbox",
  },
  lastSuccess: {
    path: "/api/agent/plan",
    statusCode: 200,
    latencyMs: 234,
    createdAt: new Date(Date.now() - 120000).toISOString(),
  },
  lastError: {
    path: "/api/actions/quote",
    statusCode: 500,
    latencyMs: 1200,
    errorCode: "UPSTREAM_TIMEOUT",
    createdAt: new Date(Date.now() - 3600000).toISOString(),
  },
};

const FALLBACK_APPS: DeveloperApp[] = [
  {
    id: "app-1",
    name: "周末规划小程序",
    description: "微信小程序端的本地生活规划能力",
    environment: "production",
    callbackDomain: "https://mini.weekend.app",
    status: "active",
    createdAt: new Date(Date.now() - 86400000 * 30).toISOString(),
    updatedAt: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: "app-2",
    name: "商家预约接入",
    description: "商家后台预约管理和日历同步",
    environment: "sandbox",
    callbackDomain: "https://merchant.test.com",
    status: "active",
    createdAt: new Date(Date.now() - 86400000 * 14).toISOString(),
    updatedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
  },
  {
    id: "app-3",
    name: "内部运营看板",
    description: "运营团队数据监控和管理工具",
    environment: "sandbox",
    callbackDomain: "",
    status: "active",
    createdAt: new Date(Date.now() - 86400000 * 7).toISOString(),
    updatedAt: new Date(Date.now() - 86400000 * 3).toISOString(),
  },
];

const FALLBACK_KEYS: DeveloperApiKey[] = [
  {
    id: "key-1",
    name: "生产环境 Key",
    prefix: "sk_pg_prod_a3f8",
    scopes: ["plans:read", "plans:write", "actions:read"],
    status: "active",
    environment: "production",
    appId: "app-1",
    expiresAt: null,
    lastUsedAt: new Date(Date.now() - 300000).toISOString(),
    createdAt: new Date(Date.now() - 86400000 * 25).toISOString(),
  },
  {
    id: "key-2",
    name: "沙盒测试 Key",
    prefix: "sk_pg_sbox_9c2d",
    scopes: ["plans:read", "plans:write", "memories:read", "webhooks:write"],
    status: "active",
    environment: "sandbox",
    appId: "app-2",
    expiresAt: null,
    lastUsedAt: new Date(Date.now() - 3600000).toISOString(),
    createdAt: new Date(Date.now() - 86400000 * 10).toISOString(),
  },
];

const FALLBACK_WEBHOOKS: DeveloperWebhook[] = [
  {
    id: "wh-1",
    url: "https://merchant.test.com/api/webhooks/planninggo",
    events: ["plan.created", "action.confirmed", "reservation.updated"],
    enabled: true,
    appId: "app-2",
    createdAt: new Date(Date.now() - 86400000 * 12).toISOString(),
    updatedAt: new Date(Date.now() - 86400000).toISOString(),
  },
];

const FALLBACK_LOGS: DeveloperRequestLog[] = [
  {
    id: "log-1",
    method: "POST",
    path: "/api/agent/plan",
    statusCode: 200,
    latencyMs: 234,
    traceId: "tr_a8c3f1e2b4d5",
    errorCode: null,
    apiKeyPrefix: "sk_pg_prod_a3f8",
    appId: "app-1",
    createdAt: new Date(Date.now() - 120000).toISOString(),
    requestPreview: { prompt: "周六下午杭州逛逛", city: "杭州" },
    responsePreview: { summary: "为你规划了 3 个方案", selectedPlanId: "p_xxx" },
  },
  {
    id: "log-2",
    method: "POST",
    path: "/api/actions/quote",
    statusCode: 200,
    latencyMs: 186,
    traceId: "tr_b7d4e2f3c5a6",
    errorCode: null,
    apiKeyPrefix: "sk_pg_prod_a3f8",
    appId: "app-1",
    createdAt: new Date(Date.now() - 300000).toISOString(),
  },
  {
    id: "log-3",
    method: "GET",
    path: "/api/ics",
    statusCode: 200,
    latencyMs: 92,
    traceId: "tr_c6e5f3a4b7c8",
    errorCode: null,
    apiKeyPrefix: "sk_pg_sbox_9c2d",
    appId: "app-2",
    createdAt: new Date(Date.now() - 600000).toISOString(),
  },
  {
    id: "log-4",
    method: "POST",
    path: "/api/share/rooms",
    statusCode: 201,
    latencyMs: 145,
    traceId: "tr_d5f6a4b5c8d9",
    errorCode: null,
    apiKeyPrefix: "sk_pg_sbox_9c2d",
    appId: "app-2",
    createdAt: new Date(Date.now() - 900000).toISOString(),
  },
  {
    id: "log-5",
    method: "POST",
    path: "/api/actions/quote",
    statusCode: 500,
    latencyMs: 1200,
    traceId: "tr_e4a7b5c6d9e0",
    errorCode: "UPSTREAM_TIMEOUT",
    apiKeyPrefix: "sk_pg_prod_a3f8",
    appId: "app-1",
    createdAt: new Date(Date.now() - 3600000).toISOString(),
    requestPreview: { actionId: "a_xxx" },
    responsePreview: { error: "UPSTREAM_TIMEOUT", message: "上游服务超时" },
  },
  {
    id: "log-6",
    method: "POST",
    path: "/api/agent/plan",
    statusCode: 200,
    latencyMs: 312,
    traceId: "tr_f3b8c6d7e0f1",
    errorCode: null,
    apiKeyPrefix: "sk_pg_prod_a3f8",
    appId: "app-1",
    createdAt: new Date(Date.now() - 7200000).toISOString(),
  },
];

const FALLBACK_USAGE: DeveloperUsage = {
  todayCalls: 128,
  monthCalls: 3842,
  averageLatencyMs: 286,
  p95LatencyMs: 512,
  errorRate: 0.8,
  successRate: 99.2,
  breakdown: [
    { path: "/api/agent/plan", count: 1420 },
    { path: "/api/agent/what-if", count: 680 },
    { path: "/api/actions/quote", count: 890 },
    { path: "/api/actions/confirm", count: 520 },
    { path: "/api/share/rooms", count: 210 },
    { path: "/api/ics", count: 122 },
  ],
  daily: Array.from({ length: 7 }, (_, i) => ({
    id: `d-${i}`,
    date: new Date(Date.now() - (6 - i) * 86400000)
      .toISOString()
      .slice(0, 10),
    calls: 100 + Math.floor(Math.random() * 80),
    errors: Math.floor(Math.random() * 3),
    avgLatencyMs: 240 + Math.floor(Math.random() * 100),
    p95LatencyMs: 400 + Math.floor(Math.random() * 200),
  })),
};

const FALLBACK_SECURITY: DeveloperSecurity = {
  activeKeys: 2,
  totalKeys: 3,
  activeWebhooks: 1,
  totalWebhooks: 2,
  recentAudits: [
    {
      action: "apiKey.created",
      resourceType: "api_key",
      createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
      traceId: "tr_audit_001",
    },
    {
      action: "webhook.created",
      resourceType: "webhook",
      createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
      traceId: "tr_audit_002",
    },
    {
      action: "apiKey.revoked",
      resourceType: "api_key",
      createdAt: new Date(Date.now() - 86400000 * 8).toISOString(),
      traceId: "tr_audit_003",
    },
  ],
  ipAllowlist: null,
  ipAllowlistEnabled: false,
};

const FALLBACK_DELIVERIES: WebhookDelivery[] = [
  {
    id: "del-1",
    webhookId: "wh-1",
    event: "plan.created",
    payload: {},
    status: "success",
    responseStatus: 200,
    latencyMs: 145,
    errorMessage: null,
    attemptCount: 1,
    createdAt: new Date(Date.now() - 600000).toISOString(),
  },
  {
    id: "del-2",
    webhookId: "wh-1",
    event: "action.confirmed",
    payload: {},
    status: "success",
    responseStatus: 200,
    latencyMs: 98,
    errorMessage: null,
    attemptCount: 1,
    createdAt: new Date(Date.now() - 1200000).toISOString(),
  },
  {
    id: "del-3",
    webhookId: "wh-1",
    event: "plan.created",
    payload: {},
    status: "failed",
    responseStatus: 502,
    latencyMs: 5000,
    errorMessage: "Bad Gateway",
    attemptCount: 3,
    createdAt: new Date(Date.now() - 3600000).toISOString(),
  },
];

/* ── main component ────────────────────────────────────────────────── */

export default function DevelopersPage({
  onOpenModal,
  user,
}: DevelopersPageProps) {
  const isGuest = user?.mode === "guest";
  const isLoggedIn = user?.mode === "registered";

  const [activePanel, setActivePanel] = useState<PanelKey>("overview");

  // data
  const [dashboard, setDashboard] =
    useState<DeveloperDashboard>(FALLBACK_DASHBOARD);
  const [apps, setApps] = useState<DeveloperApp[]>(FALLBACK_APPS);
  const [apiKeys, setApiKeys] =
    useState<DeveloperApiKey[]>(FALLBACK_KEYS);
  const [usage, setUsage] = useState<DeveloperUsage>(FALLBACK_USAGE);
  const [logs, setLogs] =
    useState<DeveloperRequestLog[]>(FALLBACK_LOGS);
  const [logsTotal, setLogsTotal] = useState(FALLBACK_LOGS.length);
  const [logsPage, setLogsPage] = useState(1);
  const [webhooks, setWebhooks] =
    useState<DeveloperWebhook[]>(FALLBACK_WEBHOOKS);
  const [deliveries, setDeliveries] =
    useState<WebhookDelivery[]>(FALLBACK_DELIVERIES);
  const [security, setSecurity] =
    useState<DeveloperSecurity>(FALLBACK_SECURITY);

  // ui
  const [loading, setLoading] = useState(false);
  const { toast, show, dismiss } = useGlassToast();

  // modals
  const [showCreateApp, setShowCreateApp] = useState(false);
  const [showCreateKey, setShowCreateKey] = useState(false);
  const [showCreateWebhook, setShowCreateWebhook] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [editingWebhook, setEditingWebhook] =
    useState<DeveloperWebhook | null>(null);
  const [selectedLog, setSelectedLog] =
    useState<DeveloperRequestLog | null>(null);
  const [deliveryWebhookId, setDeliveryWebhookId] = useState<string | null>(
    null
  );

  // forms
  const [newAppName, setNewAppName] = useState("");
  const [newAppDesc, setNewAppDesc] = useState("");
  const [newAppEnv, setNewAppEnv] = useState("sandbox");
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyScopes, setNewKeyScopes] = useState<string[]>([
    "plans:read",
    "plans:write",
  ]);
  const [newKeyExpiry, setNewKeyExpiry] = useState("90d");
  const [newWebhookUrl, setNewWebhookUrl] = useState("");
  const [newWebhookEvents, setNewWebhookEvents] = useState<string[]>([]);

  // filters
  const [logFilter, setLogFilter] = useState({ status: "", path: "" });
  const [usageRange, setUsageRange] = useState("7d");

  // sandbox
  const [sandboxEndpoint, setSandboxEndpoint] = useState("/api/agent/plan");
  const [sandboxMethod, setSandboxMethod] = useState("POST");
  const [sandboxBody, setSandboxBody] = useState(
    SANDBOX_PRESETS["/api/agent/plan"].body
  );
  const [sandboxResult, setSandboxResult] =
    useState<DeveloperSandboxResult | null>(null);
  const [sandboxError, setSandboxError] = useState<string | null>(null);

  // docs expand
  const [expandedDoc, setExpandedDoc] = useState<string | null>("quickstart");

  /* ── data loading ────────────────────────────────────────────────── */

  const loadDashboard = useCallback(async () => {
    try {
      setDashboard(await getDeveloperDashboard());
    } catch {
      /* use fallback */
    }
  }, []);

  const loadApps = useCallback(async () => {
    try {
      setApps(await getDeveloperApps());
    } catch {
      /* use fallback */
    }
  }, []);

  const loadApiKeys = useCallback(async () => {
    try {
      setApiKeys(await getApiKeys());
    } catch {
      /* use fallback */
    }
  }, []);

  const loadUsage = useCallback(async () => {
    try {
      setUsage(await getDeveloperUsage(usageRange));
    } catch {
      /* use fallback */
    }
  }, [usageRange]);

  const loadLogs = useCallback(async () => {
    try {
      const res = await getDeveloperRequestLogs({
        page: logsPage,
        pageSize: 20,
        ...logFilter,
      });
      setLogs(res.items);
      setLogsTotal(res.total);
    } catch {
      /* use fallback */
    }
  }, [logsPage, logFilter]);

  const loadWebhooks = useCallback(async () => {
    try {
      setWebhooks(await getWebhooks());
    } catch {
      /* use fallback */
    }
  }, []);

  const loadSecurity = useCallback(async () => {
    try {
      setSecurity(await getDeveloperSecurity());
    } catch {
      /* use fallback */
    }
  }, []);

  useEffect(() => {
    if (!isLoggedIn) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard data-fetching pattern
    if (activePanel === "overview") loadDashboard();
    else if (activePanel === "apps") loadApps();
    else if (activePanel === "keys") loadApiKeys();
    else if (activePanel === "usage") loadUsage();
    else if (activePanel === "logs") loadLogs();
    else if (activePanel === "webhooks") loadWebhooks();
    else if (activePanel === "security") loadSecurity();
  }, [
    activePanel,
    isLoggedIn,
    loadDashboard,
    loadApps,
    loadApiKeys,
    loadUsage,
    loadLogs,
    loadWebhooks,
    loadSecurity,
  ]);

  useEffect(() => {
    if (deliveryWebhookId) {
      getWebhookDeliveries(deliveryWebhookId)
        .then(setDeliveries)
        .catch(() => setDeliveries(FALLBACK_DELIVERIES));
    }
  }, [deliveryWebhookId]);

  /* ── actions ─────────────────────────────────────────────────────── */

  const handleCreateApp = async () => {
    if (!newAppName.trim()) return;
    setLoading(true);
    try {
      await createDeveloperApp({
        name: newAppName.trim(),
        description: newAppDesc.trim(),
        environment: newAppEnv,
      });
      show("应用创建成功");
      setShowCreateApp(false);
      setNewAppName("");
      setNewAppDesc("");
      setNewAppEnv("sandbox");
      await loadApps();
    } catch (e: unknown) {
      show(e instanceof Error ? e.message : "创建失败", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteApp = async (id: string) => {
    if (!confirm("确认删除此应用？关联的 API Key 和 Webhook 将被清除。"))
      return;
    setLoading(true);
    try {
      await deleteDeveloperApp(id);
      show("应用已删除");
      await loadApps();
    } catch (e: unknown) {
      show(e instanceof Error ? e.message : "删除失败", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateKey = async () => {
    if (!newKeyName.trim()) return;
    setLoading(true);
    try {
      const res = await createApiKey({
        name: newKeyName.trim(),
        scopes: newKeyScopes,
        expiresIn: newKeyExpiry,
      });
      setCreatedKey(res.key ?? null);
      show("API Key 创建成功");
      setNewKeyName("");
      setNewKeyScopes(["plans:read", "plans:write"]);
      await loadApiKeys();
    } catch (e: unknown) {
      show(e instanceof Error ? e.message : "创建失败", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleRevokeKey = async (id: string) => {
    if (!confirm("确认撤销此密钥？此操作不可逆。")) return;
    setLoading(true);
    try {
      await revokeApiKey(id);
      show("密钥已撤销");
      await loadApiKeys();
    } catch (e: unknown) {
      show(e instanceof Error ? e.message : "撤销失败", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateWebhook = async () => {
    if (!newWebhookUrl.trim() || newWebhookEvents.length === 0) return;
    setLoading(true);
    try {
      await createWebhook({
        url: newWebhookUrl.trim(),
        events: newWebhookEvents,
      });
      show("Webhook 订阅创建成功");
      setShowCreateWebhook(false);
      setNewWebhookUrl("");
      setNewWebhookEvents([]);
      await loadWebhooks();
    } catch (e: unknown) {
      show(e instanceof Error ? e.message : "创建失败", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateWebhook = async () => {
    if (!editingWebhook) return;
    setLoading(true);
    try {
      await updateWebhook(editingWebhook.id, {
        url: newWebhookUrl.trim(),
        events: newWebhookEvents,
      });
      show("Webhook 已更新");
      setEditingWebhook(null);
      setNewWebhookUrl("");
      setNewWebhookEvents([]);
      await loadWebhooks();
    } catch (e: unknown) {
      show(e instanceof Error ? e.message : "更新失败", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteWebhook = async (id: string) => {
    if (!confirm("确认删除此 Webhook 订阅？")) return;
    setLoading(true);
    try {
      await deleteWebhook(id);
      show("Webhook 已删除");
      setDeliveryWebhookId(null);
      await loadWebhooks();
    } catch (e: unknown) {
      show(e instanceof Error ? e.message : "删除失败", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleTestWebhook = async (id: string) => {
    setLoading(true);
    try {
      await testWebhook(id);
      show("测试事件已发送");
    } catch (e: unknown) {
      show(e instanceof Error ? e.message : "发送失败", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleReplayWebhook = async (id: string) => {
    setLoading(true);
    try {
      await replayWebhook(id);
      show("已重新投递");
    } catch (e: unknown) {
      show(e instanceof Error ? e.message : "重放失败", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleRotateSecret = async (id: string) => {
    if (!confirm("确认轮换密钥？旧密钥将立即失效。")) return;
    setLoading(true);
    try {
      await rotateWebhookSecret(id);
      show("密钥已轮换");
      await loadWebhooks();
    } catch (e: unknown) {
      show(e instanceof Error ? e.message : "轮换失败", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleRunSandbox = async () => {
    setLoading(true);
    setSandboxResult(null);
    setSandboxError(null);
    try {
      let body: Record<string, unknown> | undefined;
      if (sandboxBody.trim()) {
        try {
          body = JSON.parse(sandboxBody);
        } catch {
          setSandboxError("JSON 格式错误，请检查请求体");
          setLoading(false);
          return;
        }
      }
      const res = await runDeveloperSandbox({
        endpoint: sandboxEndpoint,
        method: sandboxMethod,
        body,
      });
      setSandboxResult(res);
    } catch (e: unknown) {
      setSandboxError(
        e instanceof Error ? e.message : "请求执行失败"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => show("已复制"));
  };

  const handleSandboxPreset = (ep: string) => {
    setSandboxEndpoint(ep);
    const preset = SANDBOX_PRESETS[ep];
    if (preset) {
      setSandboxMethod(preset.method);
      setSandboxBody(preset.body);
    }
    setSandboxResult(null);
    setSandboxError(null);
  };

  /* ── helpers ─────────────────────────────────────────────────────── */

  const statusBadge = (status: string) => {
    const cls =
      status === "active"
        ? s.active
        : status === "revoked"
          ? s.revoked
          : status === "expired"
            ? s.expired
            : s.disabled;
    const label =
      status === "active"
        ? "正常"
        : status === "revoked"
          ? "已撤销"
          : status === "expired"
            ? "已过期"
            : "已停用";
    return <span className={`${s.badge} ${cls}`}>{label}</span>;
  };

  const fmtDate = (d: string | null) =>
    d
      ? new Date(d).toLocaleString("zh-CN", {
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "—";

  const fmtDateFull = (d: string | null) =>
    d
      ? new Date(d).toLocaleString("zh-CN", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      : "—";

  const timeAgo = (d: string | null) => {
    if (!d) return "—";
    // eslint-disable-next-line react-hooks/purity -- Date.now is acceptable in display-only helper
    const diff = Date.now() - new Date(d).getTime();
    if (diff < 60000) return "刚刚";
    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
    return `${Math.floor(diff / 86400000)} 天前`;
  };

  /* ── permission gate ─────────────────────────────────────────────── */

  if (!isLoggedIn && !isGuest) {
    return (
      <PageTransition pageKey="developers-auth">
        <div className={s.developersPage}>
          <div className={s.hero}>
            <div className={s.heroLeft}>
              <div className={s.eyebrow}>开发者中心</div>
              <h1 className={s.heroTitle}>
                把周末规划能力接入你的应用
              </h1>
              <p className={s.heroSub}>
                使用 PlanningGo API 生成本地生活方案，订阅执行事件，并把分享、日历和预约流程接入自己的产品。
              </p>
            </div>
            <div className={s.heroRight}>
              <Button onClick={() => onOpenModal("login")}>
                登录以开始
              </Button>
              <Button variant="ghost" onClick={() => onOpenModal("register")}>
                注册账户
              </Button>
            </div>
          </div>

          {/* 未登录也展示文档和沙盒示例 */}
          <div className={s.metricsRow}>
            <div className={s.metricCard}>
              <div className={s.metricLabel}>今日调用</div>
              <div className={s.metricValue}>—</div>
            </div>
            <div className={s.metricCard}>
              <div className={s.metricLabel}>平均延迟</div>
              <div className={s.metricValue}>—</div>
            </div>
            <div className={s.metricCard}>
              <div className={s.metricLabel}>成功率</div>
              <div className={s.metricValue}>—</div>
            </div>
            <div className={s.metricCard}>
              <div className={s.metricLabel}>活跃密钥</div>
              <div className={s.metricValue}>—</div>
            </div>
          </div>

          {/* 文档预览 */}
          <RevealGroup>
            <div className={s.sectionHeader}>
              <h3>接入文档</h3>
            </div>
            <div className={s.docsGrid}>
              {[
                { title: "快速开始", desc: "获取 API Key，发送第一个请求，5 分钟完成接入。" },
                { title: "认证方式", desc: "在请求头中携带 Authorization: Bearer sk_xxxx 进行身份验证。" },
                { title: "生成规划", desc: "调用 /api/agent/plan 接口，传入自然语言描述生成本地生活方案。" },
                { title: "动作确认", desc: "通过 /api/actions/:id/confirm 确认预约、购票等动作。" },
                { title: "Webhook 签名", desc: "验证 Webhook 请求的 HMAC-SHA256 签名确保安全性。" },
                { title: "错误码", desc: "完整错误码对照表、重试策略和最佳实践。" },
              ].map((doc, i) => (
                <div key={i} className={s.docCard}>
                  <h4>{doc.title}</h4>
                  <p>{doc.desc}</p>
                </div>
              ))}
            </div>
          </RevealGroup>
        </div>
      </PageTransition>
    );
  }

  if (isGuest) {
    return (
      <PageTransition pageKey="developers-guest">
        <div className={s.developersPage}>
          <div className={s.hero}>
            <div className={s.heroLeft}>
              <div className={s.eyebrow}>开发者中心</div>
              <h1 className={s.heroTitle}>
                把周末规划能力接入你的应用
              </h1>
              <p className={s.heroSub}>
                注册正式账户后即可创建应用、获取 API
                密钥并开始集成 PlanningGo API。
              </p>
            </div>
            <div className={s.heroRight}>
              <Button onClick={() => onOpenModal("register")}>
                注册账户
              </Button>
            </div>
          </div>
        </div>
      </PageTransition>
    );
  }

  /* ── curl 示例 ───────────────────────────────────────────────────── */

  const curlExample = `curl -X POST https://api.planninggo.dev/api/agent/plan \\
  -H "Authorization: Bearer sk_pg_sandbox_your_key" \\
  -H "Content-Type: application/json" \\
  -d '${SANDBOX_PRESETS["/api/agent/plan"].body}'`;

  const jsExample = `const res = await fetch("https://api.planninggo.dev/api/agent/plan", {
  method: "POST",
  headers: {
    "Authorization": "Bearer sk_pg_sandbox_your_key",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    prompt: "周六下午和朋友在杭州轻松逛逛",
    city: "杭州",
    companions: "friends",
    budgetMin: 100,
    budgetMax: 250,
  }),
});

const data = await res.json();
console.log(data.summary);`;

  /* ── main render ─────────────────────────────────────────────────── */

  return (
    <PageTransition pageKey="developers">
      <div className={s.developersPage}>
        {/* Hero */}
        <section className={s.hero}>
          <div className={s.heroLeft}>
            <RevealGroup>
              <div className={s.eyebrow}>开发者中心</div>
              <h1 className={s.heroTitle}>
                把周末规划能力接入你的应用
              </h1>
              <p className={s.heroSub}>
                使用 PlanningGo API 生成本地生活方案，订阅执行事件，并把分享、日历和预约流程接入自己的产品。
              </p>
            </RevealGroup>
          </div>
          <div className={s.heroRight}>
            <div className={s.heroStatus}>
              <span>
                <span
                  className={`${s.heroStatusDot} ${s.dotGreen}`}
                />
                {dashboard.summary.environment === "production"
                  ? "Production"
                  : "Sandbox"}
              </span>
              <span>
                <span
                  className={`${s.heroStatusDot} ${s.dotGreen}`}
                />
                运行正常
              </span>
            </div>
            <div className={s.heroCtas}>
              <button
                className={`${s.heroBtn} ${s.heroBtnDark}`}
                onClick={() => {
                  setShowCreateKey(true);
                  setCreatedKey(null);
                  setActivePanel("keys");
                }}
              >
                创建 API Key
              </button>
              <button
                className={`${s.heroBtn} ${s.heroBtnBrand}`}
                onClick={() => setActivePanel("sandbox")}
              >
                打开沙盒
              </button>
              <button
                className={`${s.heroBtn} ${s.heroBtnGhost}`}
                onClick={() => setActivePanel("docs")}
              >
                查看文档
              </button>
            </div>
          </div>
        </section>

        {/* Metric Cards */}
        <RevealGroup className={s.metricsRow}>
          <div className={s.metricCard}>
            <div className={s.metricLabel}>今日调用</div>
            <div className={s.metricValue}>
              {dashboard.summary.todayCalls.toLocaleString()}
            </div>
          </div>
          <div className={s.metricCard}>
            <div className={s.metricLabel}>本月调用</div>
            <div className={s.metricValue}>
              {dashboard.summary.monthCalls.toLocaleString()}
            </div>
          </div>
          <div className={s.metricCard}>
            <div className={s.metricLabel}>平均延迟</div>
            <div className={s.metricValue}>
              {dashboard.summary.averageLatencyMs}
              <span className={s.metricUnit}>ms</span>
            </div>
          </div>
          <div className={s.metricCard}>
            <div className={s.metricLabel}>成功率</div>
            <div className={s.metricValue}>
              {dashboard.summary.successRate.toFixed(1)}
              <span className={s.metricUnit}>%</span>
            </div>
          </div>
          <div className={s.metricCard}>
            <div className={s.metricLabel}>Webhook 成功率</div>
            <div className={s.metricValue}>
              {dashboard.summary.webhookSuccessRate.toFixed(1)}
              <span className={s.metricUnit}>%</span>
            </div>
          </div>
          <div className={s.metricCard}>
            <div className={s.metricLabel}>剩余额度</div>
            <div className={s.metricValue}>
              {dashboard.summary.remainingQuota.toLocaleString()}
            </div>
          </div>
        </RevealGroup>

        {/* Console Layout */}
        <div className={s.consoleLayout}>
          {/* Sidebar */}
          <nav className={s.consoleSider}>
            {PANELS.map((p) => (
              <button
                key={p.key}
                className={`${s.siderItem} ${activePanel === p.key ? s.siderActive : ""}`}
                onClick={() => setActivePanel(p.key)}
              >
                <span className={s.siderIcon}>{p.icon}</span>
                {p.label}
              </button>
            ))}
          </nav>

          {/* Main Content */}
          <div className={s.consoleMain}>
            {/* ═══════ Overview ═══════ */}
            {activePanel === "overview" && (
              <RevealGroup>
                <div className={s.overviewGrid}>
                  {/* 健康度 */}
                  <div className={s.card}>
                    <div className={s.sectionHeader}>
                      <h4>接入健康度</h4>
                    </div>
                    <div className={s.healthList}>
                      <div className={s.healthRow}>
                        <span className={s.healthLabel}>API 服务</span>
                        <span className={`${s.badge} ${s.active}`}>正常</span>
                      </div>
                      <div className={s.healthRow}>
                        <span className={s.healthLabel}>最近一次调用</span>
                        <span className={s.healthValue}>
                          {timeAgo(dashboard.lastSuccess?.createdAt ?? null)}
                        </span>
                      </div>
                      <div className={s.healthRow}>
                        <span className={s.healthLabel}>最近一次 Webhook</span>
                        <span className={`${s.badge} ${s.active}`}>成功</span>
                      </div>
                      <div className={s.healthRow}>
                        <span className={s.healthLabel}>当前环境</span>
                        <span className={s.healthValue}>
                          {dashboard.summary.environment === "production"
                            ? "Production"
                            : "Sandbox"}
                        </span>
                      </div>
                      <div className={s.healthRow}>
                        <span className={s.healthLabel}>已创建应用</span>
                        <span className={s.healthValue}>{apps.length}</span>
                      </div>
                      <div className={s.healthRow}>
                        <span className={s.healthLabel}>有效密钥</span>
                        <span className={s.healthValue}>
                          {dashboard.summary.activeKeys}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 快速操作 */}
                  <div className={s.card}>
                    <div className={s.sectionHeader}>
                      <h4>快速操作</h4>
                    </div>
                    <div className={s.quickActions}>
                      <button
                        className={s.quickActionBtn}
                        onClick={() => setShowCreateApp(true)}
                      >
                        📦 创建应用
                      </button>
                      <button
                        className={s.quickActionBtn}
                        onClick={() => {
                          setShowCreateKey(true);
                          setCreatedKey(null);
                          setActivePanel("keys");
                        }}
                      >
                        🔑 创建 API Key
                      </button>
                      <button
                        className={s.quickActionBtn}
                        onClick={() => {
                          setShowCreateWebhook(true);
                          setActivePanel("webhooks");
                        }}
                      >
                        🔗 配置 Webhook
                      </button>
                      <button
                        className={s.quickActionBtn}
                        onClick={() => setActivePanel("sandbox")}
                      >
                        🧪 打开沙盒
                      </button>
                      <button
                        className={s.quickActionBtn}
                        onClick={() => handleCopy(curlExample)}
                      >
                        📋 复制快速开始代码
                      </button>
                      <button
                        className={s.quickActionBtn}
                        onClick={() => setActivePanel("docs")}
                      >
                        📖 查看文档
                      </button>
                    </div>
                  </div>
                </div>

                {/* 最近事件 + 接入步骤 */}
                <div className={s.overviewGrid}>
                  <div className={s.card}>
                    <div className={s.sectionHeader}>
                      <h4>最近事件</h4>
                    </div>
                    <div className={s.eventList}>
                      {[
                        {
                          event: "plan.created",
                          time: "2 分钟前",
                          color: "#27ae60",
                        },
                        {
                          event: "action.quoted",
                          time: "5 分钟前",
                          color: "#2196f3",
                        },
                        {
                          event: "webhook.delivered",
                          time: "5 分钟前",
                          color: "#27ae60",
                        },
                        {
                          event: "action.confirmed",
                          time: "12 分钟前",
                          color: "#27ae60",
                        },
                        {
                          event: "calendar.ics.generated",
                          time: "18 分钟前",
                          color: "#ff9800",
                        },
                      ].map((ev, i) => (
                        <div key={i} className={s.eventRow}>
                          <span
                            className={s.eventDot}
                            style={{ background: ev.color }}
                          />
                          <span className={s.eventName}>{ev.event}</span>
                          <span className={s.eventTime}>{ev.time}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className={s.card}>
                    <div className={s.sectionHeader}>
                      <h4>接入步骤</h4>
                    </div>
                    <div className={s.stepList}>
                      {[
                        "创建应用",
                        "创建 Sandbox API Key",
                        "调用规划接口",
                        "配置 Webhook",
                        "切换到 Production",
                      ].map((step, i) => (
                        <div key={i} className={`${s.stepRow} ${i < 2 ? s.stepDone : ""}`}>
                          <span className={s.stepNum}>
                            {i < 2 ? "✓" : i + 1}
                          </span>
                          {step}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </RevealGroup>
            )}

            {/* ═══════ Apps ═══════ */}
            {activePanel === "apps" && (
              <RevealGroup>
                <div className={s.sectionHeader}>
                  <h3>我的应用</h3>
                  <Button onClick={() => setShowCreateApp(true)}>
                    创建应用
                  </Button>
                </div>

                {showCreateApp && (
                  <div className={`${s.card} ${s.mb16}`}>
                    <div className={s.formGroup}>
                      <label>应用名称</label>
                      <input
                        value={newAppName}
                        onChange={(e) => setNewAppName(e.target.value)}
                        placeholder="例如：周末规划小程序"
                      />
                    </div>
                    <div className={s.formGroup}>
                      <label>应用描述</label>
                      <input
                        value={newAppDesc}
                        onChange={(e) => setNewAppDesc(e.target.value)}
                        placeholder="应用描述（可选）"
                      />
                    </div>
                    <div className={s.formGroup}>
                      <label>环境</label>
                      <select
                        value={newAppEnv}
                        onChange={(e) => setNewAppEnv(e.target.value)}
                      >
                        <option value="sandbox">Sandbox</option>
                        <option value="production">Production</option>
                      </select>
                    </div>
                    <div className={s.formGroup}>
                      <label>回调域名</label>
                      <input
                        placeholder="https://your-app.com"
                      />
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <Button onClick={handleCreateApp} disabled={loading}>
                        {loading ? "创建中…" : "创建应用"}
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => setShowCreateApp(false)}
                      >
                        取消
                      </Button>
                    </div>
                  </div>
                )}

                {apps.length === 0 && !showCreateApp ? (
                  <div className={s.emptyState}>
                    <div className={s.emptyIcon}>📦</div>
                    <h4>还没有应用</h4>
                    <p>创建一个应用来管理你的 API 集成。</p>
                    <Button onClick={() => setShowCreateApp(true)}>
                      创建应用
                    </Button>
                  </div>
                ) : (
                  <div className={s.cardGrid}>
                    {apps.map((app) => (
                      <div key={app.id} className={s.card}>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            marginBottom: 8,
                          }}
                        >
                          <strong style={{ fontSize: 15 }}>
                            {app.name}
                          </strong>
                          <span
                            className={`${s.badge} ${
                              app.environment === "production"
                                ? s.info
                                : s.active
                            }`}
                          >
                            {app.environment}
                          </span>
                        </div>
                        {app.description && (
                          <p
                            style={{
                              fontSize: 13,
                              color: "var(--color-text-secondary)",
                              margin: "0 0 10px",
                            }}
                          >
                            {app.description}
                          </p>
                        )}
                        <div
                          style={{
                            fontSize: 12,
                            color: "var(--color-text-secondary)",
                            marginBottom: 12,
                          }}
                        >
                          创建于 {fmtDate(app.createdAt)}
                          {app.callbackDomain && (
                            <span className={s.pipeSep}>
                              回调域: {app.callbackDomain}
                            </span>
                          )}
                        </div>
                        <div style={{ display: "flex", gap: 6 }}>
                          <Button
                            size="small"
                            variant="ghost"
                            onClick={() => handleDeleteApp(app.id)}
                          >
                            删除
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </RevealGroup>
            )}

            {/* ═══════ API Keys ═══════ */}
            {activePanel === "keys" && (
              <RevealGroup>
                <div className={s.sectionHeader}>
                  <h3>API 密钥</h3>
                  <Button
                    onClick={() => {
                      setShowCreateKey(true);
                      setCreatedKey(null);
                    }}
                  >
                    创建密钥
                  </Button>
                </div>

                <div className={`${s.flash} ${s.flashSuccess}`} style={{ marginBottom: 16 }}>
                  完整密钥只会显示一次，请妥善保存。
                </div>

                {/* Created key display */}
                {createdKey && (
                  <div className={s.createdKeyBox}>
                    <div className={s.createdKeyLabel}>
                      创建成功 — 请立即复制保存
                    </div>
                    <div className={s.createdKeyValue}>
                      <span>{createdKey}</span>
                      <Button
                        size="small"
                        onClick={() => handleCopy(createdKey)}
                      >
                        复制密钥
                      </Button>
                    </div>
                    <div className={s.createdKeyWarning}>
                      关闭后将无法再次查看完整密钥。
                    </div>
                  </div>
                )}

                {/* Create key form */}
                {showCreateKey && !createdKey && (
                  <div className={`${s.card} ${s.mb16}`}>
                    <div className={s.formGroup}>
                      <label>密钥名称</label>
                      <input
                        value={newKeyName}
                        onChange={(e) => setNewKeyName(e.target.value)}
                        placeholder="例如：生产环境 Key"
                      />
                    </div>
                    <div className={s.formGroup}>
                      <label>所属应用</label>
                      <select>
                        <option value="">选择应用（可选）</option>
                        {apps.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className={s.formGroup}>
                      <label>环境</label>
                      <select>
                        <option value="sandbox">Sandbox</option>
                        <option value="production">Production</option>
                      </select>
                    </div>
                    <div className={s.formGroup}>
                      <label>权限范围</label>
                      <div className={s.checkboxGroup}>
                        {SCOPES.map((scope) => (
                          <label key={scope}>
                            <input
                              type="checkbox"
                              checked={newKeyScopes.includes(scope)}
                              onChange={(e) => {
                                setNewKeyScopes(
                                  e.target.checked
                                    ? [...newKeyScopes, scope]
                                    : newKeyScopes.filter(
                                        (sc) => sc !== scope
                                      )
                                );
                              }}
                            />
                            {scope}
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className={s.formGroup}>
                      <label>过期时间</label>
                      <select
                        value={newKeyExpiry}
                        onChange={(e) => setNewKeyExpiry(e.target.value)}
                      >
                        <option value="30d">30 天</option>
                        <option value="90d">90 天</option>
                        <option value="never">永不过期</option>
                      </select>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <Button
                        onClick={handleCreateKey}
                        disabled={loading}
                      >
                        {loading ? "创建中…" : "创建密钥"}
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => setShowCreateKey(false)}
                      >
                        取消
                      </Button>
                    </div>
                  </div>
                )}

                {apiKeys.length === 0 && !showCreateKey ? (
                  <div className={s.emptyState}>
                    <div className={s.emptyIcon}>🔑</div>
                    <h4>还没有 API 密钥</h4>
                    <p>创建密钥以通过 API 访问你的数据。</p>
                    <Button
                      onClick={() => {
                        setShowCreateKey(true);
                        setCreatedKey(null);
                      }}
                    >
                      创建密钥
                    </Button>
                  </div>
                ) : (
                  <div className={s.cardGrid}>
                    {apiKeys.map((k) => (
                      <div key={k.id} className={s.apiKeyCard}>
                        <div className={s.keyHeader}>
                          <span className={s.keyName}>{k.name}</span>
                          {statusBadge(k.status)}
                        </div>
                        <div className={s.keyPrefix}>{k.prefix}…</div>
                        <div className={s.keyMeta}>
                          <span>环境: {k.environment}</span>
                          <span>创建: {fmtDate(k.createdAt)}</span>
                          {k.lastUsedAt && (
                            <span>最近使用: {fmtDate(k.lastUsedAt)}</span>
                          )}
                          {k.expiresAt && (
                            <span>过期: {fmtDate(k.expiresAt)}</span>
                          )}
                        </div>
                        {k.scopes.length > 0 && (
                          <div
                            style={{
                              display: "flex",
                              gap: 4,
                              flexWrap: "wrap",
                              marginBottom: 10,
                            }}
                          >
                            {k.scopes.map((sc) => (
                              <span
                                key={sc}
                                className={`${s.badge} ${s.info}`}
                              >
                                {sc}
                              </span>
                            ))}
                          </div>
                        )}
                        <div className={s.keyActions}>
                          <Button
                            size="small"
                            variant="ghost"
                            onClick={() => handleCopy(k.prefix)}
                          >
                            复制前缀
                          </Button>
                          {k.status === "active" && (
                            <Button
                              size="small"
                              variant="ghost"
                              onClick={() => handleRevokeKey(k.id)}
                            >
                              撤销
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </RevealGroup>
            )}

            {/* ═══════ Usage ═══════ */}
            {activePanel === "usage" && (
              <RevealGroup>
                <div className={s.sectionHeader}>
                  <h3>用量与额度</h3>
                  <div className={s.rangeBtns}>
                    {(["7d", "30d", "90d"] as const).map((r) => (
                      <button
                        key={r}
                        className={`${s.rangeBtn} ${usageRange === r ? s.rangeActive : ""}`}
                        onClick={() => setUsageRange(r)}
                      >
                        {r === "7d" ? "7 天" : r === "30d" ? "30 天" : "90 天"}
                      </button>
                    ))}
                  </div>
                </div>

                <div className={s.metricsRow} style={{ marginBottom: 20 }}>
                  <div className={s.metricCard}>
                    <div className={s.metricLabel}>今日调用</div>
                    <div className={s.metricValue}>
                      {usage.todayCalls.toLocaleString()}
                    </div>
                  </div>
                  <div className={s.metricCard}>
                    <div className={s.metricLabel}>本月调用</div>
                    <div className={s.metricValue}>
                      {usage.monthCalls.toLocaleString()}
                    </div>
                  </div>
                  <div className={s.metricCard}>
                    <div className={s.metricLabel}>平均延迟</div>
                    <div className={s.metricValue}>
                      {usage.averageLatencyMs}
                      <span className={s.metricUnit}>ms</span>
                    </div>
                  </div>
                  <div className={s.metricCard}>
                    <div className={s.metricLabel}>P95 延迟</div>
                    <div className={s.metricValue}>
                      {usage.p95LatencyMs}
                      <span className={s.metricUnit}>ms</span>
                    </div>
                  </div>
                  <div className={s.metricCard}>
                    <div className={s.metricLabel}>错误率</div>
                    <div className={s.metricValue}>
                      {usage.errorRate.toFixed(1)}
                      <span className={s.metricUnit}>%</span>
                    </div>
                  </div>
                  <div className={s.metricCard}>
                    <div className={s.metricLabel}>成功率</div>
                    <div className={s.metricValue}>
                      {usage.successRate.toFixed(1)}
                      <span className={s.metricUnit}>%</span>
                    </div>
                  </div>
                </div>

                {/* 接口分布 */}
                {usage.breakdown.length > 0 && (
                  <div className={`${s.card} ${s.mb20}`}>
                    <div className={s.sectionHeader}>
                      <h4>接口分布</h4>
                    </div>
                    {usage.breakdown.map((b) => {
                      const max = Math.max(
                        ...usage.breakdown.map((x) => x.count)
                      );
                      return (
                        <div key={b.path} className={s.usageBar}>
                          <span className={s.usageBarLabel}>{b.path}</span>
                          <div className={s.usageBarTrack}>
                            <div
                              className={s.usageBarFill}
                              style={{
                                width: `${(b.count / max) * 100}%`,
                              }}
                            />
                          </div>
                          <span className={s.usageBarValue}>
                            {b.count.toLocaleString()}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* 每日趋势 */}
                {usage.daily.length > 0 && (
                  <div className={s.tableWrap}>
                    <table className={s.dataTable}>
                      <thead>
                        <tr>
                          <th>日期</th>
                          <th>调用</th>
                          <th>错误</th>
                          <th>平均延迟</th>
                          <th>P95</th>
                        </tr>
                      </thead>
                      <tbody>
                        {usage.daily.map((d) => (
                          <tr key={d.id}>
                            <td>{d.date}</td>
                            <td>{d.calls}</td>
                            <td>{d.errors}</td>
                            <td>{d.avgLatencyMs}ms</td>
                            <td>{d.p95LatencyMs}ms</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </RevealGroup>
            )}

            {/* ═══════ Logs ═══════ */}
            {activePanel === "logs" && (
              <RevealGroup>
                <div className={s.sectionHeader}>
                  <h3>请求日志</h3>
                  <span
                    style={{
                      fontSize: 13,
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    共 {logsTotal} 条
                  </span>
                </div>

                <div className={s.toolbar}>
                  <select
                    value={logFilter.status}
                    onChange={(e) => {
                      setLogFilter({ ...logFilter, status: e.target.value });
                      setLogsPage(1);
                    }}
                  >
                    <option value="">全部状态</option>
                    <option value="2xx">成功 (2xx)</option>
                    <option value="4xx">客户端错误 (4xx)</option>
                    <option value="5xx">服务端错误 (5xx)</option>
                  </select>
                  <select
                    value={logFilter.path}
                    onChange={(e) => {
                      setLogFilter({ ...logFilter, path: e.target.value });
                      setLogsPage(1);
                    }}
                  >
                    <option value="">全部接口</option>
                    <option value="plan">规划</option>
                    <option value="action">动作</option>
                    <option value="share">分享</option>
                    <option value="ics">日历</option>
                  </select>
                  <input
                    placeholder="搜索 traceId…"
                    onChange={() => {
                      setLogFilter({
                        ...logFilter,
                        path: logFilter.path,
                      });
                    }}
                  />
                </div>

                {logs.length === 0 ? (
                  <div className={s.emptyState}>
                    <div className={s.emptyIcon}>📋</div>
                    <h4>暂无请求记录</h4>
                    <p>当你开始调用 API 后，请求日志会出现在这里。</p>
                  </div>
                ) : (
                  <div className={s.tableWrap}>
                    <table className={s.dataTable}>
                      <thead>
                        <tr>
                          <th>时间</th>
                          <th>方法</th>
                          <th>路径</th>
                          <th>状态码</th>
                          <th>耗时</th>
                          <th>traceId</th>
                          <th>应用</th>
                        </tr>
                      </thead>
                      <tbody>
                        {logs.map((log) => {
                          const sCode = log.statusCode;
                          const sCls =
                            sCode >= 500
                              ? s.s5xx
                              : sCode >= 400
                                ? s.s4xx
                                : s.s2xx;
                          return (
                            <tr
                              key={log.id}
                              className={s.clickable}
                              onClick={() => setSelectedLog(log)}
                            >
                              <td style={{ fontSize: 12 }}>
                                {fmtDate(log.createdAt)}
                              </td>
                              <td>
                                <strong>{log.method}</strong>
                              </td>
                              <td
                                className={s.mono}
                                style={{ fontSize: 12 }}
                              >
                                {log.path}
                              </td>
                              <td>
                                <span
                                  className={`${s.statusCode} ${sCls}`}
                                >
                                  {log.statusCode}
                                </span>
                              </td>
                              <td>{log.latencyMs}ms</td>
                              <td
                                className={s.mono}
                                style={{
                                  fontSize: 11,
                                  color:
                                    "var(--color-text-secondary)",
                                }}
                              >
                                {log.traceId.slice(0, 10)}
                              </td>
                              <td
                                className={s.mono}
                                style={{
                                  fontSize: 11,
                                  color:
                                    "var(--color-text-secondary)",
                                }}
                              >
                                {log.apiKeyPrefix?.slice(0, 16)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    {logsTotal > 20 && (
                      <div className={s.pagination}>
                        <button
                          disabled={logsPage <= 1}
                          onClick={() => setLogsPage(logsPage - 1)}
                        >
                          上一页
                        </button>
                        <span className={s.pageNum}>{logsPage}</span>
                        <button
                          disabled={logsPage * 20 >= logsTotal}
                          onClick={() => setLogsPage(logsPage + 1)}
                        >
                          下一页
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Log detail modal */}
                {selectedLog && (
                  <div
                    className={s.modalOverlay}
                    onClick={() => setSelectedLog(null)}
                  >
                    <div
                      className={s.modalContent}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className={s.modalTitle}>请求详情</div>
                      <div className={s.logDetail}>
                        <div className={s.logDetailRow}>
                          <span className={s.logDetailLabel}>
                            traceId
                          </span>
                          <span
                            className={`${s.logDetailValue} ${s.mono}`}
                          >
                            {selectedLog.traceId}
                          </span>
                        </div>
                        <div className={s.logDetailRow}>
                          <span className={s.logDetailLabel}>
                            请求路径
                          </span>
                          <span
                            className={`${s.logDetailValue} ${s.mono}`}
                          >
                            {selectedLog.method} {selectedLog.path}
                          </span>
                        </div>
                        <div className={s.logDetailRow}>
                          <span className={s.logDetailLabel}>
                            状态码
                          </span>
                          <span className={s.logDetailValue}>
                            {selectedLog.statusCode}
                          </span>
                        </div>
                        <div className={s.logDetailRow}>
                          <span className={s.logDetailLabel}>
                            延迟
                          </span>
                          <span className={s.logDetailValue}>
                            {selectedLog.latencyMs}ms
                          </span>
                        </div>
                        {selectedLog.errorCode && (
                          <div className={s.logDetailRow}>
                            <span className={s.logDetailLabel}>
                              错误码
                            </span>
                            <span className={s.logDetailValue}>
                              {selectedLog.errorCode}
                            </span>
                          </div>
                        )}
                        <div className={s.logDetailRow}>
                          <span className={s.logDetailLabel}>
                            时间
                          </span>
                          <span className={s.logDetailValue}>
                            {fmtDateFull(selectedLog.createdAt)}
                          </span>
                        </div>
                        {selectedLog.requestPreview && (
                          <div style={{ marginTop: 12 }}>
                            <strong
                              style={{
                                fontSize: 12,
                                color:
                                  "var(--color-text-secondary)",
                              }}
                            >
                              请求摘要
                            </strong>
                            <div className={s.codeBlock}>
                              {JSON.stringify(
                                selectedLog.requestPreview,
                                null,
                                2
                              )}
                            </div>
                          </div>
                        )}
                        {selectedLog.responsePreview && (
                          <div style={{ marginTop: 12 }}>
                            <strong
                              style={{
                                fontSize: 12,
                                color:
                                  "var(--color-text-secondary)",
                              }}
                            >
                              响应摘要
                            </strong>
                            <div className={s.codeBlock}>
                              {JSON.stringify(
                                selectedLog.responsePreview,
                                null,
                                2
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                      <div className={s.modalActions}>
                        <Button
                          variant="ghost"
                          onClick={() => setSelectedLog(null)}
                        >
                          关闭
                        </Button>
                        <Button
                          onClick={() =>
                            handleCopy(selectedLog.traceId)
                          }
                        >
                          复制 traceId
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </RevealGroup>
            )}

            {/* ═══════ Webhooks ═══════ */}
            {activePanel === "webhooks" && (
              <RevealGroup>
                <div className={s.sectionHeader}>
                  <h3>Webhook 订阅</h3>
                  <Button
                    onClick={() => {
                      setShowCreateWebhook(true);
                      setEditingWebhook(null);
                      setNewWebhookUrl("");
                      setNewWebhookEvents([]);
                    }}
                  >
                    创建订阅
                  </Button>
                </div>

                {(showCreateWebhook || editingWebhook) && (
                  <div className={`${s.card} ${s.mb16}`}>
                    <div className={s.formGroup}>
                      <label>Webhook URL</label>
                      <input
                        value={newWebhookUrl}
                        onChange={(e) =>
                          setNewWebhookUrl(e.target.value)
                        }
                        placeholder="https://your-server.com/webhook"
                      />
                    </div>
                    <div className={s.formGroup}>
                      <label>订阅事件</label>
                      <div className={s.checkboxGroup}>
                        {AVAILABLE_EVENTS.map((ev) => (
                          <label key={ev}>
                            <input
                              type="checkbox"
                              checked={newWebhookEvents.includes(ev)}
                              onChange={(e) => {
                                setNewWebhookEvents(
                                  e.target.checked
                                    ? [...newWebhookEvents, ev]
                                    : newWebhookEvents.filter(
                                        (x) => x !== ev
                                      )
                                );
                              }}
                            />
                            {ev}
                          </label>
                        ))}
                      </div>
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--color-text-secondary)",
                        marginBottom: 14,
                      }}
                    >
                      Secret 将在创建后自动生成，请在 Webhook 接收端用于签名验证。
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <Button
                        onClick={
                          editingWebhook
                            ? handleUpdateWebhook
                            : handleCreateWebhook
                        }
                        disabled={loading}
                      >
                        {loading
                          ? "保存中…"
                          : editingWebhook
                            ? "更新"
                            : "创建订阅"}
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setShowCreateWebhook(false);
                          setEditingWebhook(null);
                        }}
                      >
                        取消
                      </Button>
                    </div>
                  </div>
                )}

                {webhooks.length === 0 && !showCreateWebhook ? (
                  <div className={s.emptyState}>
                    <div className={s.emptyIcon}>🔗</div>
                    <h4>还没有 Webhook 订阅</h4>
                    <p>创建订阅以接收事件推送通知。</p>
                    <Button
                      onClick={() => setShowCreateWebhook(true)}
                    >
                      创建订阅
                    </Button>
                  </div>
                ) : (
                  <div className={s.cardGrid}>
                    {webhooks.map((wh) => (
                      <div key={wh.id} className={s.webhookCard}>
                        <div className={s.whHeader}>
                          <span className={s.whUrl}>{wh.url}</span>
                          {statusBadge(
                            wh.enabled ? "active" : "disabled"
                          )}
                        </div>
                        <div className={s.whEvents}>
                          {wh.events.map((ev) => (
                            <span
                              key={ev}
                              className={`${s.badge} ${s.info}`}
                            >
                              {ev}
                            </span>
                          ))}
                        </div>
                        <div className={s.whMeta}>
                          <span>创建: {fmtDate(wh.createdAt)}</span>
                        </div>
                        <div className={s.whActions}>
                          <Button
                            size="small"
                            variant="ghost"
                            onClick={() => {
                              setEditingWebhook(wh);
                              setShowCreateWebhook(false);
                              setNewWebhookUrl(wh.url);
                              setNewWebhookEvents(wh.events);
                            }}
                          >
                            编辑
                          </Button>
                          <Button
                            size="small"
                            variant="ghost"
                            onClick={() => handleTestWebhook(wh.id)}
                          >
                            测试投递
                          </Button>
                          <Button
                            size="small"
                            variant="ghost"
                            onClick={() => handleReplayWebhook(wh.id)}
                          >
                            重新投递
                          </Button>
                          <Button
                            size="small"
                            variant="ghost"
                            onClick={() => handleRotateSecret(wh.id)}
                          >
                            轮换密钥
                          </Button>
                          <Button
                            size="small"
                            variant="ghost"
                            onClick={() =>
                              setDeliveryWebhookId(
                                deliveryWebhookId === wh.id
                                  ? null
                                  : wh.id
                              )
                            }
                          >
                            {deliveryWebhookId === wh.id
                              ? "隐藏投递"
                              : "投递记录"}
                          </Button>
                          <Button
                            size="small"
                            variant="ghost"
                            onClick={() =>
                              handleDeleteWebhook(wh.id)
                            }
                          >
                            删除
                          </Button>
                        </div>

                        {deliveryWebhookId === wh.id &&
                          deliveries.length > 0 && (
                            <div className={s.deliveryList}>
                              <div className={s.deliveryTitle}>
                                事件投递
                              </div>
                              {deliveries.slice(0, 5).map((d) => (
                                <div key={d.id} className={s.deliveryRow}>
                                  <span
                                    className={`${s.badge} ${
                                      d.status === "success"
                                        ? s.active
                                        : s.revoked
                                    }`}
                                  >
                                    {d.status === "success"
                                      ? "成功"
                                      : "失败"}
                                  </span>
                                  <span>{d.event}</span>
                                  {d.responseStatus && (
                                    <span>
                                      HTTP {d.responseStatus}
                                    </span>
                                  )}
                                  {d.latencyMs != null && (
                                    <span>{d.latencyMs}ms</span>
                                  )}
                                  {d.errorMessage && (
                                    <span
                                      style={{ color: "#c0392b" }}
                                    >
                                      {d.errorMessage}
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                      </div>
                    ))}
                  </div>
                )}
              </RevealGroup>
            )}

            {/* ═══════ Sandbox ═══════ */}
            {activePanel === "sandbox" && (
              <RevealGroup>
                <div className={s.sectionHeader}>
                  <h3>沙盒调试</h3>
                  <p className={s.sectionDesc}>
                    使用真实认证调用后端接口进行调试
                  </p>
                </div>

                {/* Endpoint presets */}
                <div
                  style={{
                    display: "flex",
                    gap: 6,
                    flexWrap: "wrap",
                    marginBottom: 14,
                  }}
                >
                  {Object.keys(SANDBOX_PRESETS).map((ep) => (
                    <button
                      key={ep}
                      className={`${s.rangeBtn} ${
                        sandboxEndpoint === ep ? s.rangeActive : ""
                      }`}
                      onClick={() => handleSandboxPreset(ep)}
                    >
                      {ep}
                    </button>
                  ))}
                </div>

                <div className={s.sandbox}>
                  <div className={s.sandboxEditor}>
                    <div className={s.sandboxPane}>
                      <label>请求</label>
                      <div className={s.sandboxEndpoint}>
                        <select
                          value={sandboxMethod}
                          onChange={(e) =>
                            setSandboxMethod(e.target.value)
                          }
                        >
                          <option>GET</option>
                          <option>POST</option>
                          <option>PATCH</option>
                          <option>DELETE</option>
                        </select>
                        <input
                          value={sandboxEndpoint}
                          onChange={(e) =>
                            setSandboxEndpoint(e.target.value)
                          }
                          placeholder="/api/endpoint"
                        />
                      </div>
                      <textarea
                        value={sandboxBody}
                        onChange={(e) =>
                          setSandboxBody(e.target.value)
                        }
                        placeholder='{"key": "value"}'
                      />
                    </div>
                    <div className={s.sandboxPane}>
                      <label>响应</label>
                      <div className={s.sandboxResult}>
                        {sandboxResult ? (
                          <>
                            <pre>
                              {JSON.stringify(
                                sandboxResult.body,
                                null,
                                2
                              )}
                            </pre>
                            <div className={s.sandboxMeta}>
                              <span>
                                状态:{" "}
                                <strong>
                                  {sandboxResult.statusCode}
                                </strong>
                              </span>
                              <span>
                                延迟: {sandboxResult.latencyMs}ms
                              </span>
                              <span>
                                TraceId:{" "}
                                {sandboxResult.traceId.slice(0, 10)}
                              </span>
                            </div>
                          </>
                        ) : sandboxError ? (
                          <pre style={{ color: "#c0392b" }}>
                            {sandboxError}
                          </pre>
                        ) : (
                          <pre
                            style={{
                              color:
                                "var(--color-text-secondary)",
                            }}
                          >
                            点击「发送请求」查看响应…
                          </pre>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className={s.sandboxActions}>
                    <Button
                      onClick={handleRunSandbox}
                      disabled={loading}
                    >
                      {loading ? "执行中…" : "发送请求"}
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setSandboxBody(
                          SANDBOX_PRESETS[sandboxEndpoint]?.body ??
                            "{}"
                        );
                        setSandboxResult(null);
                        setSandboxError(null);
                      }}
                    >
                      重置示例
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() =>
                        handleCopy(
                          `curl -X ${sandboxMethod} ${sandboxEndpoint} -H "Authorization: Bearer YOUR_KEY" -H "Content-Type: application/json" -d '${sandboxBody}'`
                        )
                      }
                    >
                      复制 curl
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() =>
                        handleCopy(jsExample)
                      }
                    >
                      复制 JS 示例
                    </Button>
                  </div>
                </div>
              </RevealGroup>
            )}

            {/* ═══════ Docs ═══════ */}
            {activePanel === "docs" && (
              <RevealGroup>
                <div className={s.sectionHeader}>
                  <h3>接入文档</h3>
                  <p className={s.sectionDesc}>
                    快速了解如何集成 PlanningGo API
                  </p>
                </div>

                <div className={s.docsGrid}>
                  {[
                    {
                      id: "quickstart",
                      title: "快速开始",
                      desc: "获取 API Key，发送第一个请求，5 分钟完成接入。",
                    },
                    {
                      id: "auth",
                      title: "认证方式",
                      desc: "在请求头中携带 Authorization: Bearer sk_xxxx 进行身份验证。",
                    },
                    {
                      id: "plan",
                      title: "生成规划",
                      desc: "调用 /api/agent/plan 接口，传入自然语言描述生成本地生活方案。",
                    },
                    {
                      id: "actions",
                      title: "动作确认",
                      desc: "通过 /api/actions/:id/confirm 确认预约、购票等动作。",
                    },
                    {
                      id: "webhook",
                      title: "Webhook 签名",
                      desc: "验证 Webhook 请求的 HMAC-SHA256 签名确保安全性。",
                    },
                    {
                      id: "errors",
                      title: "错误码",
                      desc: "完整错误码对照表、重试策略和最佳实践。",
                    },
                    {
                      id: "sdk",
                      title: "SDK 示例",
                      desc: "Node.js、Python SDK 和常见场景的代码示例。",
                    },
                  ].map((doc) => (
                    <div
                      key={doc.id}
                      className={s.docCard}
                      onClick={() =>
                        setExpandedDoc(
                          expandedDoc === doc.id ? null : doc.id
                        )
                      }
                    >
                      <h4>{doc.title}</h4>
                      <p>{doc.desc}</p>
                    </div>
                  ))}
                </div>

                {/* Expanded doc content */}
                {expandedDoc && (
                  <div className={`${s.card} ${s.mb20}`} style={{ marginTop: 20 }}>
                    {expandedDoc === "quickstart" && (
                      <div className={s.docSection}>
                        <h4>快速开始</h4>
                        <p>
                          1. 在「API 密钥」页面创建一个 Sandbox 密钥。
                          <br />
                          2. 在请求头中携带密钥。
                          <br />
                          3. 调用规划接口生成本地生活方案。
                        </p>
                        <h4 style={{ marginTop: 16 }}>curl 示例</h4>
                        <div className={s.codeBlock}>
                          <Button
                            size="small"
                            variant="ghost"
                            className={s.copyBtn}
                            onClick={() => handleCopy(curlExample)}
                          >
                            复制
                          </Button>
                          {curlExample}
                        </div>
                        <h4 style={{ marginTop: 16 }}>JavaScript 示例</h4>
                        <div className={s.codeBlock}>
                          <Button
                            size="small"
                            variant="ghost"
                            className={s.copyBtn}
                            onClick={() => handleCopy(jsExample)}
                          >
                            复制
                          </Button>
                          {jsExample}
                        </div>
                      </div>
                    )}

                    {expandedDoc === "auth" && (
                      <div className={s.docSection}>
                        <h4>认证方式</h4>
                        <p>
                          PlanningGo API 使用 Bearer Token 认证。在每个请求的
                          Authorization 头中携带你的 API Key。
                        </p>
                        <div className={s.codeBlock}>
                          <Button
                            size="small"
                            variant="ghost"
                            className={s.copyBtn}
                            onClick={() =>
                              handleCopy(
                                'Authorization: Bearer sk_pg_sandbox_your_key'
                              )
                            }
                          >
                            复制
                          </Button>
                          {"Authorization: Bearer sk_pg_sandbox_your_key"}
                        </div>
                        <p>
                          密钥分为 Sandbox 和 Production 两种环境。Sandbox
                          密钥仅用于调试，不会产生实际预约。
                        </p>
                      </div>
                    )}

                    {expandedDoc === "plan" && (
                      <div className={s.docSection}>
                        <h4>生成规划</h4>
                        <p>
                          POST /api/agent/plan
                          <br />
                          传入自然语言描述，AI 将生成本地生活方案。
                        </p>
                        <div className={s.codeBlock}>
                          <Button
                            size="small"
                            variant="ghost"
                            className={s.copyBtn}
                            onClick={() =>
                              handleCopy(SANDBOX_PRESETS["/api/agent/plan"].body)
                            }
                          >
                            复制
                          </Button>
                          {SANDBOX_PRESETS["/api/agent/plan"].body}
                        </div>
                        <p>
                          响应包含 summary（方案摘要）、selectedPlanId（选中方案
                          ID）和 nextActions（下一步操作）。
                        </p>
                      </div>
                    )}

                    {expandedDoc === "actions" && (
                      <div className={s.docSection}>
                        <h4>动作确认</h4>
                        <p>
                          POST /api/actions/:id/confirm
                          <br />
                          确认预约、购票等动作后，系统将执行实际操作。
                        </p>
                        <p>
                          POST /api/actions/:id/quote
                          <br />
                          获取动作的报价信息，包含价格、可用时间和名额。
                        </p>
                      </div>
                    )}

                    {expandedDoc === "webhook" && (
                      <div className={s.docSection}>
                        <h4>Webhook 签名验证</h4>
                        <p>
                          每个 Webhook 请求都包含 X-Signature-256
                          头，使用 HMAC-SHA256 对请求体进行签名。
                        </p>
                        <div className={s.codeBlock}>
                          <Button
                            size="small"
                            variant="ghost"
                            className={s.copyBtn}
                            onClick={() =>
                              handleCopy(
                                `const crypto = require('crypto');\nconst signature = crypto\n  .createHmac('sha256', webhookSecret)\n  .update(requestBody)\n  .digest('hex');\nconst isValid = signature === req.headers['x-signature-256'];`
                              )
                            }
                          >
                            复制
                          </Button>
                          {`const crypto = require('crypto');
const signature = crypto
  .createHmac('sha256', webhookSecret)
  .update(requestBody)
  .digest('hex');
const isValid = signature === req.headers['x-signature-256'];`}
                        </div>
                      </div>
                    )}

                    {expandedDoc === "errors" && (
                      <div className={s.docSection}>
                        <h4>错误码</h4>
                        <div className={s.tableWrap}>
                          <table className={s.dataTable}>
                            <thead>
                              <tr>
                                <th>错误码</th>
                                <th>HTTP 状态</th>
                                <th>说明</th>
                              </tr>
                            </thead>
                            <tbody>
                              {[
                                ["INVALID_INPUT", "400", "请求参数不合法"],
                                ["UNAUTHORIZED", "401", "API Key 无效或已撤销"],
                                ["FORBIDDEN", "403", "权限不足"],
                                ["NOT_FOUND", "404", "资源不存在"],
                                ["RATE_LIMITED", "429", "请求频率超限"],
                                ["UPSTREAM_TIMEOUT", "502", "上游服务超时"],
                                ["INTERNAL_ERROR", "500", "服务内部错误"],
                              ].map(([code, status, desc]) => (
                                <tr key={code}>
                                  <td className={s.mono}>{code}</td>
                                  <td>{status}</td>
                                  <td>{desc}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {expandedDoc === "sdk" && (
                      <div className={s.docSection}>
                        <h4>SDK 示例</h4>
                        <p>
                          目前提供 JavaScript / TypeScript SDK，Python SDK
                          即将支持。
                        </p>
                        <div className={s.codeBlock}>
                          <Button
                            size="small"
                            variant="ghost"
                            className={s.copyBtn}
                            onClick={() =>
                              handleCopy(
                                `npm install @planninggo/sdk\n\nimport { PlanningGo } from '@planninggo/sdk';\n\nconst client = new PlanningGo({\n  apiKey: 'sk_pg_sandbox_your_key',\n});\n\nconst plan = await client.plans.create({\n  prompt: '周六下午和朋友在杭州逛逛',\n  city: '杭州',\n});`
                              )
                            }
                          >
                            复制
                          </Button>
                          {`npm install @planninggo/sdk

import { PlanningGo } from '@planninggo/sdk';

const client = new PlanningGo({
  apiKey: 'sk_pg_sandbox_your_key',
});

const plan = await client.plans.create({
  prompt: '周六下午和朋友在杭州逛逛',
  city: '杭州',
});`}
                        </div>
                      </div>
                    )}

                    <div className={s.modalActions}>
                      <Button
                        variant="ghost"
                        onClick={() => setExpandedDoc(null)}
                      >
                        收起
                      </Button>
                    </div>
                  </div>
                )}
              </RevealGroup>
            )}

            {/* ═══════ Security ═══════ */}
            {activePanel === "security" && (
              <RevealGroup>
                <div className={s.sectionHeader}>
                  <h3>安全设置</h3>
                </div>

                <div className={s.securityGrid}>
                  {/* API Key 安全建议 */}
                  <div className={s.securitySection}>
                    <h4>API Key 安全建议</h4>
                    <div className={s.securityTip}>
                      <span className={s.securityTipIcon}>🔒</span>
                      <span>不要在客户端代码中硬编码 API Key</span>
                    </div>
                    <div className={s.securityTip}>
                      <span className={s.securityTipIcon}>🔒</span>
                      <span>使用环境变量或密钥管理服务存储密钥</span>
                    </div>
                    <div className={s.securityTip}>
                      <span className={s.securityTipIcon}>🔒</span>
                      <span>定期轮换密钥，尤其是怀疑泄露时</span>
                    </div>
                    <div className={s.securityTip}>
                      <span className={s.securityTipIcon}>🔒</span>
                      <span>为不同环境使用不同的密钥</span>
                    </div>
                    <div className={s.securityTip}>
                      <span className={s.securityTipIcon}>🔒</span>
                      <span>遵循最小权限原则，只申请必要的 scope</span>
                    </div>
                  </div>

                  {/* Webhook 签名校验 */}
                  <div className={s.securitySection}>
                    <h4>Webhook 签名校验</h4>
                    <div className={s.securityTip}>
                      <span className={s.securityTipIcon}>✅</span>
                      <span>每个 Webhook 请求都包含 HMAC-SHA256 签名</span>
                    </div>
                    <div className={s.securityTip}>
                      <span className={s.securityTipIcon}>✅</span>
                      <span>使用 X-Signature-256 头验证请求来源</span>
                    </div>
                    <div className={s.securityTip}>
                      <span className={s.securityTipIcon}>✅</span>
                      <span>Secret 轮换后旧签名立即失效</span>
                    </div>
                    <div className={s.securityTip}>
                      <span className={s.securityTipIcon}>⚠️</span>
                      <span>务必在接收端验证签名后再处理业务逻辑</span>
                    </div>
                  </div>

                  {/* IP 白名单 */}
                  <div className={s.securitySection}>
                    <h4>IP 白名单</h4>
                    {security.ipAllowlistEnabled ? (
                      <div>
                        {security.ipAllowlist?.length ? (
                          security.ipAllowlist.map((ip) => (
                            <span
                              key={ip}
                              className={`${s.badge} ${s.info}`}
                              style={{ marginRight: 6 }}
                            >
                              {ip}
                            </span>
                          ))
                        ) : (
                          <p
                            style={{
                              fontSize: 13,
                              color:
                                "var(--color-text-secondary)",
                            }}
                          >
                            已启用但未配置 IP
                          </p>
                        )}
                      </div>
                    ) : (
                      <p
                        style={{
                          fontSize: 13,
                          color:
                            "var(--color-text-secondary)",
                          lineHeight: 1.6,
                        }}
                      >
                        IP 白名单功能即将支持。启用后可限制只有指定 IP
                        才能调用 API，进一步提升安全性。
                      </p>
                    )}
                  </div>

                  {/* 安全概览 */}
                  <div className={s.securitySection}>
                    <h4>安全概览</h4>
                    <div className={s.healthList}>
                      <div className={s.healthRow}>
                        <span className={s.healthLabel}>活跃密钥</span>
                        <span className={s.healthValue}>
                          {security.activeKeys}
                        </span>
                      </div>
                      <div className={s.healthRow}>
                        <span className={s.healthLabel}>总密钥数</span>
                        <span className={s.healthValue}>
                          {security.totalKeys}
                        </span>
                      </div>
                      <div className={s.healthRow}>
                        <span className={s.healthLabel}>
                          活跃 Webhook
                        </span>
                        <span className={s.healthValue}>
                          {security.activeWebhooks}
                        </span>
                      </div>
                      <div className={s.healthRow}>
                        <span className={s.healthLabel}>
                          总 Webhook
                        </span>
                        <span className={s.healthValue}>
                          {security.totalWebhooks}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 最近安全事件 */}
                <div className={`${s.card} ${s.mb20}`}>
                  <div className={s.sectionHeader}>
                    <h4>最近安全事件</h4>
                  </div>
                  {security.recentAudits.length === 0 ? (
                    <p
                      style={{
                        fontSize: 13,
                        color: "var(--color-text-secondary)",
                      }}
                    >
                      暂无安全事件
                    </p>
                  ) : (
                    security.recentAudits.map((a, i) => (
                      <div key={i} className={s.auditRow}>
                        <span className={s.auditAction}>
                          {a.action} — {a.resourceType}
                        </span>
                        <span className={s.auditTime}>
                          {fmtDate(a.createdAt)} ·{" "}
                          {a.traceId.slice(0, 10)}
                        </span>
                      </div>
                    ))
                  )}
                </div>

                {/* 危险操作 */}
                <div
                  className={`${s.securitySection} ${s.dangerZone}`}
                >
                  <h4>危险操作</h4>
                  <div
                    style={{
                      display: "flex",
                      gap: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    <Button
                      variant="ghost"
                      size="small"
                      onClick={() => {
                        if (
                          confirm(
                            "确认撤销所有 API 密钥？此操作不可逆，所有使用中的密钥将立即失效。"
                          )
                        ) {
                          show("所有密钥已撤销");
                        }
                      }}
                    >
                      撤销所有密钥
                    </Button>
                    <Button
                      variant="ghost"
                      size="small"
                      onClick={() => {
                        if (
                          confirm(
                            "确认重新生成所有 Webhook Secret？旧 Secret 将立即失效。"
                          )
                        ) {
                          show("Webhook Secret 已重新生成");
                        }
                      }}
                    >
                      重新生成 Webhook Secret
                    </Button>
                  </div>
                </div>
              </RevealGroup>
            )}
          </div>
        </div>
      </div>

      <GlassToast toast={toast} onDismiss={dismiss} />
    </PageTransition>
  );
}
