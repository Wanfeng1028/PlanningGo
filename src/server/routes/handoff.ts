import type { FastifyInstance } from "fastify";
import { createMobileHandoff, getHandoffByToken, claimHandoff, getHandoffStatus, consumeHandoff } from "../modules/handoff/qrService";
import type { PermissionScope } from "../modules/agent/middleware/permissionGuard";

interface AuthenticatedRequest {
  userId?: string;
  guestId?: string;
}

export async function registerHandoffRoutes(fastify: FastifyInstance) {
  /**
   * Create a mobile handoff session
   * POST /api/handoff/mobile
   */
  fastify.post("/api/handoff/mobile", async (request, reply) => {
    const body = request.body as {
      conversationId: string;
      planId: string;
      selectedOptionId?: string;
      scopes: PermissionScope[];
    };

    try {
      const userId = (request as AuthenticatedRequest).userId;
      const guestId = (request as AuthenticatedRequest).guestId;

      const result = await createMobileHandoff({
        conversationId: body.conversationId,
        planId: body.planId,
        selectedOptionId: body.selectedOptionId,
        userId,
        guestId,
        scopes: body.scopes,
      });

      return reply.send(result);
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: "Failed to create handoff session" });
    }
  });

  /**
   * Get handoff session by token
   * GET /api/handoff/mobile/:token
   */
  fastify.get("/api/handoff/mobile/:token", async (request, reply) => {
    const { token } = request.params as { token: string };

    try {
      const payload = await getHandoffByToken(token);

      if (!payload) {
        return reply.status(404).send({ error: "Handoff session not found or expired" });
      }

      return reply.send(payload);
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: "Failed to get handoff session" });
    }
  });

  /**
   * Claim a handoff session (mobile device scans QR code)
   * POST /api/handoff/mobile/:token/claim
   */
  fastify.post("/api/handoff/mobile/:token/claim", async (request, reply) => {
    const { token } = request.params as { token: string };
    const body = request.body as {
      deviceId: string;
      guestId?: string;
      grantedScopes: PermissionScope[];
    };

    try {
      const result = await claimHandoff({
        token,
        deviceId: body.deviceId,
        guestId: body.guestId,
        grantedScopes: body.grantedScopes,
      });

      return reply.send(result);
    } catch (error) {
      fastify.log.error(error);
      if (error instanceof Error && error.message.includes("not found")) {
        return reply.status(404).send({ error: error.message });
      }
      if (error instanceof Error && error.message.includes("expired")) {
        return reply.status(410).send({ error: error.message });
      }
      return reply.status(500).send({ error: "Failed to claim handoff session" });
    }
  });

  /**
   * Get handoff status
   * GET /api/handoff/mobile/:handoffId/status
   */
  fastify.get("/api/handoff/mobile/:handoffId/status", async (request, reply) => {
    const { handoffId } = request.params as { handoffId: string };

    try {
      const status = await getHandoffStatus(handoffId);
      return reply.send(status);
    } catch (error) {
      fastify.log.error(error);
      if (error instanceof Error && error.message.includes("not found")) {
        return reply.status(404).send({ error: error.message });
      }
      return reply.status(500).send({ error: "Failed to get handoff status" });
    }
  });

  /**
   * Authorize actions for a handoff session
   * POST /api/handoff/mobile/:handoffId/authorize
   */
  fastify.post("/api/handoff/mobile/:handoffId/authorize", async (request, reply) => {
    const { handoffId } = request.params as { handoffId: string };
    const body = request.body as {
      scopes: PermissionScope[];
    };

    try {
      // In production, this would update the handoff session with authorized scopes
      // For now, just return success
      return reply.send({ success: true, handoffId });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: "Failed to authorize handoff session" });
    }
  });
}
