/**
 * Conversations & Messages 路由 — /api/conversations/*
 */

import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "../../generated/prisma/client.js";
import { z } from "zod";
import { sendOk, sendCreated, sendNoContent, sendError } from "../common/response.js";
import { UnauthorizedError } from "../common/errors.js";
import * as mem from "../services/memoryStore.js";
import { optionalUserId } from "../common/uid.js";

const optionalUid = optionalUserId;

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
        guestId: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(50),
      })
      .parse(request.query);

    const userId = optionalUid(request);
    const db: PrismaClient | null = app.db;

    if (db) {
      try {
        const where: { userId?: string; guestId?: string } = {};
        if (userId) where.userId = userId;
        else if (query.guestId) where.guestId = query.guestId;
        else return sendOk(reply, []);

        const convs = await db.conversation.findMany({
          where,
          orderBy: { updatedAt: "desc" },
          take: query.limit,
          include: { _count: { select: { messages: true, plans: true } } },
        });
        return sendOk(reply, convs);
      } catch (err) {
        log.warn({ err }, "DB list conversations failed, falling back to memory");
      }
    }

    const convs = mem.listConversations({
      userId: userId ?? undefined,
      guestId: !userId ? query.guestId : undefined,
      limit: query.limit,
    });
    return sendOk(reply, convs);
  });

  // ── 获取单个会话详情 ──
  app.get("/api/conversations/:id", { preHandler: [app.optionalAuthGuard] }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const userId = optionalUid(request);
    const guestId = userId ? null : ((request.query as Record<string, string | undefined>).guestId ?? null);
    const db: PrismaClient | null = app.db;

    if (db) {
      try {
        const conv = await db.conversation.findUnique({
          where: { id },
          include: {
            messages: { orderBy: { createdAt: "asc" } },
            plans: { include: { options: { include: { steps: true } }, execActions: true } },
          },
        });
        if (!conv) return sendError(reply, 404, "NOT_FOUND", "会话不存在");
        // 校验会话所有权
        if (conv.userId && conv.userId !== userId) {
          return sendError(reply, 403, "FORBIDDEN", "无权访问此会话");
        }
        if (!conv.userId && conv.guestId && conv.guestId !== guestId) {
          return sendError(reply, 403, "FORBIDDEN", "无权访问此会话");
        }
        return sendOk(reply, conv);
      } catch (err) {
        log.warn({ err }, "DB get conversation failed, falling back to memory");
      }
    }

    const conv = mem.getConversation(id);
    if (!conv) return sendError(reply, 404, "NOT_FOUND", "会话不存在");
    if (conv.userId && conv.userId !== userId) {
      return sendError(reply, 403, "FORBIDDEN", "无权访问此会话");
    }
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
    const db: PrismaClient | null = app.db;

    // 先校验会话所有权
    if (db) {
      try {
        const conv = await db.conversation.findUnique({ where: { id: params.id }, select: { userId: true, guestId: true } });
        if (!conv) return sendError(reply, 404, "NOT_FOUND", "会话不存在");
        if (conv.userId && conv.userId !== userId) {
          return sendError(reply, 403, "FORBIDDEN", "无权向此会话添加消息");
        }
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
    const db: PrismaClient | null = app.db;

    // 校验会话所有权
    if (db) {
      try {
        const conv = await db.conversation.findUnique({ where: { id }, select: { userId: true } });
        if (!conv) return sendError(reply, 404, "NOT_FOUND", "会话不存在");
        if (conv.userId && conv.userId !== userId) {
          return sendError(reply, 403, "FORBIDDEN", "无权访问此会话消息");
        }
        const msgs = await db.message.findMany({
          where: { conversationId: id },
          orderBy: { createdAt: "asc" },
        });
        return sendOk(reply, msgs);
      } catch (err) {
        log.warn({ err }, "DB list messages failed, falling back to memory");
      }
    }

    return sendOk(reply, mem.listMessages(id));
  });

  // ── 收藏方案 ──
  app.post("/api/plans/:id/favorite", { preHandler: [app.optionalAuthGuard] }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const db: PrismaClient | null = app.db;

    if (db) {
      try {
        const plan = await db.plan.findUnique({ where: { id } });
        if (!plan) return sendError(reply, 404, "NOT_FOUND", "方案不存在");
        const updated = await db.plan.update({
          where: { id },
          data: { favorite: !plan.favorite },
        });
        return sendOk(reply, { id: updated.id, favorite: updated.favorite });
      } catch (err) {
        log.warn({ err }, "DB toggle favorite failed, falling back to memory");
      }
    }

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
