import type {
  ProfileBundle,
  PersonaData,
  CompanionProfile,
  MemoryInsight,
  AiInsight,
  PlanHistoryItem,
  NotificationItem,
  NotificationPreferences,
  PermissionSettings,
  SessionInfo,
  GuestProfileInput,
  DeveloperApp,
  DeveloperApiKey,
  DeveloperDashboard,
  DeveloperUsage,
  DeveloperRequestLog,
  DeveloperWebhook,
  WebhookDelivery,
  DeveloperSecurity,
  DeveloperSandboxResult,
} from "../types";

export interface AgentPlanResponse {
  traceId: string;
  summary: string;
  selectedPlanId: string;
  nextActions: string[];
}

export interface AuthResponse {
  token?: string;
  accessToken?: string;
  refreshToken?: string;
  user: {
    id: string;
    name?: string;
    displayName?: string;
    email?: string;
    mode?: "guest" | "registered";
    role?: string;
  };
  profile?: {
    city: string;
    startPoint: string;
    homeLat?: number;
    homeLng?: number;
    locationLabel?: string;
    locationSource?: string;
  };
  onboardingSteps?: string[];
  expiresInMinutes?: number;
}

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:3001";

// ── Token 管理 ──
let _authToken: string | null = localStorage.getItem("pg_token");

export function setAuthToken(token: string | null) {
  _authToken = token;
  if (token) localStorage.setItem("pg_token", token);
  else localStorage.removeItem("pg_token");
}

export function getAuthToken() {
  return _authToken;
}

