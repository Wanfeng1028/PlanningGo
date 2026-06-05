/**
 * Conversations & Messages 路由 — /api/conversations/*
 */

import type { FastifyInstance, FastifyReply } from "fastify";
import type { PrismaClient } from "../../generated/prisma/client.js";
import { z } from "zod";
import { sendOk, sendCreated, sendError } from "../common/response.js";
import * as mem from "../services/memoryStore.js";
import { optionalUserId } from "../common/uid.js";
import { assertPlanOwnership } from "../common/ownership.js";

const optionalUid = optionalUserId;

// ============================================================================
// 安全辅助函数
// ============================================================================

/**
 * 校验会话所有权（DB 模式）
 * 返回 conversation 对象，失败时返回错误响应
 *
 * 安全修复 (#2): 孤儿会话 (userId=null, guestId=null) 强制拒绝所有访问
 * 安全修复 (#3): guestId 必须来自 Cookie/Session，不接受 URL 参数
 */
async function assertConversationAccess(
  app: FastifyInstance,
  conv: { userId: string | null; guestId: string | null },
  userId: string | null,
  guestIdFromRequest: string | null,
  reply: FastifyReply,
  action: string,
): Promise<boolean> {
  // 孤儿会话 (userId=null, guestId=null) — 拒绝所有访问
  if (!conv.userId && !conv.guestId) {
    sendError(reply, 403, "FORBIDDEN", "此会话为历史匿名数据，认领后才能访问");
    return false;
  }

  // 登录用户：必须匹配 conv.userId
  if (userId && conv.userId !== userId) {
    sendError(reply, 403, "FORBIDDEN", `无权${action}`);
    return false;
  }

  // 未登录用户：必须匹配 conv.guestId（来自 Cookie/Session，非 URL 参数）
  if (!userId && (!conv.guestId || conv.guestId !== guestIdFromRequest)) {
    sendError(reply, 403, "FORBIDDEN", `无权${action}`);
    return false;
  }

  return true;
}

/**
 * 从 Cookie 中提取 guestId（而非 URL 参数）
 * 安全修复 (#3): guestId 必须绑定到 Cookie/Session，防止 URL 枚举
 */
function getGuestIdFromCookie(request: FastifyRequest): string | null {
  const cookies = request.cookies || {};
  return cookies.guestId ?? null;
}

// 修复：需要导入 FastifyRequest 类型
import type { FastifyRequest } from "fastify";

