import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "../../generated/prisma/client.js";
import { z } from "zod";
import {
  sendOk,
  sendCreated,
  sendNoContent,
  sendError,
} from "../common/response.js";
import { NotFoundError } from "../common/errors.js";
import { requireUserId } from "../common/uid.js";
import * as mem from "../services/memoryStore.js";

// ─── Helpers ────────────────────────────────────────────────────────

const uid = requireUserId;

function parseJsonObject(val: unknown): Record<string, unknown> {
  if (typeof val === "string") {
    try { return JSON.parse(val) as Record<string, unknown>; } catch { return {}; }
  }
  return (val && typeof val === "object") ? val as Record<string, unknown> : {};
}

function parseJsonArray(val: unknown): string[] {
  if (Array.isArray(val)) return val as string[];
  if (typeof val === "string") {
    try { return JSON.parse(val) as string[]; } catch { return []; }
  }
  return [];
}

// ─── Profile Formatting ─────────────────────────────────────────────

function formatProfile(profile: Record<string, unknown>, user?: { displayName?: string | null }) {
  return {
    displayName: user?.displayName ?? null,
    city: (profile.city as string) ?? "杭州",
    startPoint: (profile.startPoint as string) ?? "浙大紫金港",
    secondaryStartPoints: parseJsonArray(profile.secondaryStartPoints),
    favoriteAreas: parseJsonArray(profile.favoriteAreas),
    defaultTimeWindow: (profile.defaultTimeWindow as string) ?? "下午14:00-18:00",
    transportMode: (profile.transportMode as string) ?? "any",
    distanceLimitKm: (profile.distanceLimitKm as number) ?? 10,
    walkingTolerance: (profile.walkingTolerance as string) ?? "moderate",
    queueTolerance: (profile.queueTolerance as string) ?? "normal",
    pace: (profile.pace as string) ?? "balanced",
    indoorPreference: (profile.indoorPreference as string) ?? "mixed",
    budgetMin: (profile.budgetMin as number) ?? 0,
    budgetMax: (profile.budgetMax as number) ?? 500,
    dietPreference: parseJsonArray(profile.dietPreference),
    avoidFoods: parseJsonArray(profile.avoidFoods),
    healthGoal: (profile.healthGoal as string) ?? "none",
    dinnerTimePreference: (profile.dinnerTimePreference as string) ?? "18:00-20:00",
    activityTags: parseJsonArray(profile.activityTags),
    avoidActivityTags: parseJsonArray(profile.avoidActivityTags),
    riskPreference: (profile.riskPreference as string) ?? "中性",
    personaCompleteness: (profile.personaCompleteness as number) ?? 0,
  };
}

// ─── Persona Completeness Calculation ───────────────────────────────

function calcPersonaCompleteness(profile: Record<string, unknown>): number {
  let score = 0;
  const checks: [string, (v: unknown) => boolean][] = [
    ["city", (v) => typeof v === "string" && v.length > 0],
    ["startPoint", (v) => typeof v === "string" && v.length > 0],
    ["defaultTimeWindow", (v) => typeof v === "string" && v.length > 0],
    ["transportMode", (v) => typeof v === "string" && v !== "any"],
    ["walkingTolerance", (v) => typeof v === "string" && v.length > 0],
    ["queueTolerance", (v) => typeof v === "string" && v.length > 0],
    ["pace", (v) => typeof v === "string" && v.length > 0],
    ["budgetMax", (v) => typeof v === "number" && v > 0],
    ["dietPreference", (v) => Array.isArray(v) && v.length > 0],
    ["activityTags", (v) => Array.isArray(v) && v.length > 0],
    ["riskPreference", (v) => typeof v === "string" && v.length > 0],
    ["favoriteAreas", (v) => Array.isArray(v) && v.length > 0],
  ];
  for (const [key, check] of checks) {
    if (check(profile[key])) score += Math.floor(100 / checks.length);
  }
  return Math.min(score, 100);
}

// ─── Seed Notifications ─────────────────────────────────────────────

async function seedNotifications(db: PrismaClient, userId: string) {
  const existing = await db.notification.count({ where: { userId } });
  if (existing > 0) return;

  await db.notification.createMany({
    data: [
      {
        userId,
        type: "welcome",
        title: "欢迎使用周末有谱",
        message: "描述你的想法，AI 会为你生成定制方案。",
        read: false,
      },
      {
        userId,
        type: "tip",
        title: "试试 AI 规划",
        message: "完善你的个人画像，获得更精准的推荐。",
        read: false,
      },
      {
        userId,
        type: "system",
        title: "隐私设置提醒",
        message: "你可以在个人中心管理数据权限和隐私选项。",
        read: false,
      },
    ],
  });
}