export async function requestAgentPlan(prompt: string): Promise<AgentPlanResponse> {
  const response = await fetch(`${API_BASE}/api/agent/plan`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      prompt,
      companions: "family",
      budget: 420,
      startPoint: "浙大紫金港",
    }),
  });

  if (!response.ok) {
    throw new Error(`Agent API failed: ${response.status}`);
  }

  return response.json() as Promise<AgentPlanResponse>;
}

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...(init?.headers as Record<string, string> ?? {}),
  };
  if (_authToken) {
    headers.authorization = `Bearer ${_authToken}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
  });

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }

  if (!response.ok) {
    const msg =
      (body && typeof body === "object" && "message" in body && typeof (body as Record<string, unknown>).message === "string"
        ? (body as Record<string, unknown>).message
        : undefined) ??
      (body && typeof body === "object" && "error" in body && typeof (body as Record<string, unknown>).error === "object"
        ? ((body as Record<string, unknown>).error as Record<string, unknown>)?.message
        : undefined) ??
      `请求失败 (${response.status})`;

    if (import.meta.env.DEV) {
      console.warn(`[api] ${path} ${response.status}`, body);
    }

    throw new Error(typeof msg === "string" ? msg : `请求失败 (${response.status})`);
  }

  // 兼容 { ok, data } 包装格式和扁平格式
  if (body && typeof body === "object" && "ok" in body && "data" in body) {
    return (body as { data: T }).data;
  }

  return body as T;
}

// ── Auth ──

export async function login(email: string, password: string): Promise<AuthResponse> {
  return apiJson<AuthResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function register(input: {
  name: string;
  email: string;
  password: string;
  city: string;
  startPoint: string;
  companions: string;
  budgetMin: number;
  budgetMax: number;
}): Promise<AuthResponse> {
  return apiJson<AuthResponse>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function enterAsGuest(profile: GuestProfileInput): Promise<AuthResponse> {
  return apiJson<AuthResponse>("/api/auth/guest", {
    method: "POST",
    body: JSON.stringify(profile),
  });
}

export async function changePassword(input: { currentPassword: string; newPassword: string }) {
  return apiJson("/api/auth/change-password", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// ── Plans ──

export async function getPlans() {
  return apiJson<{ selectedPlanId: string; options: unknown[] }>("/api/plans/demo");
}

export async function selectPlan(planId: string) {
  return apiJson<{ selectedPlanId: string }>("/api/plans/select", {
    method: "POST",
    body: JSON.stringify({ planId }),
  });
}

// ── Agent 规划工作台 ──

export interface PlanningTimelineStep {
  id: string;
  startTime: string;
  endTime: string;
  type: string;
  title: string;
  poiName: string | null;
  durationMinutes: number;
  transport: string;
  reasoning: string;
  bookingNeeded: boolean;
}

export interface PlanningOption {
  id: string;
  planId: string;
  title: string;
  targetGroup: string;
  score: number;
  summary: string;
  totalDurationMinutes: number;
  totalCostMin: number;
  totalCostMax: number;
  walkingKm?: number;
  assumptions: string[];
  highlights: string[];
  risks: string[];
  timeline: PlanningTimelineStep[];
  backupPlan?: string;
}

export interface PlanningExecutableAction {
  id: string;
  planId: string;
  optionId: string;
  type: string;
  status: string;
  title: string;
  description: string;
  confirmationRequired: boolean;
  priceEstimate?: string;
}

export interface PlanningResult {
  traceId: string;
  planId: string;
  summary: string;
  selectedPlanId: string;
  options: PlanningOption[];
  executableActions: PlanningExecutableAction[];
  nextActions: string[];
}

export async function requestPlanning(input: {
  prompt: string;
  city?: string;
  startPoint?: string;
  companions?: "family" | "friends" | "couple" | "solo";
  budget?: number;
}): Promise<PlanningResult> {
  return apiJson<PlanningResult>("/api/agent/plan", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function requestWhatIf(planId: string, scenario: "rain" | "late" | "budget" | "traffic") {
  return apiJson<{ basePlan: string; scenario: string; title: string; changes: string[]; score: number }>(
    "/api/agent/what-if",
    { method: "POST", body: JSON.stringify({ planId, scenario }) },
  );
}

// ── Actions API ──

export interface ActionItem {
  id: string;
  planId: string;
  optionId: string;
  type: string;
  status: string;
  title: string;
  description: string;
  confirmationRequired: boolean;
  priceEstimate?: string;
}

export async function getActions(planId?: string): Promise<{ items: ActionItem[] }> {
  const qs = planId ? `?planId=${encodeURIComponent(planId)}` : "";
  return apiJson<{ items: ActionItem[] }>(`/api/actions${qs}`);
}

export async function quoteAction(actionId: string): Promise<ActionItem> {
  return apiJson<ActionItem>(`/api/actions/${actionId}/quote`, { method: "POST" });
}

export async function confirmAction(actionId: string): Promise<ActionItem> {
  return apiJson<ActionItem>(`/api/actions/${actionId}/confirm`, {
    method: "POST",
    body: JSON.stringify({ userConfirmed: true }),
  });
}

export async function cancelAction(actionId: string): Promise<ActionItem> {
  return apiJson<ActionItem>(`/api/actions/${actionId}/cancel`, { method: "POST" });
}

// ── Calendar ──

export async function createIcs(title: string, date?: string): Promise<string> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (_authToken) headers.authorization = `Bearer ${_authToken}`;
  const response = await fetch(`${API_BASE}/api/ics`, {
    method: "POST",
    headers,
    body: JSON.stringify({ title, date }),
  });
  return response.text();
}

export async function createReservation(input: { type: string; title: string; status?: string; price?: string; detail: string }) {
  return apiJson("/api/reservations", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function advanceExecution() {
  return apiJson<{ traceId: string; steps: unknown[] }>("/api/execution/advance", { method: "POST" });
}

export async function updatePermission(key: string, allowed: boolean) {
  return apiJson<Record<string, boolean>>("/api/profile/demo/permissions", {
    method: "PATCH",
    body: JSON.stringify({ key, allowed }),
  });
}

export async function createShareRoom(input: { planId: string; title: string; members: Array<{ name: string; vote?: string; comment?: string }> }) {
  return apiJson("/api/share/rooms", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// ── Profile: 人物画像 ──

export async function getProfileBundle(): Promise<ProfileBundle> {
  return apiJson<ProfileBundle>("/api/profile/me");
}

export async function updateProfile(input: { displayName?: string; city?: string; startPoint?: string }) {
  return apiJson("/api/profile/me", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function getPersona(): Promise<PersonaData> {
  return apiJson<PersonaData>("/api/profile/me/persona");
}

export async function updatePersona(input: Partial<PersonaData>) {
  return apiJson("/api/profile/me/persona", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

// ── Profile: 记忆与洞察 ──

export async function getMemories(): Promise<MemoryInsight[]> {
  return apiJson<MemoryInsight[]>("/api/memories");
}

export async function addMemory(input: { category: string; title: string; detail: string; weight: number }) {
  return apiJson("/api/memories", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateMemory(id: string, input: Partial<{ category: string; title: string; detail: string; weight: number }>) {
  return apiJson(`/api/memories/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deleteMemory(id: string) {
  return apiJson(`/api/memories/${id}`, { method: "DELETE" });
}

export async function getInsights(): Promise<AiInsight[]> {
  return apiJson<AiInsight[]>("/api/profile/me/insights");
}

// ── Profile: 同行人 ──

export async function getCompanions(): Promise<CompanionProfile[]> {
  return apiJson<CompanionProfile[]>("/api/profile/me/companions");
}

export async function addCompanion(input: Omit<CompanionProfile, "id">) {
  return apiJson("/api/profile/me/companions", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateCompanion(id: string, input: Partial<CompanionProfile>) {
  return apiJson(`/api/profile/me/companions/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deleteCompanion(id: string) {
  return apiJson(`/api/profile/me/companions/${id}`, { method: "DELETE" });
}

// ── Profile: 历史与评分 ──

export async function getPlanHistory(page = 1, pageSize = 20): Promise<{ items: PlanHistoryItem[]; total: number }> {
  return apiJson(`/api/profile/me/history?page=${page}&pageSize=${pageSize}`);
}

export async function ratePlan(id: string, rating: number, favorite?: boolean) {
  return apiJson(`/api/plans/${id}/rating`, {
    method: "POST",
    body: JSON.stringify({ rating, favorite }),
  });
}

// ── Profile: 通知中心 ──

export async function getNotifications(page = 1, pageSize = 20): Promise<{ items: NotificationItem[]; total: number; unread: number }> {
  return apiJson(`/api/notifications?page=${page}&pageSize=${pageSize}`);
}

export async function markNotificationRead(id: string) {
  return apiJson(`/api/notifications/${id}/read`, { method: "PATCH" });
}

export async function markAllNotificationsRead() {
  return apiJson("/api/notifications/read-all", { method: "POST" });
}

export async function deleteNotification(id: string) {
  return apiJson(`/api/notifications/${id}`, { method: "DELETE" });
}

export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  return apiJson<NotificationPreferences>("/api/notifications/preferences");
}

export async function updateNotificationPreferences(input: Partial<NotificationPreferences>) {
  return apiJson("/api/notifications/preferences", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

// ── Profile: 隐私与安全 ──

export async function getPermissions(): Promise<PermissionSettings> {
  return apiJson<PermissionSettings>("/api/profile/me/permissions");
}

export async function updatePermissions(input: Partial<PermissionSettings>) {
  return apiJson("/api/profile/me/permissions", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function getSessions(): Promise<SessionInfo[]> {
  const res = await apiJson<{ sessions: SessionInfo[] } | SessionInfo[]>("/api/auth/sessions");
  return Array.isArray(res) ? res : res.sessions ?? [];
}

export async function revokeSession(id: string) {
  return apiJson(`/api/auth/sessions/${id}`, { method: "DELETE" });
}

export async function clearMemory() {
  return apiJson("/api/privacy/memory", { method: "DELETE" });
}

export async function exportPrivacy() {
  return apiJson("/api/privacy/export", { method: "POST" });
}

export async function deleteAccount() {
  return apiJson("/api/privacy/account", { method: "DELETE" });
}

export async function updateAccount(input: { displayName?: string; city?: string; startPoint?: string }) {
  return apiJson("/api/account", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

// ── Profile: 开发者模式 ──

export async function getDeveloperDashboard(): Promise<DeveloperDashboard> {
  return apiJson<DeveloperDashboard>("/api/developer/dashboard");
}

// -- Developer Apps --
export async function getDeveloperApps(): Promise<DeveloperApp[]> {
  return apiJson<DeveloperApp[]>("/api/developer/apps");
}

export async function createDeveloperApp(input: {
  name: string;
  description?: string;
  environment?: string;
  callbackDomain?: string;
}): Promise<DeveloperApp> {
  return apiJson<DeveloperApp>("/api/developer/apps", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateDeveloperApp(id: string, input: {
  name?: string;
  description?: string;
  environment?: string;
  callbackDomain?: string;
  status?: string;
}): Promise<DeveloperApp> {
  return apiJson<DeveloperApp>(`/api/developer/apps/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deleteDeveloperApp(id: string) {
  return apiJson(`/api/developer/apps/${id}`, { method: "DELETE" });
}

// -- API Keys --
export async function getApiKeys(): Promise<DeveloperApiKey[]> {
  return apiJson<DeveloperApiKey[]>("/api/developer/api-keys");
}

export async function createApiKey(input: {
  name: string;
  appId?: string;
  scopes?: string[];
  environment?: string;
  expiresIn?: string;
}): Promise<DeveloperApiKey> {
  return apiJson<DeveloperApiKey>("/api/developer/api-keys", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function revokeApiKey(id: string): Promise<DeveloperApiKey> {
  return apiJson<DeveloperApiKey>(`/api/developer/api-keys/${id}/revoke`, {
    method: "POST",
  });
}

export async function revokeAllApiKeys(): Promise<{ revokedCount: number }> {
  return apiJson("/api/developer/api-keys/revoke-all", { method: "POST" });
}

// -- Usage --
export async function getDeveloperUsage(range = "7d"): Promise<DeveloperUsage> {
  return apiJson<DeveloperUsage>(`/api/developer/usage?range=${range}`);
}

// -- Request Logs --
export async function getDeveloperRequestLogs(params: {
  page?: number;
  pageSize?: number;
  status?: string;
  path?: string;
  traceId?: string;
} = {}): Promise<{ items: DeveloperRequestLog[]; total: number; page: number; pageSize: number }> {
  const qs = new URLSearchParams();
  if (params.page) qs.set("page", String(params.page));
  if (params.pageSize) qs.set("pageSize", String(params.pageSize));
  if (params.status) qs.set("status", params.status);
  if (params.path) qs.set("path", params.path);
  if (params.traceId) qs.set("traceId", params.traceId);
  return apiJson(`/api/developer/request-logs?${qs.toString()}`);
}

export async function getDeveloperRequestLog(id: string): Promise<DeveloperRequestLog> {
  return apiJson<DeveloperRequestLog>(`/api/developer/request-logs/${id}`);
}

// -- Webhooks --
export async function getWebhooks(): Promise<DeveloperWebhook[]> {
  return apiJson<DeveloperWebhook[]>("/api/developer/webhooks");
}

export async function createWebhook(input: {
  url: string;
  events: string[];
  appId?: string;
}): Promise<DeveloperWebhook> {
  return apiJson<DeveloperWebhook>("/api/developer/webhooks", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateWebhook(id: string, input: {
  url?: string;
  events?: string[];
  enabled?: boolean;
  appId?: string;
}): Promise<DeveloperWebhook> {
  return apiJson<DeveloperWebhook>(`/api/developer/webhooks/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deleteWebhook(id: string) {
  return apiJson(`/api/developer/webhooks/${id}`, { method: "DELETE" });
}

export async function testWebhook(id: string): Promise<WebhookDelivery> {
  return apiJson<WebhookDelivery>(`/api/developer/webhooks/${id}/test`, {
    method: "POST",
  });
}

export async function replayWebhook(id: string): Promise<WebhookDelivery> {
  return apiJson<WebhookDelivery>(`/api/developer/webhooks/${id}/replay`, {
    method: "POST",
  });
}

export async function getWebhookDeliveries(webhookId?: string, limit = 50): Promise<WebhookDelivery[]> {
  const qs = new URLSearchParams();
  if (webhookId) qs.set("webhookId", webhookId);
  qs.set("limit", String(limit));
  return apiJson<WebhookDelivery[]>(`/api/developer/webhook-deliveries?${qs.toString()}`);
}

export async function rotateWebhookSecret(id: string): Promise<DeveloperWebhook> {
  return apiJson<DeveloperWebhook>(`/api/developer/webhooks/${id}/rotate-secret`, {
    method: "POST",
  });
}

// -- Sandbox --
export async function runDeveloperSandbox(input: {
  endpoint: string;
  method?: string;
  body?: Record<string, unknown>;
}): Promise<DeveloperSandboxResult> {
  return apiJson<DeveloperSandboxResult>("/api/developer/sandbox/run", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// -- Security --
export async function getDeveloperSecurity(): Promise<DeveloperSecurity> {
  return apiJson<DeveloperSecurity>("/api/developer/security");
}

// ── 兼容旧方法名 ──
export const listApiKeys = getApiKeys;
export const createNewApiKey = (name: string) => createApiKey({ name });
export const listWebhooks = getWebhooks;
export const getWebhookDeliveriesByWebhook = getWebhookDeliveries;
export const getToolLogs = (page = 1, pageSize = 20) =>
  getDeveloperRequestLogs({ page, pageSize });

// ── Location: 逆地理编码 ──

export interface ReverseGeocodeResult {
  city: string;
  district: string;
  address: string;
  formattedAddress: string;
}

export async function reverseGeocode(lat: number, lng: number): Promise<ReverseGeocodeResult> {
  return apiJson<ReverseGeocodeResult>(`/api/location/reverse-geocode?lat=${lat}&lng=${lng}`);
}
