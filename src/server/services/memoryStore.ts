/**
 * 内存存储 — 当 PostgreSQL 不可用时的 fallback
 * 提供 User、Profile、RefreshToken 的内存实现
 */

import { randomUUID } from "node:crypto";
import { hashPassword, comparePassword, signAccessToken, signRefreshToken, verifyRefreshToken } from "../common/crypto.js";
import crypto from "node:crypto";

interface MemoryUser {
  id: string;
  email: string;
  passwordHash: string | null;
  displayName: string;
  role: string;
  mode: string;
  status: string;
  createdAt: Date;
}

interface MemoryRefreshToken {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  userAgent?: string;
  ipAddress?: string;
}

interface MemoryProfile {
  userId: string;
  city: string;
  startPoint: string;
  homeLat: number | null;
  homeLng: number | null;
  companions: string;
  budgetMin: number;
  budgetMax: number;
  locationLabel?: string;
  locationSource?: string;
}

interface MemoryPermission {
  userId: string;
  locationEnabled: boolean;
  memoryEnabled: boolean;
  calendarEnabled: boolean;
  shareEnabled: boolean;
  developerEnabled: boolean;
}

interface MemoryNotificationPrefs {
  userId: string;
  departureReminder: boolean;
  reservationReminder: boolean;
  shareFeedback: boolean;
  weatherAlert: boolean;
  planExpiry: boolean;
  emailEnabled: boolean;
  browserEnabled: boolean;
  calendarEnabled: boolean;
}

const users = new Map<string, MemoryUser>();
const tokens = new Map<string, MemoryRefreshToken>();
const profiles = new Map<string, MemoryProfile>();
const permissions = new Map<string, MemoryPermission>();
const notifPrefs = new Map<string, MemoryNotificationPrefs>();

const MAX_ENTRIES = 5000;
const CLEANUP_BATCH = 500;

function enforceCapacity<K, V>(store: Map<K, V>, max = MAX_ENTRIES): void {
  if (store.size <= max) return;
  const it = store.keys();
  for (let i = 0; i < CLEANUP_BATCH; i++) {
    const k = it.next().value;
    if (k !== undefined) store.delete(k);
  }
}

// ── 新增：对话/消息/执行动作/事件/错误 日志 ──

interface MemoryGuestSession {
  guestId: string;
  city: string;
  createdAt: Date;
  expiresAt: Date;
}

interface MemoryConversation {
  id: string;
  userId: string | null;
  guestId: string | null;
  title: string;
  city: string;
  modelMode: string;
  createdAt: Date;
  updatedAt: Date;
}

interface MemoryMessage {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  payloadJson: unknown | null;
  createdAt: Date;
}

interface MemoryExecAction {
  id: string;
  planId: string;
  type: string;
  title: string;
  description: string;
  status: string;
  priceEstimate: string | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}

interface MemoryPlan {
  id: string;
  userId: string;
  conversationId: string | null;
  status: string;
  title: string;
  summary: string;
  favorite: boolean;
  options: unknown[];
  execActions: MemoryExecAction[];
  createdAt: Date;
  updatedAt: Date;
}

interface MemoryUserEvent {
  id: string;
  userId: string | null;
  guestId: string | null;
  conversationId: string | null;
  eventName: string;
  eventPayloadJson: unknown;
  page: string;
  traceId: string;
  createdAt: Date;
}

interface MemoryErrorLog {
  id: string;
  userId: string | null;
  guestId: string | null;
  traceId: string;
  route: string;
  message: string;
  stack: string | null;
  payloadJson: unknown | null;
  createdAt: Date;
}

const guestSessions = new Map<string, MemoryGuestSession>();
const conversations = new Map<string, MemoryConversation>();
const messages = new Map<string, MemoryMessage[]>();
const memPlans = new Map<string, MemoryPlan>();
const userEvents: MemoryUserEvent[] = [];
const errorLogs: MemoryErrorLog[] = [];

// ── 预置演示账号 ──
const DEMO_USER_ID = "demo_user_001";

