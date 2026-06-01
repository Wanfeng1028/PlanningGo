/**
 * Agent Chat Routes — /api/agent/chat/*
 *
 * POST /api/agent/chat/stream — SSE streaming chat endpoint
 * POST /api/agent/chat       — Non-streaming chat endpoint
 * POST /api/agent/plans/select — Plan selection endpoint
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { ZodError, z } from "zod";
import { corsOrigins } from "../config/env.js";
import { handleAgentMessage } from "../modules/agent/chatRouter.js";
import { runAgentChatStream } from "../modules/agent/agentRuntime.js";
import { hasAnyLlmKey } from "../modules/agent/modelClient.js";
import { env } from "../config/env.js";
import type { AgentMessageInput, AgentResponse } from "../../shared/agentResponse.js";
import type { PrismaClient } from "../../generated/prisma/client.js";
import * as mem from "../services/memoryStore.js";

// ─── Schemas ────────────────────────────────────────────────

const chatStreamBodySchema = z.object({
  message: z.string().min(1).max(10000),
  city: z.string().optional(),
  modelMode: z.enum(["flash", "pro"]).optional(),
  conversationId: z.string().uuid().optional(),
  selectedOptionId: z.string().optional(),
  guestId: z.string().max(128).optional(),
});

const planSelectBodySchema = z.object({
  conversationId: z.string().uuid(),
  optionId: z.string().min(1),
});

// ─── Registration ───────────────────────────────────────────

export async function registerAgentChatRoutes(app: FastifyInstance) {

  // ── POST /api/agent/chat/stream (SSE) ─────────────────────
  app.post(
    "/api/agent/chat/stream",
    {
      preHandler: [app.optionalAuthGuard],
      config: { rateLimit: { max: 100, timeWindow: "1 minute", skipOnError: true } },
    },
    async (request, reply) => {
      let clientDisconnected = false;
      request.raw.on("close", () => { clientDisconnected = true; });

      try {
        const parsed = chatStreamBodySchema.parse(request.body);
        const userId = request.userId;
        const db: PrismaClient | null = app.db;

        // SSE headers (use raw.setHeader for reliable delivery with reply.raw.write)
        reply.raw.setHeader("Content-Type", "text/event-stream");
        reply.raw.setHeader("Cache-Control", "no-cache");
        reply.raw.setHeader("Connection", "keep-alive");

        // CORS for SSE
        const origin = request.headers.origin;
        if (origin && corsOrigins.includes(origin)) {
          reply.raw.setHeader("Access-Control-Allow-Origin", origin);
          reply.raw.setHeader("Access-Control-Allow-Credentials", "true");
          reply.raw.setHeader("Vary", "Origin");
        }

        // Heartbeat
        const heartbeat = setInterval(() => {
          if (!clientDisconnected) reply.raw.write(":heartbeat\n\n");
        }, 15_000);

        let agentResponse: AgentResponse | null = null;
        let fallbackUsed = false;
        let resolvedProvider: string | undefined;
        let resolvedModel: string | undefined;
        try {
          const canUseRuntime = env.AGENT_CHAT_MODE !== 'rule' && (env.AGENT_CHAT_MODE === 'llm' || hasAnyLlmKey());

          if (canUseRuntime) {
            try {
              agentResponse = await runAgentChatStream(
                {
                  message: parsed.message,
                  city: parsed.city,
                  modelMode: parsed.modelMode ?? 'flash',
                  conversationId: parsed.conversationId,
                  selectedOptionId: parsed.selectedOptionId,
                },
                { db, providers: app.providers ?? undefined, userId, log: app.log },
                {
                  writeText: (delta) => {
                    if (!clientDisconnected) reply.raw.write(`data: ${JSON.stringify({ content: delta })}\n\n`);
                  },
                },
              );
              resolvedProvider = agentResponse.metadata?.provider;
              resolvedModel = agentResponse.metadata?.model;
            } catch (runtimeErr) {
              app.log.error({ err: runtimeErr }, "[agentChat] LLM runtime failed");

              // AGENT_CHAT_MODE=llm → 不允许 fallback，直接抛出真实错误
              if (env.AGENT_CHAT_MODE === "llm") {
                throw runtimeErr;
              }

              // auto 模式：只有显式启用 ENABLE_LLM_FALLBACK 时才允许 fallback
              if (!env.ENABLE_LLM_FALLBACK) {
                throw runtimeErr;
              }

              app.log.warn({ err: runtimeErr }, "[agentChat] fallback to rule router");
              agentResponse = null;
            }
          }

          if (!agentResponse) {
            fallbackUsed = canUseRuntime; // 只有尝试过 LLM 后降级才算 fallback
            agentResponse = await handleAgentMessage(
              {
                message: parsed.message,
                city: parsed.city,
                modelMode: parsed.modelMode,
                conversationId: parsed.conversationId,
                selectedOptionId: parsed.selectedOptionId,
              },
              { db, providers: app.providers ?? undefined, userId, log: app.log },
            );

            const content = agentResponse.content;
            for (let i = 0; i < content.length; i++) {
              if (clientDisconnected) break;
              reply.raw.write(`data: ${JSON.stringify({ content: content[i] })}\n\n`);
              if (content.length > 20) {
                await new Promise((resolve) => setTimeout(resolve, 8));
              }
            }
          }
        } finally {
          clearInterval(heartbeat);
        }

        if (clientDisconnected) {
          app.log.warn('[agentChat] Client disconnected, skipping response');
          return;
        }

        if (agentResponse) {
          // 注入 metadata 到响应
          const responseWithMeta = {
            ...agentResponse,
            metadata: {
              provider: resolvedProvider,
              model: resolvedModel,
              mode: (fallbackUsed ? "rule" : env.AGENT_CHAT_MODE === "llm" ? "llm" : "auto") as "llm" | "rule" | "mock" | "hybrid",
              fallbackUsed,
            },
          };
          reply.raw.write(`data: [FINAL_RESULT]${JSON.stringify(responseWithMeta)}\n\n`);
          reply.raw.write('data: [DONE]\n\n');
          reply.raw.end();
        } else {
          // 确保始终发送 [FINAL_RESULT] + [DONE]，避免客户端挂起
          const errorPayload = { type: "error", content: "服务内部错误，请稍后重试", error: "INTERNAL_SERVER_ERROR" };
          reply.raw.write(`data: [FINAL_RESULT]${JSON.stringify(errorPayload)}\n\n`);
          reply.raw.write('data: [DONE]\n\n');
          reply.raw.end();
        }
      } catch (error) {
        app.log.error({ err: error }, "[agentChat] SSE stream error");
        if (!clientDisconnected) {
          try {
            const errorPayload = error instanceof ZodError
              ? { error: "INVALID_REQUEST", issues: error.issues }
              : { type: "error", content: "服务内部错误，请稍后重试", error: "INTERNAL_SERVER_ERROR" };
            // Send a content frame so clients know data was received
            reply.raw.write(`data: ${JSON.stringify({ content: "服务内部错误，请稍后重试" })}\n\n`);
            reply.raw.write(`data: [FINAL_RESULT]${JSON.stringify(errorPayload)}\n\n`);
            reply.raw.write("data: [DONE]\n\n");
            reply.raw.end();
          } catch {
            // Connection already closed
          }
        }
      }
    },
  );

  // ── POST /api/agent/chat (non-streaming) ──────────────────
  app.post(
    "/api/agent/chat",
    {
      preHandler: [app.optionalAuthGuard],
      config: { rateLimit: { max: 100, timeWindow: "1 minute", skipOnError: true } },
    },
    async (request, reply) => {
      try {
        const parsed = chatStreamBodySchema.parse(request.body);
        const userId = request.userId;
        const db: PrismaClient | null = app.db;

        const agentResponse = await handleAgentMessage(
          {
            message: parsed.message,
            city: parsed.city,
            modelMode: parsed.modelMode,
            conversationId: parsed.conversationId,
            selectedOptionId: parsed.selectedOptionId,
          },
          { db, providers: app.providers ?? undefined, userId, log: app.log },
        );

        return agentResponse;
      } catch (error) {
        if (error instanceof ZodError) {
          return reply.status(400).send({ error: "INVALID_REQUEST", issues: error.issues });
        }
        app.log.error({ err: error }, "[agentChat] chat error");
        return reply.status(500).send({ type: "error", content: "服务内部错误" });
      }
    },
  );

  // ── POST /api/agent/plans/select ──────────────────────────
  app.post(
    "/api/agent/plans/select",
    {
      preHandler: [app.optionalAuthGuard],
    },
    async (request, reply) => {
      try {
        const parsed = planSelectBodySchema.parse(request.body);
        const db: PrismaClient | null = app.db;

        // Verify conversation exists
        let conversationExists = false;
        let selectedPlanTitle = "已选方案";

        if (db) {
          const conv = await db.conversation.findUnique({
            where: { id: parsed.conversationId },
            select: { id: true, agentStateJson: true },
          });
          conversationExists = !!conv;

          // Try to get plan title from agent state
          if (conv?.agentStateJson) {
            const state = conv.agentStateJson as Record<string, unknown>;
            const lastPlan = state?.lastPlanResult as { options?: Array<{ id: string; title: string }> } | undefined;
            if (lastPlan?.options) {
              const found = lastPlan.options.find((o) => o.id === parsed.optionId);
              if (found) selectedPlanTitle = found.title;
            }
          }
        } else {
          conversationExists = !!mem.getConversation(parsed.conversationId);
        }

        if (!conversationExists) {
          return reply.status(404).send({ error: "CONVERSATION_NOT_FOUND" });
        }

        // Save selectedOptionId
        if (db) {
          const existingState = (await db.conversation.findUnique({
            where: { id: parsed.conversationId },
            select: { agentStateJson: true },
          }))?.agentStateJson as Record<string, unknown> | null;

          const newState = {
            ...(existingState ?? {}),
            phase: "plan_selected",
            selectedOptionId: parsed.optionId,
            selectedPlanTitle,
          };

          await db.conversation.update({
            where: { id: parsed.conversationId },
            data: {
              selectedOptionId: parsed.optionId,
              agentStateJson: newState,
            },
          });
        }

        // Build response
        const nextActions = [
          { key: "save", label: "保存方案" },
          { key: "navigation", label: "打开导航" },
          { key: "calendar", label: "生成日历" },
          { key: "share", label: "分享给同行人" },
          { key: "reservation", label: "查看预约建议" },
          { key: "modify", label: "继续调整" },
        ];

        const content = `已选中「${selectedPlanTitle}」。下一步你可以：`;

        const agentResponse: AgentResponse = {
          type: "plan_selected",
          content,
          selectedOptionId: parsed.optionId,
          selectedPlanTitle,
          nextActions,
          conversationId: parsed.conversationId,
        };

        // Save assistant message
        if (db) {
          await db.message.create({
            data: {
              conversationId: parsed.conversationId,
              role: "assistant",
              content,
              payloadJson: { type: "plan_selected", selectedOptionId: parsed.optionId, selectedPlanTitle, nextActions },
            },
          });
        } else {
          mem.addMessage({
            conversationId: parsed.conversationId,
            role: "assistant",
            content,
            payloadJson: { type: "plan_selected", selectedOptionId: parsed.optionId, selectedPlanTitle, nextActions },
          });
        }

        return agentResponse;
      } catch (error) {
        if (error instanceof ZodError) {
          return reply.status(400).send({ error: "INVALID_REQUEST", issues: error.issues });
        }
        app.log.error({ err: error }, "[agentChat] plan select error");
        return reply.status(500).send({ type: "error", content: "方案选择失败" });
      }
    },
  );
}