// ─── Notification Preferences ───────────────────────────────────────

async function ensureNotificationPrefs(db: PrismaClient, userId: string) {
  return db.notificationPreference.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });
}

// ────────────────────────────────────────────────────────────────────
// Route Plugin
// ────────────────────────────────────────────────────────────────────

export async function registerProfileRoutes(app: FastifyInstance) {
  const db: PrismaClient | null = app.db;

  // ── 内存 fallback 模式 ──
  if (!db) {
    app.log.info("📝 Profile routes using in-memory store (no PostgreSQL)");

    // GET /api/profile/me
    app.get("/api/profile/me", { preHandler: [app.authGuard] }, async (request, reply) => {
      const userId = uid(request);
      const profile = mem.getFullProfile(userId);
      if (!profile) return sendError(reply, 404, "USER_NOT_FOUND", "用户不存在");
      sendOk(reply, {
        user: { id: profile.id, email: profile.email, displayName: profile.displayName, mode: profile.mode, role: profile.role, createdAt: profile.createdAt },
        profile: {
          displayName: profile.displayName,
          city: profile.city,
          startPoint: profile.startPoint,
          secondaryStartPoints: [],
          favoriteAreas: [],
          defaultTimeWindow: "下午14:00-18:00",
          transportMode: "any",
          distanceLimitKm: 10,
          walkingTolerance: "moderate",
          queueTolerance: "normal",
          pace: "balanced",
          indoorPreference: "mixed",
          budgetMin: profile.budgetMin,
          budgetMax: profile.budgetMax,
          dietPreference: [],
          avoidFoods: [],
          healthGoal: "none",
          dinnerTimePreference: "18:00-20:00",
          activityTags: [],
          avoidActivityTags: [],
          riskPreference: "中性",
          personaCompleteness: 20,
        },
        permissions: profile.permissions,
        stats: { planCount: 0, memoryCount: 0, favoriteCount: 0, unreadNotifications: 0, personaCompleteness: 20 },
      });
    });

    // PATCH /api/profile/me
    app.patch("/api/profile/me", { preHandler: [app.authGuard] }, async (request, reply) => {
      const userId = uid(request);
      const body = z.object({ displayName: z.string().max(50).optional(), city: z.string().max(50).optional(), startPoint: z.string().max(200).optional() }).parse(request.body);
      if (body.city || body.startPoint) {
        mem.upsertProfile(userId, { city: body.city, startPoint: body.startPoint });
      }
      const profile = mem.getFullProfile(userId);
      sendOk(reply, { city: profile?.city ?? "北京", startPoint: profile?.startPoint ?? "家附近", budgetMin: profile?.budgetMin ?? 200, budgetMax: profile?.budgetMax ?? 300, personaCompleteness: 20 });
    });

    // GET /api/profile/me/persona
    app.get("/api/profile/me/persona", { preHandler: [app.authGuard] }, async (request, reply) => {
      const userId = uid(request);
      const profile = mem.getFullProfile(userId);
      if (!profile) return sendError(reply, 404, "PROFILE_NOT_FOUND", "用户画像不存在");
      sendOk(reply, { city: profile.city, startPoint: profile.startPoint, budgetMin: profile.budgetMin, budgetMax: profile.budgetMax, personaCompleteness: 20 });
    });

    // PATCH /api/profile/me/persona
    app.patch("/api/profile/me/persona", { preHandler: [app.authGuard] }, async (request, reply) => {
      const userId = uid(request);
      const body = z.object({
        city: z.string().optional(),
        startPoint: z.string().optional(),
        budgetMin: z.number().int().optional(),
        budgetMax: z.number().int().optional(),
        companions: z.string().optional(),
        preferences: z.array(z.string()).optional(),
      }).strict().parse(request.body);
      mem.upsertProfile(userId, body);
      const profile = mem.getFullProfile(userId);
      sendOk(reply, { city: profile?.city, startPoint: profile?.startPoint, budgetMin: profile?.budgetMin, budgetMax: profile?.budgetMax, personaCompleteness: 20 });
    });

    // GET /api/profile/me/permissions
    app.get("/api/profile/me/permissions", { preHandler: [app.authGuard] }, async (request, reply) => {
      const userId = uid(request);
      sendOk(reply, mem.getPermissions(userId));
    });

    // PATCH /api/profile/me/permissions
    app.patch("/api/profile/me/permissions", { preHandler: [app.authGuard] }, async (request, reply) => {
      const userId = uid(request);
      const body = z.record(z.string(), z.boolean()).parse(request.body);
      sendOk(reply, mem.upsertPermissions(userId, body));
    });

    // 其他路由返回空数据或 501
    const emptyArrayRoutes = ["/api/profile/me/companions", "/api/notifications", "/api/auth/sessions"];
    for (const route of emptyArrayRoutes) {
      app.get(route, { preHandler: [app.authGuard] }, async (_request, reply) => sendOk(reply, { items: [], total: 0, sessions: [] }));
    }

    app.get("/api/profile/me/insights", { preHandler: [app.authGuard] }, async (_request, reply) => sendOk(reply, { insights: [] }));
    app.get("/api/profile/me/history", { preHandler: [app.authGuard] }, async (_request, reply) => sendOk(reply, { items: [], total: 0 }));

    app.get("/api/notifications/preferences", { preHandler: [app.authGuard] }, async (request, reply) => {
      const userId = uid(request);
      sendOk(reply, mem.getNotificationPrefs(userId));
    });
    app.patch("/api/notifications/preferences", { preHandler: [app.authGuard] }, async (request, reply) => {
      const userId = uid(request);
      const body = z.record(z.string(), z.boolean()).parse(request.body);
      sendOk(reply, mem.upsertNotificationPrefs(userId, body));
    });

    return;
  }

  // Auth is handled per-route via app.authGuard and uid() helper
  // 添加认证 hook 到所有 profile/notifications/account 路由
  const authPrefixes = ["/api/profile/", "/api/notifications", "/api/auth/sessions", "/api/account", "/api/plans/"];
  app.addHook("onRequest", async (request, reply) => {
    const path = request.url.split("?")[0];
    if (authPrefixes.some((p) => path.startsWith(p))) {
      await app.authGuard(request, reply);
    }
  });

  // ──────────────────────────────────────────────────────────────────
  // 1. GET /api/profile/me – Get full profile bundle
  // ──────────────────────────────────────────────────────────────────
  app.get("/api/profile/me", async (request, reply) => {
    const userId = uid(request);

    const [user, profile, permissions] = await Promise.all([
      db.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, displayName: true, mode: true, role: true, createdAt: true },
      }),
      db.userProfile.findUnique({ where: { userId } }),
      db.userPermission.findUnique({ where: { userId } }),
    ]);

    if (!user) throw new NotFoundError("用户不存在", "USER_NOT_FOUND");

    // Seed notifications on first access
    await seedNotifications(db, userId);

    const [planCount, memoryCount, favoriteCount, unreadNotifications] = await Promise.all([
      db.plan.count({ where: { userId } }),
      db.memory.count({ where: { userId, deletedAt: null } }),
      // Favorite count – plan doesn't have favorite field in real schema, count non-draft plans
      db.plan.count({ where: { userId, status: { not: "draft" } } }),
      db.notification.count({ where: { userId, read: false } }),
    ]);

    // Upsert profile if missing
    const safeProfile = profile ?? await db.userProfile.create({ data: { userId } });
    const safePerms = permissions ?? await db.userPermission.create({ data: { userId } });

    sendOk(reply, {
      user,
      profile: formatProfile(safeProfile, user),
      permissions: {
        locationEnabled: safePerms.locationEnabled,
        memoryEnabled: safePerms.memoryEnabled,
        calendarEnabled: safePerms.calendarEnabled,
        shareEnabled: safePerms.shareEnabled,
        developerEnabled: safePerms.developerEnabled,
      },
      stats: {
        planCount,
        memoryCount,
        favoriteCount,
        unreadNotifications,
        personaCompleteness: safeProfile.personaCompleteness,
      },
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // 2. PATCH /api/profile/me – Update profile display info
  // ──────────────────────────────────────────────────────────────────
  app.patch("/api/profile/me", async (request, reply) => {
    const userId = uid(request);
    const body = z.object({
      displayName: z.string().max(50).optional(),
      city: z.string().max(50).optional(),
      startPoint: z.string().max(200).optional(),
    }).parse(request.body);

    // Update user displayName if provided
    if (body.displayName !== undefined) {
      await db.user.update({ where: { id: userId }, data: { displayName: body.displayName } });
    }

    // Update profile
    const profile = await db.userProfile.upsert({
      where: { userId },
      create: {
        userId,
        city: body.city ?? "杭州",
        startPoint: body.startPoint ?? "浙大紫金港",
      },
      update: {
        ...(body.city !== undefined && { city: body.city }),
        ...(body.startPoint !== undefined && { startPoint: body.startPoint }),
      },
    });

    // Recalculate persona completeness
    const completeness = calcPersonaCompleteness(profile as unknown as Record<string, unknown>);
    await db.userProfile.update({ where: { userId }, data: { personaCompleteness: completeness } });

    const user = await db.user.findUnique({ where: { id: userId }, select: { displayName: true } });
    sendOk(reply, formatProfile({ ...profile, personaCompleteness: completeness }, user ?? undefined));
  });

  // ──────────────────────────────────────────────────────────────────
  // 3. GET /api/profile/me/persona – Get persona data
  // ──────────────────────────────────────────────────────────────────
  app.get("/api/profile/me/persona", async (request, reply) => {
    const userId = uid(request);
    const profile = await db.userProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundError("用户画像不存在", "PROFILE_NOT_FOUND");

    sendOk(reply, formatProfile(profile));
  });

  // ──────────────────────────────────────────────────────────────────
  // 4. PATCH /api/profile/me/persona – Update persona preferences
  // ──────────────────────────────────────────────────────────────────
  app.patch("/api/profile/me/persona", async (request, reply) => {
    const userId = uid(request);
    const body = z.object({
      city: z.string().optional(),
      startPoint: z.string().optional(),
      secondaryStartPoints: z.array(z.string()).optional(),
      favoriteAreas: z.array(z.string()).optional(),
      defaultTimeWindow: z.string().optional(),
      transportMode: z.string().optional(),
      distanceLimitKm: z.number().optional(),
      walkingTolerance: z.string().optional(),
      queueTolerance: z.string().optional(),
      pace: z.string().optional(),
      indoorPreference: z.string().optional(),
      budgetMin: z.number().int().optional(),
      budgetMax: z.number().int().optional(),
      dietPreference: z.array(z.string()).optional(),
      avoidFoods: z.array(z.string()).optional(),
      healthGoal: z.string().optional(),
      dinnerTimePreference: z.string().optional(),
      activityTags: z.array(z.string()).optional(),
      avoidActivityTags: z.array(z.string()).optional(),
      riskPreference: z.string().optional(),
    }).parse(request.body);

    const data: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(body)) {
      if (val === undefined) continue;
      if (Array.isArray(val)) {
        data[key] = JSON.stringify(val);
      } else {
        data[key] = val;
      }
    }

    const profile = await db.userProfile.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });

    // Recalculate persona completeness
    const completeness = calcPersonaCompleteness(profile as unknown as Record<string, unknown>);
    await db.userProfile.update({ where: { userId }, data: { personaCompleteness: completeness } });

    sendOk(reply, formatProfile({ ...profile, personaCompleteness: completeness }));
  });

  // ──────────────────────────────────────────────────────────────────
  // 5. GET /api/profile/me/companions – List companions
  // ──────────────────────────────────────────────────────────────────
  app.get("/api/profile/me/companions", async (request, reply) => {
    const userId = uid(request);
    const companions = await db.companion.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    sendOk(reply, companions.map((c) => ({
      ...c,
      preferences: parseJsonArray(c.preferences),
      avoid: parseJsonArray(c.avoid),
      diet: typeof c.diet === "string" ? c.diet : c.diet,
    })));
  });

  // ──────────────────────────────────────────────────────────────────
  // 6. POST /api/profile/me/companions – Create companion
  // ──────────────────────────────────────────────────────────────────
  app.post("/api/profile/me/companions", async (request, reply) => {
    const userId = uid(request);
    const body = z.object({
      type: z.string().default("person"),
      name: z.string().min(1).max(50),
      relation: z.string().default(""),
      ageGroup: z.string().default("adult"),
      preferences: z.array(z.string()).default([]),
      avoid: z.array(z.string()).default([]),
      mobility: z.string().default("normal"),
      diet: z.string().default(""),
      notes: z.string().default(""),
      isDefault: z.boolean().default(false),
    }).parse(request.body);

    const companion = await db.companion.create({
      data: {
        userId,
        type: body.type,
        name: body.name,
        relation: body.relation,
        ageGroup: body.ageGroup,
        preferences: JSON.stringify(body.preferences),
        avoid: JSON.stringify(body.avoid),
        mobility: body.mobility,
        diet: body.diet,
        notes: body.notes,
        isDefault: body.isDefault,
      },
    });

    sendCreated(reply, {
      ...companion,
      preferences: parseJsonArray(companion.preferences),
      avoid: parseJsonArray(companion.avoid),
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // 7. PATCH /api/profile/me/companions/:id – Update companion
  // ──────────────────────────────────────────────────────────────────
  app.patch("/api/profile/me/companions/:id", async (request, reply) => {
    const userId = uid(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({
      type: z.string().optional(),
      name: z.string().min(1).max(50).optional(),
      relation: z.string().optional(),
      ageGroup: z.string().optional(),
      preferences: z.array(z.string()).optional(),
      avoid: z.array(z.string()).optional(),
      mobility: z.string().optional(),
      diet: z.string().optional(),
      notes: z.string().optional(),
      isDefault: z.boolean().optional(),
    }).parse(request.body);

    // Verify ownership
    const existing = await db.companion.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundError("同伴不存在", "COMPANION_NOT_FOUND");

    const data: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(body)) {
      if (val === undefined) continue;
      if (Array.isArray(val)) {
        data[key] = JSON.stringify(val);
      } else {
        data[key] = val;
      }
    }

    const companion = await db.companion.update({ where: { id }, data });
    sendOk(reply, {
      ...companion,
      preferences: parseJsonArray(companion.preferences),
      avoid: parseJsonArray(companion.avoid),
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // 8. DELETE /api/profile/me/companions/:id – Delete companion
  // ──────────────────────────────────────────────────────────────────
  app.delete("/api/profile/me/companions/:id", async (request, reply) => {
    const userId = uid(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);

    const existing = await db.companion.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundError("同伴不存在", "COMPANION_NOT_FOUND");

    await db.companion.delete({ where: { id } });
    sendNoContent(reply);
  });

  // ──────────────────────────────────────────────────────────────────
  // 9. GET /api/profile/me/insights – Get AI insights (mock)
  // ──────────────────────────────────────────────────────────────────
  app.get("/api/profile/me/insights", async (request, reply) => {
    const userId = uid(request);

    const [profile, memories, planCount] = await Promise.all([
      db.userProfile.findUnique({ where: { userId } }),
      db.memory.findMany({ where: { userId, deletedAt: null }, orderBy: { weight: "desc" }, take: 10 }),
      db.plan.count({ where: { userId } }),
    ]);

    const topCategories = memories.reduce<Record<string, number>>((acc, m) => {
      acc[m.category] = (acc[m.category] || 0) + 1;
      return acc;
    }, {});
    const topCategory = Object.entries(topCategories).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "general";

    const completeness = profile?.personaCompleteness ?? 0;

    const insights = [
      {
        id: "insight_activity",
        type: "recommendation",
        title: "活动偏好洞察",
        description: profile
          ? `你偏好 ${parseJsonArray(profile.activityTags).join("、") || "尚未设定"} 类型的活动。完善偏好可获得更精准推荐。`
          : "完善你的活动偏好，获得更精准的周末推荐。",
        icon: "sparkles",
      },
      {
        id: "insight_food",
        type: "recommendation",
        title: "饮食偏好分析",
        description: profile
          ? `你的饮食偏好为 ${parseJsonArray(profile.dietPreference).join("、") || "未设定"}，忌避 ${parseJsonArray(profile.avoidFoods).join("、") || "无"}。`
          : "告诉我们你的饮食偏好，帮你避开不合适的选择。",
        icon: "utensils",
      },
      {
        id: "insight_persona",
        type: "progress",
        title: "画像完成度",
        description: `你的个人画像已完成 ${completeness}%，${completeness >= 80 ? "非常完善" : "还有提升空间"}。`,
        icon: "user",
        progress: completeness,
      },
      {
        id: "insight_memory",
        type: "memory",
        title: "记忆洞察",
        description: memories.length > 0
          ? `你有 ${memories.length} 条长期记忆，最常关注「${topCategory}」领域。`
          : "开始规划周末，系统会自动记录你的偏好。",
        icon: "brain",
      },
      {
        id: "insight_plans",
        type: "stats",
        title: "规划统计",
        description: `你已生成 ${planCount} 个规划方案。${planCount > 5 ? "你是资深规划师！" : "继续探索更多可能性吧。"}`,
        icon: "bar-chart",
      },
    ];

    sendOk(reply, { insights });
  });

  // ──────────────────────────────────────────────────────────────────
  // 10. GET /api/profile/me/history – Get plan history
  // ──────────────────────────────────────────────────────────────────
  app.get("/api/profile/me/history", async (request, reply) => {
    const userId = uid(request);
    const query = z.object({
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(20),
    }).parse(request.query);

    const skip = (query.page - 1) * query.pageSize;

    const [items, total] = await Promise.all([
      db.plan.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        skip,
        take: query.pageSize,
        select: {
          id: true,
          title: true,
          summary: true,
          status: true,
          createdAt: true,
        },
      }),
      db.plan.count({ where: { userId } }),
    ]);

    sendOk(reply, { items, total });
  });

  // ──────────────────────────────────────────────────────────────────
  // 11. POST /api/plans/:id/rating – Rate a plan
  // ──────────────────────────────────────────────────────────────────
  app.post("/api/plans/:id/rating", async (request, reply) => {
    const userId = uid(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({
      rating: z.number().int().min(1).max(5),
      favorite: z.boolean().optional(),
    }).parse(request.body);

    const plan = await db.plan.findFirst({ where: { id, userId } });
    if (!plan) throw new NotFoundError("规划不存在", "PLAN_NOT_FOUND");

    // Store rating in intent metadata (Plan model uses Json intent field)
    const intent = parseJsonObject(plan.intent);
    intent.rating = body.rating;
    if (body.favorite !== undefined) intent.favorite = body.favorite;

    const updated = await db.plan.update({
      where: { id },
      data: { intent: JSON.stringify(intent) },
    });

    sendOk(reply, { id: updated.id, rating: body.rating, favorite: body.favorite ?? false });
  });

  // ──────────────────────────────────────────────────────────────────
  // 12. GET /api/notifications – List notifications
  // ──────────────────────────────────────────────────────────────────
  app.get("/api/notifications", async (request, reply) => {
    const userId = uid(request);

    // Seed notifications on first access
    await seedNotifications(db, userId);

    const query = z.object({
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(20),
    }).parse(request.query);

    const skip = (query.page - 1) * query.pageSize;

    const [items, total, unread] = await Promise.all([
      db.notification.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        skip,
        take: query.pageSize,
      }),
      db.notification.count({ where: { userId } }),
      db.notification.count({ where: { userId, read: false } }),
    ]);

    sendOk(reply, { items, total, unread });
  });

  // ──────────────────────────────────────────────────────────────────
  // 13. PATCH /api/notifications/:id/read – Mark notification read
  // ──────────────────────────────────────────────────────────────────
  app.patch("/api/notifications/:id/read", async (request, reply) => {
    const userId = uid(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);

    const notification = await db.notification.findFirst({ where: { id, userId } });
    if (!notification) throw new NotFoundError("通知不存在", "NOTIFICATION_NOT_FOUND");

    const updated = await db.notification.update({
      where: { id },
      data: { read: true },
    });

    sendOk(reply, updated);
  });

  // ──────────────────────────────────────────────────────────────────
  // 14. DELETE /api/notifications/:id – Delete notification
  // ──────────────────────────────────────────────────────────────────
  app.delete("/api/notifications/:id", async (request, reply) => {
    const userId = uid(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);

    const notification = await db.notification.findFirst({ where: { id, userId } });
    if (!notification) throw new NotFoundError("通知不存在", "NOTIFICATION_NOT_FOUND");

    await db.notification.delete({ where: { id } });
    sendNoContent(reply);
  });

  // ──────────────────────────────────────────────────────────────────
  // 15. GET /api/notifications/preferences – Get notification prefs
  // ──────────────────────────────────────────────────────────────────
  app.get("/api/notifications/preferences", async (request, reply) => {
    const userId = uid(request);
    const prefs = await ensureNotificationPrefs(db, userId);
    sendOk(reply, prefs);
  });

  // ──────────────────────────────────────────────────────────────────
  // 16. PATCH /api/notifications/preferences – Update notification prefs
  // ──────────────────────────────────────────────────────────────────
  app.patch("/api/notifications/preferences", async (request, reply) => {
    const userId = uid(request);
    const body = z.object({
      departureReminder: z.boolean().optional(),
      reservationReminder: z.boolean().optional(),
      shareFeedback: z.boolean().optional(),
      weatherAlert: z.boolean().optional(),
      planExpiry: z.boolean().optional(),
      emailEnabled: z.boolean().optional(),
      browserEnabled: z.boolean().optional(),
      calendarEnabled: z.boolean().optional(),
    }).parse(request.body);

    const prefs = await db.notificationPreference.upsert({
      where: { userId },
      create: { userId, ...body },
      update: body,
    });

    sendOk(reply, prefs);
  });

  // ──────────────────────────────────────────────────────────────────
  // 17. GET /api/profile/me/permissions – Get permission settings
  // ──────────────────────────────────────────────────────────────────
  app.get("/api/profile/me/permissions", async (request, reply) => {
    const userId = uid(request);
    const perms = await db.userPermission.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });

    sendOk(reply, {
      locationEnabled: perms.locationEnabled,
      memoryEnabled: perms.memoryEnabled,
      calendarEnabled: perms.calendarEnabled,
      shareEnabled: perms.shareEnabled,
      developerEnabled: perms.developerEnabled,
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // 18. PATCH /api/profile/me/permissions – Update permissions
  // ──────────────────────────────────────────────────────────────────
  app.patch("/api/profile/me/permissions", async (request, reply) => {
    const userId = uid(request);
    const body = z.object({
      locationEnabled: z.boolean().optional(),
      memoryEnabled: z.boolean().optional(),
      calendarEnabled: z.boolean().optional(),
      shareEnabled: z.boolean().optional(),
      developerEnabled: z.boolean().optional(),
    }).parse(request.body);

    const perms = await db.userPermission.upsert({
      where: { userId },
      create: { userId, ...body },
      update: body,
    });

    sendOk(reply, {
      locationEnabled: perms.locationEnabled,
      memoryEnabled: perms.memoryEnabled,
      calendarEnabled: perms.calendarEnabled,
      shareEnabled: perms.shareEnabled,
      developerEnabled: perms.developerEnabled,
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // 19. GET /api/auth/sessions – List user sessions
  // ──────────────────────────────────────────────────────────────────
  app.get("/api/auth/sessions", async (request, reply) => {
    const userId = uid(request);
    const sessions = await db.userSession.findMany({
      where: { userId, revokedAt: null },
      orderBy: { lastSeenAt: "desc" },
      select: {
        id: true,
        userAgent: true,
        ipAddress: true,
        createdAt: true,
        lastSeenAt: true,
      },
    });

    sendOk(reply, { sessions });
  });

  // ──────────────────────────────────────────────────────────────────
  // 20. DELETE /api/auth/sessions/:id – Revoke a session
  // ──────────────────────────────────────────────────────────────────
  app.delete("/api/auth/sessions/:id", async (request, reply) => {
    const userId = uid(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);

    const session = await db.userSession.findFirst({ where: { id, userId, revokedAt: null } });
    if (!session) throw new NotFoundError("会话不存在", "SESSION_NOT_FOUND");

    await db.userSession.update({
      where: { id },
      data: { revokedAt: new Date() },
    });

    sendNoContent(reply);
  });

  // ──────────────────────────────────────────────────────────────────
  // 21. POST /api/notifications/read-all – Mark all notifications read
  // ──────────────────────────────────────────────────────────────────
  app.post("/api/notifications/read-all", async (request, reply) => {
    const userId = uid(request);

    await db.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });

    sendOk(reply, { success: true });
  });

  // ──────────────────────────────────────────────────────────────────
  // 22. PATCH /api/account – Update account info
  // ──────────────────────────────────────────────────────────────────
  app.patch("/api/account", async (request, reply) => {
    const userId = uid(request);
    const body = z.object({
      displayName: z.string().min(1).max(50).optional(),
    }).parse(request.body);

    const user = await db.user.update({
      where: { id: userId },
      data: { displayName: body.displayName },
      select: { id: true, email: true, displayName: true, mode: true, role: true, createdAt: true },
    });

    sendOk(reply, user);
  });
}

export default registerProfileRoutes;
