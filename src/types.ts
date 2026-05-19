import type { LucideIcon } from "lucide-react";

export type NavKey = "home" | "features" | "cases" | "developers" | "profile";

export type ModalKey =
  | "login"
  | "register"
  | "guest"
  | "contact"
  | "identity"
  | "location"
  | "reservation"
  | "ticket"
  | "payment"
  | "vote"
  | "privacy"
  | "apiKey";

export interface NavItem {
  key: NavKey;
  label: string;
}

export interface ModalContent {
  key: ModalKey;
  title: string;
  eyebrow: string;
  body: string;
  primary: string;
  secondary: string;
  bullets: string[];
}

export interface FlowItem {
  title: string;
  desc: string;
  source: string;
  mode: "page" | "modal" | "drawer" | "sheet" | "state";
  modal?: ModalKey;
}

export interface SectionBlock {
  id: string;
  eyebrow: string;
  title: string;
  intro: string;
  icon: LucideIcon;
  items: FlowItem[];
}

export interface CaseCard {
  title: string;
  desc: string;
  tags: string[];
  metric: string;
}

export interface TimelineItem {
  time: string;
  title: string;
  desc: string;
  status: "done" | "active" | "pending";
}

export interface SessionUser {
  id: string;
  name: string;
  mode: "guest" | "registered";
  city: string;
  locationLabel?: string;
  latitude?: number;
  longitude?: number;
  locationSource?: "browser" | "manual" | "default";
}

/** 游客快速画像输入 */
export interface GuestProfileInput {
  city: string;
  startPoint: string;
  companions: "family" | "friends" | "couple" | "solo";
  budgetMin: number;
  budgetMax: number;
  homeLat?: number;
  homeLng?: number;
  locationLabel?: string;
  locationSource?: "browser" | "manual" | "default";
}

/** 浏览器定位结果 */
export interface CurrentLocation {
  latitude: number;
  longitude: number;
  accuracy?: number;
  label?: string;
}

/** 定位权限状态 */
export type LocationPermissionState = "prompt" | "granted" | "denied" | "unavailable" | "loading";

// ── 个人中心类型 ──

export interface PersonaData {
  displayName: string;
  city: string;
  startPoint: string;
  homeLat?: number;
  homeLng?: number;
  locationLabel?: string;
  locationSource?: "browser" | "manual" | "default";
  secondaryStartPoints: string[];
  favoriteAreas: string[];
  defaultTimeWindow: string;
  transportMode: string;
  distanceLimitKm: number;
  walkingTolerance: string;
  queueTolerance: string;
  pace: string;
  indoorPreference: string;
  budgetMin: number;
  budgetMax: number;
  dietPreference: string[];
  avoidFoods: string[];
  healthGoal: string;
  dinnerTimePreference: string;
  activityTags: string[];
  avoidActivityTags: string[];
  riskPreference: string;
}

export interface CompanionProfile {
  id: string;
  type: string;
  name: string;
  relation: string;
  ageGroup: string;
  preferences: string[];
  avoid: string[];
  mobility: string;
  diet: string;
  notes: string;
  isDefault: boolean;
}

export interface MemoryInsight {
  id: string;
  category: string;
  title: string;
  detail: string;
  weight: number;
  source: string;
  updatedAt: string;
}

export interface AiInsight {
  id: string;
  text: string;
  confidence: number;
}

export interface PlanHistoryItem {
  id: string;
  title: string;
  summary: string;
  status: string;
  companions: string;
  city: string;
  budget: string;
  rating: number | null;
  favorite: boolean;
  tags: string[];
  createdAt: string;
}

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

export interface NotificationPreferences {
  departureReminder: boolean;
  reservationReminder: boolean;
  shareFeedback: boolean;
  weatherAlert: boolean;
  planExpiry: boolean;
  emailEnabled: boolean;
  browserEnabled: boolean;
  calendarEnabled: boolean;
}

export interface PermissionSettings {
  locationEnabled: boolean;
  memoryEnabled: boolean;
  calendarEnabled: boolean;
  shareEnabled: boolean;
  developerEnabled: boolean;
}

export interface SessionInfo {
  id: string;
  userAgent: string;
  ipAddress: string;
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
}

// ── 开发者中心类型 ──

export interface DeveloperApp {
  id: string;
  name: string;
  description: string;
  environment: string;
  callbackDomain: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface DeveloperApiKey {
  id: string;
  name: string;
  prefix: string;
  key?: string;
  scopes: string[];
  status: string;
  environment: string;
  appId: string | null;
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface DeveloperDashboard {
  summary: {
    todayCalls: number;
    monthCalls: number;
    remainingQuota: number;
    averageLatencyMs: number;
    p95LatencyMs: number;
    errorRate: number;
    successRate: number;
    webhookSuccessRate: number;
    activeKeys: number;
    activeWebhooks: number;
    environment: string;
  };
  lastSuccess: {
    path: string;
    statusCode: number;
    latencyMs: number;
    createdAt: string;
  } | null;
  lastError: {
    path: string;
    statusCode: number;
    latencyMs: number;
    errorCode: string | null;
    createdAt: string;
  } | null;
}

export interface DeveloperUsage {
  todayCalls: number;
  monthCalls: number;
  averageLatencyMs: number;
  p95LatencyMs: number;
  errorRate: number;
  successRate: number;
  breakdown: Array<{ path: string; count: number }>;
  daily: Array<{
    id: string;
    date: string;
    calls: number;
    errors: number;
    avgLatencyMs: number;
    p95LatencyMs: number;
  }>;
}

export interface DeveloperRequestLog {
  id: string;
  method: string;
  path: string;
  statusCode: number;
  latencyMs: number;
  traceId: string;
  errorCode: string | null;
  apiKeyPrefix: string;
  appId: string | null;
  createdAt: string;
  requestPreview?: Record<string, unknown>;
  responsePreview?: Record<string, unknown>;
}

export interface DeveloperWebhook {
  id: string;
  url: string;
  events: string[];
  enabled: boolean;
  appId: string | null;
  secret?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  event: string;
  payload: Record<string, unknown>;
  status: string;
  responseStatus: number | null;
  latencyMs: number | null;
  errorMessage: string | null;
  attemptCount: number;
  createdAt: string;
}

export interface DeveloperSecurity {
  activeKeys: number;
  totalKeys: number;
  activeWebhooks: number;
  totalWebhooks: number;
  recentAudits: Array<{
    action: string;
    resourceType: string;
    createdAt: string;
    traceId: string;
  }>;
  ipAllowlist: string[] | null;
  ipAllowlistEnabled: boolean;
}

export interface DeveloperSandboxResult {
  traceId: string;
  statusCode: number;
  latencyMs: number;
  body: unknown;
}

// 兼容旧类型
export type ApiKeyInfo = DeveloperApiKey;
export type WebhookInfo = DeveloperWebhook;
export type ToolLogItem = {
  id: string;
  traceId: string;
  toolName: string;
  status: string;
  latencyMs: number;
  createdAt: string;
};

export interface ProfileStats {
  planCount: number;
  memoryCount: number;
  favoriteCount: number;
  unreadNotifications: number;
  personaCompleteness: number;
}

export interface ProfileBundle {
  user: {
    id: string;
    email: string;
    displayName: string;
    mode: string;
    role: string;
    createdAt: string;
  };
  profile: PersonaData;
  permissions: PermissionSettings;
  stats: ProfileStats;
}
