/**
 * Privacy 路由 — 数据导出、记忆清除、账号删除
 */

import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "../../generated/prisma/client.js";
import { sendOk, sendNoContent } from "../common/response.js";
import { AppError } from "../common/errors.js";

export async function registerPrivacyRoutes(app: FastifyInstance) {
  if (!app.db) {
    app.post("/api/privacy/export", { preHandler: [app.authGuard] }, async (_req, reply) => sendOk(reply, { user: {}, profile: {}, plans: [], memories: [], actions: [] }));
    app.delete("/api/privacy/memories", { preHandler: [app.authGuard] }, async (_req, reply) => sendOk(reply, { deleted: 0 }));
    return;
  }
  const db = app.db;

  // POST /api/privacy/export — 导出用户数据
  app.post("/api/privacy/export", { preHandler: [app.authGuard] }, async (request, reply) => {
    const userId = request.userId!;

    const [user, profile, permissions, plans, memories, companions, notifications, sessions, apiKeys, webhooks] =
      await Promise.all([
        db.user.findUnique({
          where: { id: userId },
          select: { id: true, email: true, displayName: true, role: true, mode: true, createdAt: true },
        }),
        db.userProfile.findUnique({ where: { userId } }),
        db.userPermission.findUnique({ where: { userId } }),
        db.plan.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }),
        db.memory.findMany({ where: { userId, deletedAt: null } }),
        db.companion.findMany({ where: { userId } }),
        db.notification.findMany({ where: { userId } }),
        db.userSession.findMany({ where: { userId }, select: { id: true, userAgent: true, ipAddress: true, createdAt: true, lastSeenAt: true } }),
        db.apiKey.findMany({ where: { userId }, select: { id: true, name: true, prefix: true, status: true, createdAt: true } }),
        db.webhook.findMany({ where: { userId }, select: { id: true, url: true, events: true, enabled: true, createdAt: true } }),
      ]);

    sendOk(reply, {
      exportedAt: new Date().toISOString(),
      user, profile, permissions, plans, memories, companions, notifications, sessions, apiKeys, webhooks,
    });
  });

  // DELETE /api/privacy/memory — 清除长期记忆（软删除）
  app.delete("/api/privacy/memory", { preHandler: [app.authGuard] }, async (request, reply) => {
    const userId = request.userId!;
    const result = await db.memory.updateMany({
      where: { userId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    sendOk(reply, { cleared: result.count });
  });

  // 兼容旧路径
  app.delete("/api/privacy/memories", { preHandler: [app.authGuard] }, async (request, reply) => {
    const userId = request.userId!;
    const result = await db.memory.updateMany({
      where: { userId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    sendOk(reply, { cleared: result.count });
  });

  // DELETE /api/privacy/account — 删除账号（级联删除所有数据）
  app.delete("/api/privacy/account", { preHandler: [app.authGuard] }, async (request, reply) => {
    const userId = request.userId!;

    try {
      await db.$transaction([
        db.webhookDelivery.deleteMany({ where: { webhook: { userId } } }),
        db.webhook.deleteMany({ where: { userId } }),
        db.apiKey.deleteMany({ where: { userId } }),
        db.auditLog.deleteMany({ where: { userId } }),
        db.llmCallLog.deleteMany({ where: { userId } }),
        db.toolCallLog.deleteMany({ where: { userId } }),
        db.requestLog.deleteMany({ where: { userId } }),
        db.developerUsageDaily.deleteMany({ where: { userId } }),
        db.notification.deleteMany({ where: { userId } }),
        db.notificationPreference.deleteMany({ where: { userId } }),
        db.userSession.deleteMany({ where: { userId } }),
        db.companion.deleteMany({ where: { userId } }),
        db.memory.deleteMany({ where: { userId } }),
        db.plan.deleteMany({ where: { userId } }),
        db.action.deleteMany({ where: { userId } }),
        db.reservation.deleteMany({ where: { userId } }),
        db.executionStep.deleteMany({ where: { userId } }),
        db.shareRoom.deleteMany({ where: { userId } }),
        db.userProfile.deleteMany({ where: { userId } }),
        db.userPermission.deleteMany({ where: { userId } }),
        db.refreshToken.deleteMany({ where: { userId } }),
        db.user.delete({ where: { id: userId } }),
      ]);
    } catch (err) {
      app.log.error({ err, userId }, "Account deletion failed");
      throw new AppError("账户删除失败，请稍后重试", 500, "DELETION_FAILED");
    }

    // 清除 cookie 使当前会话失效
    reply.clearCookie("refresh_token", { path: "/" });
    sendNoContent(reply);
  });
}
