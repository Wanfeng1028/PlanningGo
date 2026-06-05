/**
 * Execution 路由
 */

import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { listExecutionSteps, advanceExecution, updateExecutionStep } from "../services/store.js";
import { baseToolLogs } from "../data/mockData.js";
import { NotFoundError } from "../common/errors.js";
import { sendOk, sendError } from "../common/response.js";
import { optionalUserId } from "../common/uid.js";
import type { PrismaClient } from "../../generated/prisma/client.js";

/**
 * 从 Cookie 中提取 guestId（而非 URL 参数）
 * 安全修复 (#3): guestId 必须绑定到 Cookie/Session，防止 URL 枚举
 */
function getGuestIdFromCookie(request: FastifyRequest): string | null {
  const cookies = request.cookies || {};
  return cookies.guestId ?? null;
}

/**
 * 校验 executionStep 所属 conversation 的归属权
 * 返回 true 表示有权限，false 表示已发送错误响应
 */
async function assertExecutionAccess(
  db: PrismaClient,
  executionKey: string,
  userId: string | null,
  guestIdFromRequest: string | null,
  action: string,
): Promise<boolean> {
  const step = await db.executionStep.findUnique({
    where: { id: executionKey },
    select: { conversationId: true },
  });
  if (!step) throw new NotFoundError("EXECUTION_STEP_NOT_FOUND");

  const conv = await db.conversation.findUnique({
    where: { id: step.conversationId },
    select: { userId: true, guestId: true },
  });
  if (!conv) throw new NotFoundError("CONVERSATION_NOT_FOUND");

  // 孤儿会话 (userId=null, guestId=null) — 拒绝所有访问
  if (!conv.userId && !conv.guestId) {
    return false;
  }

  // 登录用户：必须匹配 conv.userId
  if (userId && conv.userId !== userId) {
    return false;
  }

  // 未登录用户：必须匹配 conv.guestId（来自 Cookie/Session，非 URL 参数）
  if (!userId || !conv.guestId || conv.guestId !== guestIdFromRequest) {
    return false;
  }

  return true;
}

export async function registerExecutionRoutes(app: FastifyInstance) {
  app.get("/api/execution/demo", { preHandler: [app.optionalAuthGuard] }, async () => ({
    traceId: "exec_demo",
    steps: listExecutionSteps(),
  }));

  app.post("/api/execution/advance", { preHandler: [app.optionalAuthGuard] }, async () => ({
    traceId: "exec_demo",
    steps: advanceExecution(),
  }));

  // PATCH /api/execution/:key — 修改执行步骤状态
  // 安全修复 (#1): 必须校验 executionStep 所属 conversation 的归属权
  // 原接口使用 optionalAuthGuard 且无任何所有权校验，攻击者可遍历 key 强制中断他人执行流程
  app.patch("/api/execution/:key", { preHandler: [app.authGuard] }, async (request, reply) => {
    const params = z.object({ key: z.string() }).parse(request.params);
    const body = z.object({ status: z.enum(["pending", "running", "done", "failed"]) }).parse(request.body);
    const userId = optionalUserId(request);
    const db: PrismaClient | null = app.db;

    // 内存模式：要求登录用户身份，防止暴力枚举 key
    if (!db) {
      if (!userId) {
        return sendError(reply, 401, "UNAUTHORIZED", "内存模式下必须登录");
      }
      const next = updateExecutionStep(params.key, body.status);
      if (!next) throw new NotFoundError("EXECUTION_STEP_NOT_FOUND");
      return sendOk(reply, next);
    }

    // DB 模式：统一使用 assertExecutionAccess 校验归属
    const guestIdFromRequest = getGuestIdFromCookie(request);
    try {
      const hasAccess = await assertExecutionAccess(db, params.key, userId, guestIdFromRequest, "修改执行步骤");
      if (!hasAccess) {
        return sendError(reply, 403, "FORBIDDEN", "无权修改此执行步骤");
      }

      const next = updateExecutionStep(params.key, body.status);
      if (!next) throw new NotFoundError("EXECUTION_STEP_NOT_FOUND");
      return sendOk(reply, next);
    } catch (err) {
      if (err instanceof NotFoundError) throw err;
      app.log.error({ err, key: params.key }, "[execution:patch] DB query failed");
      throw err;
    }
  });

  app.get("/api/tools/logs", { preHandler: [app.optionalAuthGuard] }, async () => ({
    traceId: "demo_trace",
    logs: baseToolLogs,
  }));
}
