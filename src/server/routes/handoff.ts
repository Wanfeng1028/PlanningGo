import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createMobileHandoff, getHandoffByToken, claimHandoff, getHandoffStatus } from "../modules/handoff/qrService";
import { createHandoffCode, getHandoffCode, claimHandoffCode } from "../modules/handoff/handoffCodeService";
import type { PermissionScope } from "../modules/agent/middleware/permissionGuard";
import { sendOk, sendError } from "../common/response.js";
import { optionalUserId, requireUserId } from "../common/uid.js";
import { assertHandoffConversationOwnership } from "../common/ownership.js";
import { sanitizeHandoffCode, shouldStripStack } from "../common/logSanitizer.js";

const uid = requireUserId;

const createHandoffSchema = z.object({
  conversationId: z.string().uuid(),
  planId: z.string().min(1),
  selectedOptionId: z.string().optional(),
  scopes: z.array(z.string()).default([]),
});

const claimHandoffSchema = z.object({
  deviceId: z.string().min(1).max(128),
  guestId: z.string().max(128).optional(),
  grantedScopes: z.array(z.string()).default([]),
});

const authorizeHandoffSchema = z.object({
  scopes: z.array(z.string()).default([]),
});

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function latestPlanPayload(messages: Array<{ role: string; payloadJson: unknown }>) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]!;
    const payload = asRecord(message.payloadJson);
    if (message.role !== "assistant" || payload?.type !== "plan") continue;
    const data = asRecord(payload.data);
    if (data) return data;
  }
  return null;
}

async function buildHandoffDetail(fastify: FastifyInstance, code: string) {
  const handoff = await getHandoffCode(code);
  if (!handoff) return null;

  const db = fastify.db;
  if (!db) throw new Error("Database not available");

  const conversation = await db.conversation.findUnique({
    where: { id: handoff.conversationId },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
        select: { id: true, role: true, content: true, payloadJson: true, createdAt: true },
      },
    },
  });
  if (!conversation) return null;

  const planPayload = latestPlanPayload(conversation.messages);
  const options = asArray(planPayload?.options).filter((option) => asRecord(option));
  const selectedOptionId = conversation.selectedOptionId
    ?? (typeof planPayload?.selectedOptionId === "string" ? planPayload.selectedOptionId : null)
    ?? (typeof handoff.planId === "string" ? null : null);

  const selectedOption = (selectedOptionId
    ? options.find((option) => asRecord(option)?.id === selectedOptionId)
    : null) ?? options[0] ?? null;

  return {
    code: handoff.code,
    conversation: {
      id: conversation.id,
      title: conversation.title,
      city: conversation.city,
      selectedOptionId: conversation.selectedOptionId,
      updatedAt: conversation.updatedAt.toISOString(),
    },
    handoff: {
      conversationId: handoff.conversationId,
      planId: handoff.planId,
      expiresAt: handoff.expiresAt,
    },
    plan: planPayload ? {
      planId: typeof planPayload.planId === "string" ? planPayload.planId : handoff.planId,
      summary: typeof planPayload.summary === "string" ? planPayload.summary : "",
      selectedOptionId,
      selectedOption,
      options,
      executableActions: asArray(planPayload.executableActions),
      planningActions: asArray(planPayload.planningActions),
    } : null,
  };
}

