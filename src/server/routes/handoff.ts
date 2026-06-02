import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createMobileHandoff, getHandoffByToken, claimHandoff, getHandoffStatus } from "../modules/handoff/qrService";
import { createHandoffCode, getHandoffCode, claimHandoffCode } from "../modules/handoff/handoffCodeService";
import type { PermissionScope } from "../modules/agent/middleware/permissionGuard";
import { sendOk, sendError } from "../common/response.js";
import { requireUserId } from "../common/uid.js";

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

export async function registerHandoffRoutes(fastify: FastifyInstance) {
  /**
   * Create a mobile handoff session
   * POST /api/handoff/mobile
   */
  fastify.post("/api/handoff/mobile", { preHandler: [fastify.authGuard] }, async (request, reply) => {
    const body = createHandoffSchema.parse(request.body);
    const userId = uid(request);

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
  fastify.post("/api/handoff/create", { preHandler: [fastify.optionalAuthGuard] }, async (request, reply) => {
    const body = createCodeSchema.parse(request.body);
    const userId = (request as unknown as { userId?: string }).userId;

    try {
      const result = await createHandoffCode({
        conversationId: body.conversationId,
        planId: body.planId,
        userId,
      });

      fastify.log.info({
        route: "POST /api/handoff/create",
        userId: userId ?? null,
        conversationId: body.conversationId,
        planId: body.planId ?? null,
        code: result.code,
        expiresAt: result.expiresAt,
      }, "[handoff] code created");

      return sendOk(reply, result);
    } catch (error) {
      fastify.log.error(error);
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

    try {
      const result = await claimHandoffCode({
        code,
        deviceId: body.deviceId,
      });

      fastify.log.info({
        route: "POST /api/handoff/:code/claim",
        code,
        deviceId: body.deviceId,
        conversationId: result.conversationId,
      }, "[handoff] code claimed");

      return sendOk(reply, result);
    } catch (error) {
      fastify.log.error(error);
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