async function ensureDemoUser() {
  if (users.has(DEMO_USER_ID)) return;
  const passwordHash = await hashPassword("weekend123");
  const user: MemoryUser = {
    id: DEMO_USER_ID,
    email: "xiaoming@example.com",
    passwordHash,
    displayName: "小明",
    role: "user",
    mode: "registered",
    status: "active",
    createdAt: new Date(),
  };
  users.set(user.id, user);
  profiles.set(user.id, {
    userId: user.id,
    city: "杭州",
    startPoint: "浙大紫金港",
    homeLat: 30.3080,
    homeLng: 120.0980,
    companions: "family",
    budgetMin: 200,
    budgetMax: 500,
  });
  permissions.set(user.id, {
    userId: user.id,
    locationEnabled: true,
    memoryEnabled: true,
    calendarEnabled: false,
    shareEnabled: true,
    developerEnabled: false,
  });
}

// 初始化演示账号
ensureDemoUser();

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function parseExpiresIn(value: string): Date {
  const match = value.match(/^(\d+)(s|m|h|d)$/);
  if (!match) return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const num = parseInt(match[1], 10);
  const unit = match[2];
  const multipliers: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return new Date(Date.now() + num * (multipliers[unit] ?? 86_400_000));
}

// ── 用户操作 ──

export function findUserByEmail(email: string): MemoryUser | undefined {
  return Array.from(users.values()).find((u) => u.email === email);
}

export function findUserById(id: string): MemoryUser | undefined {
  return users.get(id);
}

export function createUser(data: {
  email: string;
  passwordHash?: string;
  displayName?: string;
  role?: string;
  mode?: string;
}): MemoryUser {
  const user: MemoryUser = {
    id: randomUUID(),
    email: data.email,
    passwordHash: data.passwordHash ?? null,
    displayName: data.displayName ?? "周末用户",
    role: data.role ?? "user",
    mode: data.mode ?? "registered",
    status: "active",
    createdAt: new Date(),
  };
  users.set(user.id, user);
  enforceCapacity(users);
  return user;
}

// ── Token 操作 ──

export function createRefreshToken(data: {
  userId: string;
  token: string;
  userAgent?: string;
  ipAddress?: string;
}): MemoryRefreshToken {
  const rt: MemoryRefreshToken = {
    id: randomUUID(),
    userId: data.userId,
    tokenHash: hashToken(data.token),
    expiresAt: parseExpiresIn(process.env.JWT_REFRESH_EXPIRES_IN ?? "7d"),
    revokedAt: null,
    userAgent: data.userAgent,
    ipAddress: data.ipAddress,
  };
  tokens.set(rt.id, rt);
  enforceCapacity(tokens);
  return rt;
}

export function findRefreshTokenByHash(tokenHash: string): MemoryRefreshToken | undefined {
  return Array.from(tokens.values()).find(
    (t) => t.tokenHash === tokenHash && !t.revokedAt && t.expiresAt > new Date(),
  );
}

export function revokeRefreshTokenById(id: string): void {
  const rt = tokens.get(id);
  if (rt) rt.revokedAt = new Date();
}

export function revokeAllRefreshTokens(userId: string): void {
  for (const rt of tokens.values()) {
    if (rt.userId === userId && !rt.revokedAt) {
      rt.revokedAt = new Date();
    }
  }
}

// ── Profile 操作 ──

export function getProfile(userId: string): MemoryProfile | undefined {
  return profiles.get(userId);
}

export function upsertProfile(userId: string, data: Partial<MemoryProfile>): MemoryProfile {
  const existing = profiles.get(userId);
  const profile: MemoryProfile = {
    userId,
    city: data.city ?? existing?.city ?? "北京",
    startPoint: data.startPoint ?? existing?.startPoint ?? "家附近",
    homeLat: data.homeLat ?? existing?.homeLat ?? null,
    homeLng: data.homeLng ?? existing?.homeLng ?? null,
    companions: data.companions ?? existing?.companions ?? "family",
    budgetMin: data.budgetMin ?? existing?.budgetMin ?? 200,
    budgetMax: data.budgetMax ?? existing?.budgetMax ?? 300,
    locationLabel: data.locationLabel ?? existing?.locationLabel,
    locationSource: data.locationSource ?? existing?.locationSource,
  };
  profiles.set(userId, profile);
  return profile;
}