export async function registerHandoffRoutes(fastify: FastifyInstance) {
  /**
   * Create a mobile handoff session
   * POST /api/handoff/mobile
   */
  fastify.post("/api/handoff/mobile", { preHandler: [fastify.authGuard] }, async (request, reply) => {
    const body = createHandoffSchema.parse(request.body);
    const userId = uid(request);
    const guestId = (request.body as Record<string, unknown>)?.guestId as string | undefined;

    // 校验 conversation 归属（防止 BOLA）
    const db = fastify.db;
    if (db) {
      try {
        await assertHandoffConversationOwnership(db, body.conversationId, userId, guestId ?? null);
      } catch (err) {
        if (err instanceof Error && err.message === "HANDOFF_CONVERSATION_NOT_FOUND") {
          return sendError(reply, 404, "CONVERSATION_NOT_FOUND", "会话不存在");
        }
        return sendError(reply, 403, "FORBIDDEN", "无权操作此会话");
      }
    }

    try {
      const result = await createMobileHandoff({
        conversationId: body.conversationId,
        planId: body.planId,
        selectedOptionId: body.selectedOptionId,
        userId,
        scopes: body.scopes as PermissionScope[],
      });

      return sendOk(reply, result);
    } catch (error) {
      fastify.log.error(error);
      return sendError(reply, 500, "HANDOFF_CREATE_FAILED", "创建接续会话失败");
    }
  });

  /**
   * Get handoff session by token
   * GET /api/handoff/mobile/:token
   */
  fastify.get("/api/handoff/mobile/:token", { preHandler: [fastify.optionalAuthGuard] }, async (request, reply) => {
    const { token } = z.object({ token: z.string() }).parse(request.params);

    try {
      const payload = await getHandoffByToken(token);

      if (!payload) {
        return sendError(reply, 404, "HANDOFF_NOT_FOUND", "接续会话不存在或已过期");
      }

      return sendOk(reply, payload);
    } catch (error) {
      fastify.log.error(error);
      return sendError(reply, 500, "HANDOFF_FETCH_FAILED", "获取接续会话失败");
    }
  });

  /**
   * Claim a handoff session (mobile device scans QR code)
   * POST /api/handoff/mobile/:token/claim
   */
  fastify.post("/api/handoff/mobile/:token/claim", { preHandler: [fastify.authGuard] }, async (request, reply) => {
    const { token } = z.object({ token: z.string() }).parse(request.params);
    const body = claimHandoffSchema.parse(request.body);

    try {
      const result = await claimHandoff({
        token,
        deviceId: body.deviceId,
        guestId: body.guestId,
        grantedScopes: body.grantedScopes as PermissionScope[],
      });

      return sendOk(reply, result);
    } catch (error) {
      fastify.log.error(error);
      if (error instanceof Error && error.message.includes("not found")) {
        return sendError(reply, 404, "HANDOFF_NOT_FOUND", "接续会话不存在");
      }
      if (error instanceof Error && error.message.includes("expired")) {
        return sendError(reply, 410, "HANDOFF_EXPIRED", "接续会话已过期");
      }
      return sendError(reply, 500, "HANDOFF_CLAIM_FAILED", "认领会话失败");
    }
  });

  /**
   * Get handoff status
   * GET /api/handoff/mobile/:handoffId/status
   */
  fastify.get("/api/handoff/mobile/:handoffId/status", { preHandler: [fastify.authGuard] }, async (request, reply) => {
    const { handoffId } = z.object({ handoffId: z.string() }).parse(request.params);

    try {
      const status = await getHandoffStatus(handoffId);
      return sendOk(reply, status);
    } catch (error) {
      fastify.log.error(error);
      if (error instanceof Error && error.message.includes("not found")) {
        return sendError(reply, 404, "HANDOFF_NOT_FOUND", "接续会话不存在");
      }
      return sendError(reply, 500, "HANDOFF_STATUS_FAILED", "获取接续状态失败");
    }
  });

  /**
   * Authorize actions for a handoff session
   * POST /api/handoff/mobile/:handoffId/authorize
   */
  fastify.post("/api/handoff/mobile/:handoffId/authorize", { preHandler: [fastify.authGuard] }, async (request, reply) => {
    const { handoffId } = z.object({ handoffId: z.string() }).parse(request.params);
    const body = authorizeHandoffSchema.parse(request.body);

    try {
      // In production, this would update the handoff session with authorized scopes
      return sendOk(reply, { success: true, handoffId, scopes: body.scopes });
    } catch (error) {
      fastify.log.error(error);
      return sendError(reply, 500, "HANDOFF_AUTHORIZE_FAILED", "授权接续会话失败");
    }
  });

  // ==========================================================================
  // HandoffCode — short-lived one-time QR code endpoints
  // ==========================================================================

  const createCodeSchema = z.object({
    conversationId: z.string().uuid(),
    planId: z.string().optional(),
  });

  /**
   * Create a short-lived handoff code
   * POST /api/handoff/create
   */
  fastify.post("/api/handoff/create", { preHandler: [fastify.authGuard] }, async (request, reply) => {
    const body = createCodeSchema.parse(request.body);
    const userId = uid(request);
    const db = fastify.db;

    // 校验 conversation 归属
    if (db) {
      try {
        await assertHandoffConversationOwnership(db, body.conversationId, userId, null);
      } catch (err) {
        if (err instanceof Error && err.message.includes("HANDOFF_CONVERSATION_NOT_FOUND")) {
          return sendError(reply, 404, "HANDOFF_CONVERSATION_NOT_FOUND", "会话不存在");
        }
        if (err instanceof Error && err.message.startsWith("FORBIDDEN")) {
          return sendError(reply, 403, "FORBIDDEN", "只能创建自己会话的接续码");
        }
        throw err;
      }
    }

    try {
      const result = await createHandoffCode({
        conversationId: body.conversationId,
        planId: body.planId,
        userId,
      });

      // 日志中脱敏 code，不记录完整码
      fastify.log.info({
        route: "POST /api/handoff/create",
        userId: userId ?? null,
        conversationId: body.conversationId,
        planId: body.planId ?? null,
        code: sanitizeHandoffCode(result.code),
        expiresAt: result.expiresAt,
      }, "[handoff] code created");

      return sendOk(reply, result);
    } catch (error) {
      fastify.log.error({ stack: shouldStripStack() ? undefined : error });
      return sendError(reply, 500, "HANDOFF_CODE_CREATE_FAILED", "创建接续码失败");
    }
  });

  /**
   * Query a handoff code
   * GET /api/handoff/:code
   */
  fastify.get("/api/handoff/:code", { preHandler: [fastify.optionalAuthGuard] }, async (request, reply) => {
    const { code } = z.object({ code: z.string().min(4).max(12) }).parse(request.params);

    try {
      const payload = await getHandoffCode(code);

      if (!payload) {
        return sendError(reply, 404, "HANDOFF_CODE_NOT_FOUND", "接续码不存在或已过期");
      }

      return sendOk(reply, payload);
    } catch (error) {
      fastify.log.error(error);
      return sendError(reply, 500, "HANDOFF_CODE_FETCH_FAILED", "获取接续码失败");
    }
  });

  /**
   * Query handoff detail for the mobile browser.
   * The short-lived code is the access proof; do not expose auth tokens or account data.
   * GET /api/handoff/:code/detail
   */
  fastify.get("/api/handoff/:code/detail", { preHandler: [fastify.optionalAuthGuard] }, async (request, reply) => {
    const { code } = z.object({ code: z.string().min(4).max(12) }).parse(request.params);

    try {
      const detail = await buildHandoffDetail(fastify, code);

      if (!detail) {
        return sendError(reply, 404, "HANDOFF_CODE_NOT_FOUND", "接续码不存在或已过期");
      }

      return sendOk(reply, detail);
    } catch (error) {
      fastify.log.error(error);
      return sendError(reply, 500, "HANDOFF_DETAIL_FETCH_FAILED", "获取接续详情失败");
    }
  });

  const claimCodeSchema = z.object({
    deviceId: z.string().min(1).max(128),
  });

  /**
   * Claim a handoff code (mobile device scans QR)
   * POST /api/handoff/:code/claim
   */
  fastify.post("/api/handoff/:code/claim", { preHandler: [fastify.optionalAuthGuard] }, async (request, reply) => {
    const { code } = z.object({ code: z.string().min(4).max(12) }).parse(request.params);
    const body = claimCodeSchema.parse(request.body);
    const userId = optionalUserId(request);

    // 限流：每 IP + code 每分钟最多 5 次
    const limiter = (request.server as unknown as { redis?: unknown }).redis;
    if (limiter) {
      // 使用 IP + code 作为限流 key
      const rateLimitKey = `handoff_claim:${request.ip}:${code.toUpperCase()}`;
      // 简单限流：使用 Redis INCR
      // 如果 Redis 不可用则跳过
      try {
        const current = await (limiter as any).incr?.(`rl:${rateLimitKey}`);
        if (current === 1) {
          await (limiter as any).expire?.(`rl:${rateLimitKey}`, 60);
        }
        if (current && current > 5) {
          return sendError(reply, 429, "RATE_LIMIT_EXCEEDED", "认领过于频繁，请稍后再试");
        }
      } catch {
        // Redis 不可用时 fail-open
      }
    }

    try {
      const result = await claimHandoffCode({
        code,
        deviceId: body.deviceId,
      });

      // 日志中脱敏 code
      fastify.log.info({
        route: "POST /api/handoff/:code/claim",
        userId,
        code: sanitizeHandoffCode(code),
        deviceId: body.deviceId,
        conversationId: result.conversationId,
      }, "[handoff] code claimed");

      return sendOk(reply, result);
    } catch (error) {
      fastify.log.error({ stack: shouldStripStack() ? undefined : error });
      if (error instanceof Error && error.message.includes("not found")) {
        return sendError(reply, 404, "HANDOFF_CODE_NOT_FOUND", "接续码不存在");
      }
      if (error instanceof Error && error.message.includes("expired")) {
        return sendError(reply, 410, "HANDOFF_CODE_EXPIRED", "接续码已过期");
      }
      if (error instanceof Error && error.message.includes("already claimed")) {
        return sendError(reply, 409, "HANDOFF_CODE_CLAIMED", "接续码已被使用");
      }
      return sendError(reply, 500, "HANDOFF_CODE_CLAIM_FAILED", "认领导航码失败");
    }
  });
}
