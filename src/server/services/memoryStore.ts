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

const users = new Map<string, MemoryUser>();
const tokens = new Map<string, MemoryRefreshToken>();
const profiles = new Map<string, MemoryProfile>();
const permissions = new Map<string, MemoryPermission>();

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