export function getPermissions(userId: string): MemoryPermission {
  return permissions.get(userId) ?? {
    userId,
    locationEnabled: true,
    memoryEnabled: true,
    calendarEnabled: false,
    shareEnabled: true,
    developerEnabled: false,
  };
}

export function upsertPermissions(userId: string, data: Partial<MemoryPermission>): MemoryPermission {
  const existing = getPermissions(userId);
  const perm: MemoryPermission = { ...existing, ...data, userId };
  permissions.set(userId, perm);
  return perm;
}

// ── 通知偏好操作 ──

export function getNotificationPrefs(userId: string): MemoryNotificationPrefs {
  return notifPrefs.get(userId) ?? {
    userId,
    departureReminder: true,
    reservationReminder: true,
    shareFeedback: true,
    weatherAlert: true,
    planExpiry: true,
    emailEnabled: false,
    browserEnabled: true,
    calendarEnabled: false,
  };
}

export function upsertNotificationPrefs(userId: string, data: Partial<MemoryNotificationPrefs>): MemoryNotificationPrefs {
  const existing = getNotificationPrefs(userId);
  const prefs: MemoryNotificationPrefs = { ...existing, ...data, userId };
  notifPrefs.set(userId, prefs);
  return prefs;
}

// ── 完整登录流程 ──

export async function login(email: string, password: string, meta?: { userAgent?: string; ipAddress?: string }) {
  const user = findUserByEmail(email);
  if (!user || !user.passwordHash) throw new Error("邮箱或密码错误");
  if (user.status !== "active") throw new Error("账号已被禁用");

  const valid = await comparePassword(password, user.passwordHash);
  if (!valid) throw new Error("邮箱或密码错误");

  return issueTokens(user, meta);
}

export async function register(email: string, password: string, displayName?: string, meta?: { userAgent?: string; ipAddress?: string }) {
  if (findUserByEmail(email)) throw new Error("该邮箱已被注册");

  const passwordHash = await hashPassword(password);
  const user = createUser({ email, passwordHash, displayName: displayName ?? email.split("@")[0] });
  upsertProfile(user.id, {});
  upsertPermissions(user.id, {});

  return issueTokens(user, meta);
}

export async function guestLogin(meta?: { userAgent?: string; ipAddress?: string }, profile?: {
  city?: string;
  startPoint?: string;
  companions?: string;
  budgetMin?: number;
  budgetMax?: number;
  homeLat?: number;
  homeLng?: number;
  locationLabel?: string;
  locationSource?: string;
}) {
  const user = createUser({
    email: `guest-${randomUUID().slice(0, 8)}@planninggo.local`,
    displayName: profile?.locationLabel ?? "体验用户",
    mode: "guest",
  });
  upsertProfile(user.id, {
    city: profile?.city ?? "北京",
    startPoint: profile?.startPoint ?? "家附近",
    companions: profile?.companions ?? "family",
    budgetMin: profile?.budgetMin ?? 200,
    budgetMax: profile?.budgetMax ?? 300,
    homeLat: profile?.homeLat,
    homeLng: profile?.homeLng,
    locationLabel: profile?.locationLabel,
    locationSource: profile?.locationSource as "browser" | "manual" | "default" | undefined,
  });
  upsertPermissions(user.id, {});

  return issueTokens(user, meta);
}

export async function demoLogin(meta?: { userAgent?: string; ipAddress?: string }) {
  return login("xiaoming@example.com", "weekend123", meta);
}

async function issueTokens(user: MemoryUser, meta?: { userAgent?: string; ipAddress?: string }) {
  const jti = crypto.randomUUID();
  const accessToken = signAccessToken({ sub: user.id, email: user.email, role: user.role });
  const refreshToken = signRefreshToken({ sub: user.id, jti });

  createRefreshToken({ userId: user.id, token: refreshToken, ...meta });

  return {
    user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role },
    accessToken,
    refreshToken,
  };
}

