/**
 * Agent Chat Routes — /api/agent/chat/*
 *
 * POST /api/agent/chat/stream — SSE streaming chat endpoint
 * POST /api/agent/chat       — Non-streaming chat endpoint
 * POST /api/agent/plans/select — Plan selection endpoint
 *
 * 安全修复 (#3)：plans/select 接口增加会话所有权校验，防止 BOLA。
 */

import type { FastifyInstance } from "fastify";
import { ZodError, z } from "zod";
import { corsOrigins } from "../config/env.js";
import { handleAgentMessage } from "../modules/agent/chatRouter.js";
import { runAgentChatStream } from "../modules/agent/agentRuntime.js";
import { hasAnyLlmKey } from "../modules/agent/modelClient.js";
import { env } from "../config/env.js";
import type { AgentResponse } from "../../shared/agentResponse.js";
import type { PrismaClient } from "../../generated/prisma/client.js";
import * as mem from "../services/memoryStore.js";
import { assertConversationOwnership, OwnershipError } from "../common/ownership.js";

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
  guestId: z.string().max(128).optional(),
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

        app.log.info({
          route: "/api/agent/chat/stream",
          userId,
          conversationId: parsed.conversationId,
          authenticated: Boolean(userId),
        }, "[agentChat] request");

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
                  guestId: parsed.guestId,
                },
                { db, providers: app.providers ?? undefined, userId, log: app.log },
                {
                  writeText: (delta) => {
                    if (!clientDisconnected) reply.raw.write(`data: ${JSON.stringify({ content: delta })}\n\n`);
                  },
                  writeEvent: (event) => {
                    if (!clientDisconnected) {
                      reply.raw.write(`data: ${JSON.stringify({ type: "agent_event", event })}\n\n`);
                    }
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
                guestId: parsed.guestId,
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
          app.log.info({
            conversationId: parsed.conversationId,
            type: agentResponse.type,
            provider: resolvedProvider,
            model: resolvedModel,
            mode: responseWithMeta.metadata.mode,
            fallbackUsed,
            contentLength: (agentResponse.content ?? "").length,
          }, "[agentChat] response complete");
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

        app.log.info({ route: "POST /api/agent/chat", userId: userId ?? null, authenticated: Boolean(userId), conversationId: parsed.conversationId ?? null, method: "POST" }, "[agentChat:chat] incoming");

        const agentResponse = await handleAgentMessage(
          {
            message: parsed.message,
            city: parsed.city,
            modelMode: parsed.modelMode,
            conversationId: parsed.conversationId,
            selectedOptionId: parsed.selectedOptionId,
            guestId: parsed.guestId,
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
        const userId = request.userId;
        const guestId = (request.body as Record<string, unknown>)?.guestId as string | undefined ?? null;
        const db: PrismaClient | null = app.db;

        app.log.info({ route: "POST /api/agent/plans/select", userId: request.userId ?? null, authenticated: Boolean(request.userId), conversationId: parsed.conversationId, optionId: parsed.optionId, method: "POST" }, "[agentChat:planSelect] incoming");

        // ── 安全修复 (#3)：校验会话所有权，防止 BOLA ──
        if (db && userId) {
          try {
            await assertConversationOwnership(db, parsed.conversationId, userId, guestId);
          } catch (err) {
            if (err instanceof OwnershipError || (err instanceof Error && err.message.includes("FORBIDDEN"))) {
              return reply.status(403).send({ error: "FORBIDDEN", message: "无权操作此会话" });
            }
            // NOT_FOUND
            return reply.status(404).send({ error: "CONVERSATION_NOT_FOUND" });
          }
        } else if (db && !userId && guestId) {
          // Guest user: also check ownership
          try {
            await assertConversationOwnership(db, parsed.conversationId, null, guestId);
          } catch (_err) {
            return reply.status(404).send({ error: "CONVERSATION_NOT_FOUND" });
          }
        } else if (!db) {
          // Memory-only mode: verify against memory store
          const memConv = mem.getConversation(parsed.conversationId);
          if (!memConv) {
            return reply.status(404).send({ error: "CONVERSATION_NOT_FOUND" });
          }
          // Memory ownership check
          if (userId && memConv.userId && memConv.userId !== userId) {
            return reply.status(403).send({ error: "FORBIDDEN", message: "无权操作此会话" });
          }
          if (!userId && guestId && memConv.guestId !== guestId) {
            return reply.status(403).send({ error: "FORBIDDEN", message: "无权操作此会话" });
          }
          if (!userId && !guestId && memConv.userId) {
            return reply.status(403).send({ error: "FORBIDDEN", message: "此会话属于登录用户" });
          }
        }

        // Verify conversation exists (ownership already checked above)
        let conversationExists = false;
        let selectedPlanTitle = "已选方案";

        if (db) {
          const conv = await db.conversation.findUnique({
            where: { id: parsed.conversationId },
            select: { id: true, agentStateJson: true, selectedOptionId: true },
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

          // Dedup: check if already selected same option
          const alreadySelected = conv?.selectedOptionId === parsed.optionId;
          app.log.info({
            conversationId: parsed.conversationId,
            selectedOptionId: parsed.optionId,
            alreadySelected,
          }, "[agentChat:select] select plan");

          if (alreadySelected) {
            // Return existing selection without saving duplicate message
            const nextActions = [
              { key: "save", label: "\u4fdd\u5b58\u65b9\u6848" },
              { key: "navigation", label: "\u6253\u5f00\u5bfc\u822a" },
              { key: "calendar", label: "\u751f\u6210\u65e5\u5386" },
              { key: "share", label: "\u5206\u4eab\u7ed9\u540c\u884c\u4eba" },
              { key: "reservation", label: "\u67e5\u770b\u9884\u7ea6\u5efa\u8bae" },
              { key: "modify", label: "\u7ee7\u7eed\u8c03\u6574" },
            ];
            return {
              type: "plan_selected",
              content: `\u5df2\u9009\u4e2d\u300c${selectedPlanTitle}\u300d\u3002\u4e0b\u4e00\u6b65\u4f60\u53ef\u4ee5\uff1a`,
              selectedOptionId: parsed.optionId,
              selectedPlanTitle,
              nextActions,
              conversationId: parsed.conversationId,
            } satisfies AgentResponse;
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

        // Save assistant message (dedup check)
        if (db) {
          // Check if a plan_selected message with this optionId already exists
          const existingMsg = await db.message.findFirst({
            where: {
              conversationId: parsed.conversationId,
              role: "assistant",
              payloadJson: { path: ["selectedOptionId"], equals: parsed.optionId },
            },
          });

          if (existingMsg) {
            app.log.info({
              conversationId: parsed.conversationId,
              selectedOptionId: parsed.optionId,
            }, "[agentChat:select] skip duplicate plan_selected message");
          } else {
            await db.message.create({
            data: {
              conversationId: parsed.conversationId,
              role: "assistant",
              content,
              payloadJson: { type: "plan_selected", selectedOptionId: parsed.optionId, selectedPlanTitle, nextActions },
            },
            });
          }
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


