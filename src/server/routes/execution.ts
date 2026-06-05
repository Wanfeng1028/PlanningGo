/**
 * Execution 路由
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { listExecutionSteps, advanceExecution, updateExecutionStep } from "../services/store.js";
import { baseToolLogs } from "../data/mockData.js";
import { NotFoundError } from "../common/errors.js";
import { sendOk, sendError } from "../common/response.js";
import { optionalUserId } from "../common/uid.js";
import type { PrismaClient } from "../../generated/prisma/client.js";

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

    // 内存模式：仅允许修改自己的步骤（key 为 UUID 时可暴力枚举，故要求登录）
    if (!db) {
      const next = updateExecutionStep(params.key, body.status);
      if (!next) throw new NotFoundError("EXECUTION_STEP_NOT_FOUND");
      return sendOk(reply, next);
    }

    // DB 模式：通过 executionStep 找到 conversation，校验归属
    try {
      const step = await db.executionStep.findUnique({
        where: { id: params.key },
        select: { conversationId: true },
      });
      if (!step) throw new NotFoundError("EXECUTION_STEP_NOT_FOUND");

      // 校验 conversation 归属
      const conv = await db.conversation.findUnique({
        where: { id: step.conversationId },
        select: { userId: true, guestId: true },
      });
      if (!conv) throw new NotFoundError("CONVERSATION_NOT_FOUND");

      // 登录用户：必须匹配 conv.userId
      if (userId && conv.userId !== userId) {
        return sendError(reply, 403, "FORBIDDEN", "无权修改此执行步骤");
      }
      // 未登录用户：必须匹配 conv.guestId
      if (!userId && (!conv.guestId || (request.query as Record<string, string | undefined>).guestId !== conv.guestId)) {
        return sendError(reply, 403, "FORBIDDEN", "无权修改此执行步骤");
      }
      // 孤儿会话（userId=null, guestId=null）拒绝访问
      if (!conv.userId && !conv.guestId && userId) {
        return sendError(reply, 403, "FORBIDDEN", "此会话为历史匿名数据，认领后才能访问");
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