export function refreshTokens(oldRefreshToken: string, meta?: { userAgent?: string; ipAddress?: string }) {
  try {
    const payload = verifyRefreshToken(oldRefreshToken);
    const tokenHash = hashToken(oldRefreshToken);
    const stored = findRefreshTokenByHash(tokenHash);
    if (!stored) return null;

    revokeRefreshTokenById(stored.id);

    const user = findUserById(payload.sub);
    if (!user || user.status !== "active") return null;

    return issueTokens(user, meta);
  } catch {
    return null;
  }
}

export function getFullProfile(userId: string) {
  const user = findUserById(userId);
  if (!user) return null;
  const profile = getProfile(userId);
  const perm = getPermissions(userId);

  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    mode: user.mode,
    createdAt: user.createdAt.toISOString(),
    city: profile?.city ?? "北京",
    startPoint: profile?.startPoint ?? "家附近",
    homeLat: profile?.homeLat ?? undefined,
    homeLng: profile?.homeLng ?? undefined,
    companions: profile?.companions ?? "family",
    budgetMin: profile?.budgetMin ?? 200,
    budgetMax: profile?.budgetMax ?? 300,
    preferences: [],
    familyInfo: [],
    permissions: {
      location: perm.locationEnabled,
      memory: perm.memoryEnabled,
      calendar: perm.calendarEnabled,
      share: perm.shareEnabled,
      developer: perm.developerEnabled,
    },
  };
}

// ═══════════════════════════════════════════════════
// Guest Sessions
// ═══════════════════════════════════════════════════

export function upsertGuestSession(guestId: string, city?: string): MemoryGuestSession {
  const existing = guestSessions.get(guestId);
  if (existing) {
    if (city) existing.city = city;
    return existing;
  }
  const gs: MemoryGuestSession = {
    guestId,
    city: city ?? "北京",
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  };
  guestSessions.set(guestId, gs);
  enforceCapacity(guestSessions);
  return gs;
}

export function getGuestSession(guestId: string): MemoryGuestSession | undefined {
  return guestSessions.get(guestId);
}

// ═══════════════════════════════════════════════════
// Conversations
// ═══════════════════════════════════════════════════