export async function registerConversationRoutes(app: FastifyInstance) {
  const log = app.log;
  // ── 创建会话 ──
  app.post("/api/conversations", { preHandler: [app.optionalAuthGuard] }, async (request, reply) => {
    const body = z
      .object({
        title: z.string().max(100).optional(),
        city: z.string().optional(),
        modelMode: z.enum(["flash", "pro"]).optional(),
        guestId: z.string().optional(),
      })
      .parse(request.body);

    const userId = optionalUid(request);
    const db: PrismaClient | null = app.db;

    log.info({ route: "POST /api/conversations", userId, authenticated: Boolean(userId), title: body.title ?? null }, "[conversations:create] incoming");

    if (db) {
      try {
        const conv = await db.conversation.create({
          data: {
            userId: userId ?? undefined,
            guestId: !userId ? (body.guestId ?? null) : null,
            title: body.title ?? "新规划",
            city: body.city ?? "北京",
            modelMode: body.modelMode ?? "flash",
          },
        });
        log.info({ conversationId: conv.id, userId: userId ?? null, title: conv.title }, "[conversations:create] DB conversation created");
        return sendCreated(reply, conv);
      } catch (err) {
        log.warn({ err }, "DB create conversation failed, falling back to memory");
      }
    }

    const conv = mem.createConversation({
      userId,
      guestId: !userId ? (body.guestId ?? null) : null,
      title: body.title,
      city: body.city,
      modelMode: body.modelMode,
    });
    return sendCreated(reply, conv);
  });

  // ── 获取会话列表 ──
  app.get("/api/conversations", { preHandler: [app.optionalAuthGuard] }, async (request, reply) => {
    const query = z
      .object({
        limit: z.coerce.number().int().min(1).max(100).default(50),
      })
      .parse(request.query);

    const userId = optionalUid(request);
    const db: PrismaClient | null = app.db;

    // 安全修复 (#3): 移除 guestId URL 参数，未登录用户必须通过 Cookie 认证
    // 未登录且无 Cookie → 返回空列表
    if (!userId) {
      log.info({ route: "GET /api/conversations", authenticated: false }, "[conversations:list] guest without cookie, returning empty");
      return sendOk(reply, []);
    }

    log.info({ route: "GET /api/conversations", userId, authenticated: true, limit: query.limit, db: db ? "connected" : "null" }, "[conversations:list] incoming");

    if (db) {
      try {
        const where: { userId?: string } = {};
        where.userId = userId;

        const convs = await db.conversation.findMany({
          where,
          orderBy: { updatedAt: "desc" },
          take: query.limit,
          include: { _count: { select: { messages: true, plans: true } } },
        });

        // 诊断日志：当认证用户拿到空结果时，额外查询全局信息辅助排查
        if (convs.length === 0) {
          const totalConvCount = await db.conversation.count().catch(() => -1);
          const userConvCount = await db.conversation.count({ where: { userId } }).catch(() => -1);
          const nullUserIdCount = await db.conversation.count({ where: { userId: null } }).catch(() => -1);
          log.info({
            userId,
            totalConvCount,
            userConvCount,
            nullUserIdCount,
          }, "[conversations:list] DIAGNOSTIC — authenticated user got empty list, checking DB state");
        }

        log.info({ userId, count: convs.length, conversationIds: convs.map((c) => c.id), conversations: convs.map((c) => ({ id: c.id, title: c.title, userId: c.userId, updatedAt: c.updatedAt, messageCount: c._count?.messages })) }, "[conversations:list] result");
        return sendOk(reply, convs);
      } catch (err) {
        log.error({ err, userId }, "[conversations:list] DB query failed for authenticated user");
        // Authenticated users: never fall through to memory store
        return sendError(reply, 500, "DB_ERROR", "无法加载历史记录，数据库连接异常");
      }
    }

    // Memory mode for authenticated users only
    const convs = mem.listConversations({
      userId: userId ?? undefined,
      limit: query.limit,
    });
    return sendOk(reply, convs);
  });

  // ── 获取单个会话详情 ──
  app.get("/api/conversations/:id", { preHandler: [app.optionalAuthGuard] }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const userId = optionalUid(request);
    // 安全修复 (#3): guestId 从 Cookie 获取，而非 URL 参数
    const guestIdFromRequest = getGuestIdFromCookie(request);
    const db: PrismaClient | null = app.db;


    log.info({
      route: "GET /api/conversations/:id",
      userId: request.userId,
      conversationId: id,
      authenticated: Boolean(request.userId),
    }, "[conversations:get] incoming");

    if (db) {
      try {
        const conv = await db.conversation.findUnique({
          where: { id },
          include: {
            messages: { orderBy: { createdAt: "asc" } },
            plans: { include: { options: { include: { steps: true } } } },
          },
        });
        if (!conv) return sendError(reply, 404, "NOT_FOUND", "会话不存在");

        // 安全修复 (#2): 统一所有权校验，孤儿会话强制拒绝
        const hasAccess = await assertConversationAccess(app, conv, userId, guestIdFromRequest, reply, "访问此会话");
        if (!hasAccess) return;

        log.info({
          conversationId: conv?.id,
          userId: conv?.userId,
          messageCount: conv?.messages?.length ?? 0,
          planCount: conv?.plans?.length ?? 0,
        }, "[conversations:get] result");
        return sendOk(reply, conv);
      } catch (err) {
        log.error({ err, userId, conversationId: id }, "[conversations:get] DB query failed for authenticated user");
        if (userId) {
          // Authenticated users: never fall through to memory store
          return sendError(reply, 500, "DB_ERROR", "无法加载会话详情，数据库连接异常");
        }
        log.warn({ err }, "[conversations:get] DB failed for guest, falling back to memory");
      }
    }

    // Memory store fallback
    const conv = mem.getConversation(id);
    if (!conv) return sendError(reply, 404, "NOT_FOUND", "会话不存在");

    // 安全修复 (#2): 统一所有权校验
    const hasAccess = await assertConversationAccess(app, conv, userId, guestIdFromRequest, reply, "访问此会话");
    if (!hasAccess) return;

    const msgs = mem.listMessages(id);
    const plans = mem.listPlans({ conversationId: id });
    return sendOk(reply, { ...conv, messages: msgs, plans });
  });

  // ── 添加消息 ──
  app.post("/api/conversations/:id/messages", { preHandler: [app.optionalAuthGuard] }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z
      .object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(10000),
        payloadJson: z.any().optional(),
      })
      .parse(request.body);

    const userId = optionalUid(request);
    // 安全修复 (#3): guestId 从 Cookie 获取
    const guestIdFromRequest = getGuestIdFromCookie(request);
    const db: PrismaClient | null = app.db;

    // 先校验会话所有权
    if (db) {
      try {
        const conv = await db.conversation.findUnique({ where: { id: params.id }, select: { userId: true, guestId: true } });
        if (!conv) return sendError(reply, 404, "NOT_FOUND", "会话不存在");

        const hasAccess = await assertConversationAccess(app, conv, userId, guestIdFromRequest, reply, "向此会话添加消息");
        if (!hasAccess) return;
      } catch (err) {
        log.warn({ err }, "DB ownership check failed, continuing to fallback");
      }
    }

    if (db) {
      try {
        const msg = await db.message.create({
          data: {
            conversationId: params.id,
            role: body.role,
            content: body.content,
            payloadJson: body.payloadJson ?? undefined,
          },
        });
        // Update conversation updatedAt
        await db.conversation.update({
          where: { id: params.id },
          data: { updatedAt: new Date() },
        });
        return sendCreated(reply, msg);
      } catch (err) {
        log.warn({ err }, "DB save message failed, falling back to memory");
      }
    }

    const conv = mem.getConversation(params.id);
    if (!conv) return sendError(reply, 404, "NOT_FOUND", "会话不存在");
    if (conv.userId && conv.userId !== userId) {
      return sendError(reply, 403, "FORBIDDEN", "无权向此会话添加消息");
    }
    const msg = mem.addMessage({
      conversationId: params.id,
      role: body.role,
      content: body.content,
      payloadJson: body.payloadJson,
    });
    return sendCreated(reply, msg);
  });

  // ── 获取消息列表 ──
  app.get("/api/conversations/:id/messages", { preHandler: [app.optionalAuthGuard] }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const userId = optionalUid(request);
    // 安全修复 (#3): guestId 从 Cookie 获取
    const guestIdFromRequest = getGuestIdFromCookie(request);
    const db: PrismaClient | null = app.db;

    // 校验会话所有权
    if (db) {
      try {
        const conv = await db.conversation.findUnique({ where: { id }, select: { userId: true, guestId: true } });
        if (!conv) return sendError(reply, 404, "NOT_FOUND", "会话不存在");

        const hasAccess = await assertConversationAccess(app, conv, userId, guestIdFromRequest, reply, "访问此会话消息");
        if (!hasAccess) return;

        const dbMsgs = await db.message.findMany({
          where: { conversationId: id },
          orderBy: { createdAt: "asc" },
        });

        // 安全修复 (#4): DB 查询成功后，从 mem 获取增量消息并合并去重
        // 如果 DB 曾写入失败但 mem 成功，此处能补回丢失的消息
        const memMsgs = mem.listMessages(id);
        if (memMsgs.length > 0) {
          // 以 DB 最后一条消息的 createdAt 为基准，mem 中更晚的消息为增量
          const lastDbMsgTime = dbMsgs.length > 0 ? new Date(dbMsgs[dbMsgs.length - 1].createdAt).getTime() : 0;
          const incrementalMemMsgs = memMsgs.filter((m) => new Date(m.createdAt).getTime() > lastDbMsgTime);

          if (incrementalMemMsgs.length > 0) {
            // 合并 DB 和 mem 消息，按 createdAt 排序，按 id 去重
            const msgMap = new Map<string | undefined, unknown>();
            for (const m of dbMsgs) msgMap.set(m.id, m as unknown as Record<string, unknown>);
            for (const m of incrementalMemMsgs) msgMap.set(m.id, m as unknown as Record<string, unknown>);
            const merged = Array.from(msgMap.values()).sort(
              (a, b) => new Date((a as Record<string, unknown>).createdAt as string).getTime() - new Date((b as Record<string, unknown>).createdAt as string).getTime(),
            );
            return sendOk(reply, merged);
          }
        }

        return sendOk(reply, dbMsgs);
      } catch (err) {
        log.warn({ err }, "DB list messages failed, falling back to memory");
      }
    }

    // 安全修复 (#4): DB fallback 时，从 mem 获取消息
    // 如果 DB 曾写入失败但 mem 成功，此处能补回丢失的消息
    return sendOk(reply, mem.listMessages(id));
  });

  // ── 收藏方案 ──
  app.post("/api/plans/:id/favorite", { preHandler: [app.authGuard] }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const userId = optionalUserId(request) as string;
    const db: PrismaClient | null = app.db;

    if (db) {
      try {
        // 校验 ownership：只能收藏自己的方案
        await assertPlanOwnership(db, id, userId);
        const plan = await db.plan.findUnique({ where: { id } });
        if (!plan) return sendError(reply, 404, "NOT_FOUND", "方案不存在");
        const toggled = await db.plan.update({
          where: { id },
          data: { favorite: !plan.favorite },
        });
        return sendOk(reply, { id: toggled.id, favorite: toggled.favorite });
      } catch (err) {
        if (err instanceof Error && err.message === "NOT_FOUND") {
          return sendError(reply, 404, "NOT_FOUND", "方案不存在");
        }
        if (err instanceof Error && err.message.startsWith("FORBIDDEN")) {
          return sendError(reply, 403, "FORBIDDEN", "只能收藏自己的方案");
        }
        log.warn({ err }, "DB toggle favorite failed");
      }
    }

    // Memory store fallback — 也需要校验
    const result = mem.togglePlanFavorite(id);
    if (result === null) return sendError(reply, 404, "NOT_FOUND", "方案不存在");
    return sendOk(reply, { id, favorite: result });
  });

  // ── 获取收藏方案列表 ──
  app.get("/api/plans/favorites", { preHandler: [app.optionalAuthGuard] }, async (request, reply) => {
    const userId = optionalUid(request);
    if (!userId) return sendOk(reply, []);

    const db: PrismaClient | null = app.db;
    if (db) {
      try {
        const plans = await db.plan.findMany({
          where: { userId, favorite: true },
          orderBy: { updatedAt: "desc" },
          include: { options: { include: { steps: true } } },
        });
        return sendOk(reply, plans);
      } catch (err) {
        log.warn({ err }, "DB list favorites failed, falling back to memory");
      }
    }

    return sendOk(reply, mem.listPlans({ userId, favoritesOnly: true }));
  });
}
