/**
 * Agent 路由 — /api/agent/*
 */

import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "../../generated/prisma/client.js";
import { ZodError, z } from "zod";
import { parseDemand, planningRequestSchema, runPlanningAgent, simulateWhatIf } from "../services/agent.js";
import { runPlanningPipeline } from "../modules/agent/orchestrator.js";
import { saveActions } from "../services/store.js";
import * as mem from "../services/memoryStore.js";

export async function registerAgentRoutes(app: FastifyInstance) {
  // Rate limiting for planning endpoints
  const planningRateLimit = {
    max: 10, // 10 requests per minute
    timeWindow: "1 minute",
    skipOnError: true,
  };

  app.post(
    "/api/agent/parse",
    {
      config: { rateLimit: planningRateLimit },
      preHandler: [app.optionalAuthGuard],
    },
    async (request, reply) => {
      try {
        const input = planningRequestSchema.parse(request.body);
        return parseDemand(input);
      } catch (error) {
        if (error instanceof ZodError)
          return reply.status(400).send({ error: "INVALID_REQUEST", issues: error.issues });
        throw error;
      }
    }
  );

  app.post(
    "/api/agent/plan",
    {
      config: { rateLimit: planningRateLimit },
      preHandler: [app.optionalAuthGuard],
    },
    async (request, reply) => {
    try {
      const input = planningRequestSchema.parse(request.body);
      const userId = (request as any).userId as string | undefined;
      const db: PrismaClient | null = app.db;

      // ── 1. 创建或获取会话 ──
      let conversationId = (request.body as any).conversationId as string | undefined;
      if (!conversationId) {
        if (db) {
          try {
            const conv = await db.conversation.create({
              data: {
                userId: userId ?? undefined,
                guestId: !userId ? ((request.body as any).guestId ?? null) : null,
                title: input.prompt.length > 30 ? input.prompt.slice(0, 30) + "…" : input.prompt,
                city: input.city ?? "北京",
                modelMode: (input as any).modelMode ?? "flash",
              },
            });
            conversationId = conv.id;
          } catch {
            // fallback
          }
        }
        if (!conversationId) {
          const conv = mem.createConversation({
            userId,
            guestId: !userId ? ((request.body as any).guestId ?? null) : null,
            title: input.prompt.length > 30 ? input.prompt.slice(0, 30) + "…" : input.prompt,
            city: input.city,
            modelMode: (input as any).modelMode,
          });
          conversationId = conv.id;
        }
      }

      // ── 2. 保存用户消息 ──
      if (db) {
        try {
          await db.message.create({
            data: { conversationId, role: "user", content: input.prompt },
          });
        } catch {
          mem.addMessage({ conversationId, role: "user", content: input.prompt });
        }
      } else {
        mem.addMessage({ conversationId, role: "user", content: input.prompt });
      }

      // ── 3. 运行规划管道 ──
      const result = await runPlanningPipeline(input);

      // ── 4. 保存助手消息 ──
      const assistantContent = result.summary || "为你找到以下方案：";
      if (db) {
        try {
          await db.message.create({
            data: {
              conversationId,
              role: "assistant",
              content: assistantContent,
              payloadJson: { type: "plan", data: { planId: result.planId, options: result.options, summary: result.summary } },
            },
          });
        } catch {
          mem.addMessage({ conversationId, role: "assistant", content: assistantContent });
        }
      } else {
        mem.addMessage({ conversationId, role: "assistant", content: assistantContent });
      }

      return result;
    } catch (error) {
      if (error instanceof ZodError) return reply.status(400).send({ error: "INVALID_REQUEST", issues: error.issues });
      throw error;
    }
  });

  // Streaming endpoint for planning
  app.post(
    "/api/agent/plan/stream",
    {
      config: { rateLimit: planningRateLimit },
      preHandler: [app.optionalAuthGuard],
    },
    async (request, reply) => {
      try {
        const input = planningRequestSchema.parse(request.body);
        const userId = (request as any).userId as string | undefined;
        const db: PrismaClient | null = app.db;

        // Set SSE headers
        reply.header("Content-Type", "text/event-stream");
        reply.header("Cache-Control", "no-cache");
        reply.header("Connection", "keep-alive");

        // ── 1. 创建或获取会话 ──
        let conversationId = (request.body as any).conversationId as string | undefined;
        if (!conversationId) {
          if (db) {
            try {
              const conv = await db.conversation.create({
                data: {
                  userId: userId ?? undefined,
                  guestId: !userId ? ((request.body as any).guestId ?? null) : null,
                  title: input.prompt.length > 30 ? input.prompt.slice(0, 30) + "…" : input.prompt,
                  city: input.city ?? "北京",
                  modelMode: (input as any).modelMode ?? "flash",
                },
              });
              conversationId = conv.id;
            } catch {
              // fallback
            }
          }
          if (!conversationId) {
            const conv = mem.createConversation({
              userId,
              guestId: !userId ? ((request.body as any).guestId ?? null) : null,
              title: input.prompt.length > 30 ? input.prompt.slice(0, 30) + "…" : input.prompt,
              city: input.city,
              modelMode: (input as any).modelMode,
            });
            conversationId = conv.id;
          }
        }

        // ── 2. 保存用户消息 ──
        if (db) {
          try {
            await db.message.create({
              data: { conversationId, role: "user", content: input.prompt },
            });
          } catch {
            mem.addMessage({ conversationId, role: "user", content: input.prompt });
          }
        } else {
          mem.addMessage({ conversationId, role: "user", content: input.prompt });
        }

        // ── 3. 运行规划管道并流式返回 ──
        const result = await runPlanningPipeline(input);

        // Stream the summary
        const summary = result.summary || "为你找到以下方案：";
        for (let i = 0; i < summary.length; i++) {
          reply.raw.write(`data: ${JSON.stringify({ content: summary[i] })}\n\n`);
          await new Promise((resolve) => setTimeout(resolve, 10));
        }

        // Send final result
        reply.raw.write(`data: ${JSON.stringify({ done: true, result })}\n\n`);

        // ── 4. 保存助手消息 ──
        if (db) {
          try {
            await db.message.create({
              data: {
                conversationId,
                role: "assistant",
                content: summary,
                payloadJson: { type: "plan", data: { planId: result.planId, options: result.options, summary: result.summary } },
              },
            });
          } catch {
            mem.addMessage({ conversationId, role: "assistant", content: summary });
          }
        } else {
          mem.addMessage({ conversationId, role: "assistant", content: summary });
        }
      } catch (error) {
        if (error instanceof ZodError) {
          reply.raw.write(`data: ${JSON.stringify({ error: "INVALID_REQUEST", issues: error.issues })}\n\n`);
        } else {
          reply.raw.write(`data: ${JSON.stringify({ error: "INTERNAL_SERVER_ERROR" })}\n\n`);
        }
      }
    }
  );

  app.post("/api/agent/plan/legacy", { preHandler: [app.optionalAuthGuard] }, async (request, reply) => {
    try {
      const input = planningRequestSchema.parse(request.body);
      return runPlanningAgent(input);
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.status(400).send({ error: "INVALID_REQUEST", issues: error.issues });
      }
      throw error;
    }
  });

  app.post("/api/agent/what-if", { preHandler: [app.optionalAuthGuard] }, async (request) => {
    const input = z
      .object({
        planId: z.string().default("plan_a"),
        scenario: z.enum(["rain", "late", "budget", "traffic"]),
      })
      .parse(request.body);
    return simulateWhatIf(input.planId, input.scenario);
  });
}