export function createConversation(data: {
  userId?: string | null;
  guestId?: string | null;
  title?: string;
  city?: string;
  modelMode?: string;
}): MemoryConversation {
  const conv: MemoryConversation = {
    id: randomUUID(),
    userId: data.userId ?? null,
    guestId: data.guestId ?? null,
    title: data.title ?? "新规划",
    city: data.city ?? "北京",
    modelMode: data.modelMode ?? "flash",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  conversations.set(conv.id, conv);
  messages.set(conv.id, []);
  enforceCapacity(conversations);
  enforceCapacity(messages);
  return conv;
}

export function getConversation(id: string): MemoryConversation | undefined {
  return conversations.get(id);
}

export function listConversations(opts: {
  userId?: string;
  guestId?: string;
  limit?: number;
}): MemoryConversation[] {
  const limit = opts.limit ?? 50;
  return Array.from(conversations.values())
    .filter((c) => {
      if (opts.userId && c.userId === opts.userId) return true;
      if (opts.guestId && c.guestId === opts.guestId) return true;
      return false;
    })
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .slice(0, limit);
}

export function updateConversationTitle(id: string, title: string): void {
  const conv = conversations.get(id);
  if (conv) {
    conv.title = title;
    conv.updatedAt = new Date();
  }
}

// ═══════════════════════════════════════════════════
// Messages
// ═══════════════════════════════════════════════════

export function addMessage(data: {
  conversationId: string;
  role: string;
  content: string;
  payloadJson?: any;
}): MemoryMessage {
  const msg: MemoryMessage = {
    id: randomUUID(),
    conversationId: data.conversationId,
    role: data.role,
    content: data.content,
    payloadJson: data.payloadJson ?? null,
    createdAt: new Date(),
  };
  const list = messages.get(data.conversationId) ?? [];
  list.push(msg);
  messages.set(data.conversationId, list);
  // Update conversation updatedAt
  const conv = conversations.get(data.conversationId);
  if (conv) conv.updatedAt = new Date();
  return msg;
}

export function listMessages(conversationId: string): MemoryMessage[] {
  return messages.get(conversationId) ?? [];
}

// ═══════════════════════════════════════════════════
// Plans (memory mode)
// ═══════════════════════════════════════════════════

export function createPlan(data: {
  userId: string;
  conversationId?: string;
  title: string;
  summary?: string;
  options?: any[];
  execActions?: MemoryExecAction[];
}): MemoryPlan {
  const plan: MemoryPlan = {
    id: randomUUID(),
    userId: data.userId,
    conversationId: data.conversationId ?? null,
    status: "completed",
    title: data.title,
    summary: data.summary ?? "",
    favorite: false,
    options: data.options ?? [],
    execActions: data.execActions ?? [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  memPlans.set(plan.id, plan);
  enforceCapacity(memPlans);
  return plan;
}

export function getPlan(id: string): MemoryPlan | undefined {
  return memPlans.get(id);
}

export function listPlans(opts: {
  userId?: string;
  conversationId?: string;
  favoritesOnly?: boolean;
  limit?: number;
}): MemoryPlan[] {
  const limit = opts.limit ?? 50;
  return Array.from(memPlans.values())
    .filter((p) => {
      if (opts.userId && p.userId !== opts.userId) return false;
      if (opts.conversationId && p.conversationId !== opts.conversationId) return false;
      if (opts.favoritesOnly && !p.favorite) return false;
      return true;
    })
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limit);
}

export function togglePlanFavorite(id: string): boolean | null {
  const plan = memPlans.get(id);
  if (!plan) return null;
  plan.favorite = !plan.favorite;
  plan.updatedAt = new Date();
  return plan.favorite;
}

// ═══════════════════════════════════════════════════
// Execution Actions (memory mode)
// ═══════════════════════════════════════════════════

export function updateExecActionStatus(
  id: string,
  status: string,
): MemoryExecAction | null {
  for (const plan of memPlans.values()) {
    const action = plan.execActions.find((a) => a.id === id);
    if (action) {
      action.status = status;
      action.updatedAt = new Date();
      return action;
    }
  }
  return null;
}

export function getExecAction(id: string): MemoryExecAction | null {
  for (const plan of memPlans.values()) {
    const action = plan.execActions.find((a) => a.id === id);
    if (action) return action;
  }
  return null;
}

// ═══════════════════════════════════════════════════
// User Events
// ═══════════════════════════════════════════════════

export function trackEvent(data: {
  userId?: string | null;
  guestId?: string | null;
  conversationId?: string | null;
  eventName: string;
  eventPayloadJson?: any;
  page?: string;
  traceId?: string;
}): MemoryUserEvent {
  const evt: MemoryUserEvent = {
    id: randomUUID(),
    userId: data.userId ?? null,
    guestId: data.guestId ?? null,
    conversationId: data.conversationId ?? null,
    eventName: data.eventName,
    eventPayloadJson: data.eventPayloadJson ?? {},
    page: data.page ?? "",
    traceId: data.traceId ?? "",
    createdAt: new Date(),
  };
  userEvents.push(evt);
  // Cap at 5000 entries
  if (userEvents.length > 5000) userEvents.splice(0, userEvents.length - 5000);
  return evt;
}

// ═══════════════════════════════════════════════════
// Client Error Logs
// ═══════════════════════════════════════════════════

export function logClientError(data: {
  userId?: string | null;
  guestId?: string | null;
  traceId?: string;
  route?: string;
  message: string;
  stack?: string | null;
  payloadJson?: any;
}): MemoryErrorLog {
  const log: MemoryErrorLog = {
    id: randomUUID(),
    userId: data.userId ?? null,
    guestId: data.guestId ?? null,
    traceId: data.traceId ?? "",
    route: data.route ?? "",
    message: data.message,
    stack: data.stack ?? null,
    payloadJson: data.payloadJson ?? null,
    createdAt: new Date(),
  };
  errorLogs.push(log);
  if (errorLogs.length > 2000) errorLogs.splice(0, errorLogs.length - 2000);
  return log;
}
