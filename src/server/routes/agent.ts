/**
 * Agent 路由 — /api/agent/*
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { PrismaClient } from "../../generated/prisma/client.js";
import { ZodError, z } from "zod";
import { parseDemand, planningRequestSchema, runPlanningAgent, simulateWhatIf } from "../services/agent.js";
import { runPlanningPipeline } from "../modules/agent/orchestrator.js";
import { saveActions } from "../services/store.js";
import { corsOrigins } from "../config/env.js";
import { updateConversationTitle } from "../modules/agent/titleUtils.js";

const _agentChatBodySchema = z.object({
  message: z.string().min(1).max(10000),
  conversationId: z.string().uuid().optional(),
  guestId: z.string().max(128).optional(),
  modelMode: z.enum(["flash", "pro"]).optional(),
  stream: z.boolean().optional(),
  webSearchResults: z.any().optional(),
  pendingAction: z.any().optional(),
});

const agentPlanBodySchema = planningRequestSchema.extend({
  guestId: z.string().max(128).optional(),
  conversationId: z.string().uuid().optional(),
});
import * as mem from "../services/memoryStore.js";

export async function registerAgentRoutes(app: FastifyInstance) {
  const planningRateLimit = {
    max: 100,
    timeWindow: "1 minute",
    skipOnError: true,
  };

  const planningModeQuota = {
    flash: { max: 30, windowMs: 60 * 60 * 1000 },
    pro: { max: 100, windowMs: 60 * 60 * 1000 },
  } as const;
  const maxPlanningCounterEntries = 2000;
  const planningCounters = new Map<string, { count: number; resetAt: number }>();
  type PlanningModeBody = { modelMode?: "flash" | "pro" };

  const enforcePlanningQuota = (request: FastifyRequest<{ Body: PlanningModeBody }>, reply: FastifyReply): boolean => {
    if (planningCounters.size > maxPlanningCounterEntries) {
      const now = Date.now();
      for (const [k, v] of planningCounters.entries()) {
        if (v.resetAt <= now) planningCounters.delete(k);
      }
    }
    const modelMode = request?.body?.modelMode === "pro" ? "pro" : "flash";
    const quota = planningModeQuota[modelMode];
    const identity = request.userId ?? request.ip ?? "anonymous";
    const key = `${identity}:${modelMode}`;
    const now = Date.now();
    const current = planningCounters.get(key);
    if (!current || now >= current.resetAt) {
      planningCounters.set(key, { count: 1, resetAt: now + quota.windowMs });
      return true;
    }
    if (current.count >= quota.max) {
      const retryAfterSec = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
      reply
        .status(429)
        .header("Retry-After", String(retryAfterSec))
        .send({ error: "RATE_LIMIT_EXCEEDED", message: `当前模型请求过于频繁，请 ${retryAfterSec} 秒后重试` });
      return false;
    }
    current.count += 1;
    planningCounters.set(key, current);
    return true;
  };

  // ── 共享：创建或获取会话 ──
  async function ensureConversation(
    db: PrismaClient | null,
    userId: string | undefined,
    body: { guestId?: string; conversationId?: string; prompt: string; city?: string; modelMode?: string },
    log: FastifyInstance["log"],
  ): Promise<string> {
    // 校验 conversationId 是否真实存在，避免前端传入过期 ID 导致 404
    if (body.conversationId) {
      if (db) {
        try {
          const existing = await db.conversation.findUnique({ where: { id: body.conversationId }, select: { id: true } });
          if (existing) return body.conversationId;
          log.warn({ conversationId: body.conversationId }, "conversationId not found in DB, will create new");
        } catch (err) {
          log.warn({ err }, "Failed to verify conversationId, will create new");
        }
      } else {
        // Memory store fallback
        const existing = mem.getConversation(body.conversationId);
        if (existing) return body.conversationId;
      }
    }

    const title = body.prompt.length > 30 ? body.prompt.slice(0, 30) + "…" : body.prompt;
    const guestId = !userId ? (body.guestId ?? null) : null;

    if (db) {
      try {
        const conv = await db.conversation.create({
          data: {
            userId: userId ?? undefined,
            guestId,
            title,
            city: body.city ?? "北京",
            modelMode: (body.modelMode as "flash" | "pro") ?? "flash",
          },
        });
        return conv.id;
      } catch (err) {
        log.error({ err }, "Failed to create conversation in DB, falling back to memory");
      }
    }

    const conv = mem.createConversation({ userId, guestId, title, city: body.city, modelMode: body.modelMode });
    return conv.id;
  }

  // ── 共享：保存消息（带 fallback） ──
  async function saveMessage(
    db: PrismaClient | null,
    conversationId: string,
    role: "user" | "assistant",
    content: string,
    payloadJson?: unknown,
    log?: FastifyInstance["log"],
  ): Promise<void> {
    if (db) {
      try {
        const msg = await db.message.create({
          data: { conversationId, role, content, payloadJson: payloadJson ?? undefined },
        });
        await db.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
        log?.info({
          conversationId,
          role,
          messageId: msg.id,
        }, "[agent] message saved to DB");
        return;
      } catch (err) {
        log?.error({
          conversationId,
          role,
          err,
        }, "[agent] message DB write failed");
      }
    }
    mem.addMessage({ conversationId, role, content, payloadJson });
    log?.warn({ conversationId, role }, "[agent] message saved to MEMORY only (DB unavailable)");
  }

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
    },
  );

  app.post(
    "/api/agent/plan",
    {
      config: { rateLimit: planningRateLimit },
      preHandler: [
        app.optionalAuthGuard,
        (request, reply, done) => {
          if (!enforcePlanningQuota(request as FastifyRequest<{ Body: PlanningModeBody }>, reply)) return;
          done();
        },
      ],
    },
    async (request, reply) => {
      try {
        const parsed = agentPlanBodySchema.parse(request.body);
        const userId = request.userId;
        const db: PrismaClient | null = app.db;

        app.log.info({ route: "POST /api/agent/plan", userId: userId ?? null, authenticated: Boolean(userId), conversationId: parsed.conversationId ?? null, method: "POST" }, "[agent:plan] incoming");

        // ── 1. 创建或获取会话 ──
        const conversationId = await ensureConversation(db, userId, {
          guestId: parsed.guestId,
          conversationId: parsed.conversationId,
          prompt: parsed.prompt,
          city: parsed.city,
          modelMode: parsed.modelMode,
        }, app.log);

        // ── 2. 保存用户消息 ──
        await saveMessage(db, conversationId, "user", parsed.prompt, undefined, app.log);

        // ── 3. 运行规划管道 ──
        const result = await runPlanningPipeline({
          ...parsed,
          providers: app.providers ?? undefined,
          userId,
        });

        // ── 3.5 保存生成的 actions ──
        if (result.executableActions?.length) {
          saveActions(result.executableActions);
        }

        // ── 4. 保存助手消息 ──
        const assistantContent = result.summary || "为你找到以下方案：";
        await saveMessage(db, conversationId, "assistant", assistantContent, {
          type: "plan",
          data: { planId: result.planId, options: result.options, summary: result.summary },
        }, app.log);

        // ── 5. 更新会话标题 ──
        if (result.options && result.options.length > 0) {
          const summary = result.summary || "";
          const destMatch = summary.match(/(杭州|上海|北京|西湖|灵隐|外滩|故宫|杭师大|南京|成都|广州|深圳)[^\n]{0,15}/);
          let newTitle: string | null = null;
          if (destMatch) {
            newTitle = destMatch[0].slice(0, 25);
          } else if (parsed.prompt.length > 5) {
            const cleaned = parsed.prompt.replace(/(帮我|请|麻烦|安排|规划|计划)/g, "").trim();
            if (cleaned.length > 3 && cleaned.length <= 25) {
              newTitle = cleaned;
            }
          }
          if (newTitle) {
            await updateConversationTitle(db, conversationId, newTitle, app.log);
          }
        }

        return { ...result, conversationId };
      } catch (error) {
        if (error instanceof ZodError) return reply.status(400).send({ error: "INVALID_REQUEST", issues: error.issues });
        if (error instanceof Error && error.message.startsWith("MISSING_REQUIRED_SLOTS:")) {
          const missingSlots = error.message.replace("MISSING_REQUIRED_SLOTS:", "").split(",");
          const traceId = `trace_${Date.now().toString(36)}`;
          return reply.status(400).send({
            ok: false,
            error: {
              code: "MISSING_REQUIRED_SLOTS",
              message: `缺少必要规划信息：${missingSlots.join("、")}`,
              missingSlots,
            },
            traceId,
          });
        }
        throw error;
      }
    },
  );

  // Streaming endpoint for planning
  app.post(
    "/api/agent/plan/stream",
    {
      config: { rateLimit: planningRateLimit },
      preHandler: [
        app.optionalAuthGuard,
        (request, reply, done) => {
          if (!enforcePlanningQuota(request as FastifyRequest<{ Body: PlanningModeBody }>, reply)) return;
          done();
        },
      ],
    },
    async (request, reply) => {
      let clientDisconnected = false;
      request.raw.on("close", () => {
        clientDisconnected = true;
      });

      try {
        const parsed = agentPlanBodySchema.parse(request.body);
        const userId = request.userId;
        const db: PrismaClient | null = app.db;

        app.log.info({ route: "POST /api/agent/plan/stream", userId: userId ?? null, authenticated: Boolean(userId), conversationId: parsed.conversationId ?? null, method: "POST" }, "[agent:plan:stream] incoming");

        // Set SSE headers (use raw.setHeader for reliable delivery with reply.raw.write)
        reply.raw.setHeader("Content-Type", "text/event-stream");
        reply.raw.setHeader("Cache-Control", "no-cache");
        reply.raw.setHeader("Connection", "keep-alive");

        // CORS headers for SSE (reply.raw bypasses @fastify/cors)
        const origin = request.headers.origin;
        if (origin && corsOrigins.includes(origin)) {
          reply.raw.setHeader("Access-Control-Allow-Origin", origin);
          reply.raw.setHeader("Access-Control-Allow-Credentials", "true");
          reply.raw.setHeader("Vary", "Origin");
        }


        // ── 1. 创建或获取会话 ──
        const conversationId = await ensureConversation(db, userId, {
          guestId: parsed.guestId,
          conversationId: parsed.conversationId,
          prompt: parsed.prompt,
          city: parsed.city,
          modelMode: parsed.modelMode,
        }, app.log);

        // ── 2. 保存用户消息 ──
        await saveMessage(db, conversationId, "user", parsed.prompt, undefined, app.log);

        // ── 3. 运行规划管道（带心跳） ──
        const heartbeat = setInterval(() => {
          if (!clientDisconnected) reply.raw.write(":heartbeat\n\n");
        }, 15_000);

        let result: Awaited<ReturnType<typeof runPlanningPipeline>>;
        try {
          result = await runPlanningPipeline({
            ...parsed,
            providers: app.providers ?? undefined,
            userId,
          });
        } finally {
          clearInterval(heartbeat);
        }

        // 客户端已断连则跳过写入
        if (clientDisconnected) {
          app.log.warn({ conversationId }, "Client disconnected during planning pipeline, skipping response write");
          return;
        }

        // 保存生成的 actions
        if (result.executableActions?.length) {
          saveActions(result.executableActions);
        }

        // Stream the summary
        const summary = result.summary || "为你找到以下方案：";
        for (let i = 0; i < summary.length; i++) {
          if (clientDisconnected) break;
          reply.raw.write(`data: ${JSON.stringify({ content: summary[i] })}\n\n`);
          await new Promise((resolve) => setTimeout(resolve, 10));
        }

        if (!clientDisconnected) {
          // Send final structured result for progressive UI hydration
          const finalResult = { ...result, conversationId };
          reply.raw.write(`data: [FINAL_RESULT]${JSON.stringify(finalResult)}\n\n`);
          reply.raw.write(`data: ${JSON.stringify({ done: true, result: finalResult })}\n\n`);
          reply.raw.write("data: [DONE]\n\n");
        }

        // ── 4. 保存助手消息 ──
        await saveMessage(db, conversationId, "assistant", summary, {
          type: "plan",
          data: { planId: result.planId, options: result.options, summary: result.summary },
        }, app.log);

        // ── 5. 更新会话标题 ──
        if (result.options && result.options.length > 0) {
          const summaryText = result.summary || "";
          const destMatch = summaryText.match(/(杭州|上海|北京|西湖|灵隐|外滩|故宫|杭师大|南京|成都|广州|深圳)[^\n]{0,15}/);
          let newTitle: string | null = null;
          if (destMatch) {
            newTitle = destMatch[0].slice(0, 25);
          } else if (parsed.prompt.length > 5) {
            const cleaned = parsed.prompt.replace(/(帮我|请|麻烦|安排|规划|计划)/g, "").trim();
            if (cleaned.length > 3 && cleaned.length <= 25) {
              newTitle = cleaned;
            }
          }
          if (newTitle) {
            await updateConversationTitle(db, conversationId, newTitle, app.log);
          }
        }

        if (!clientDisconnected) {
          reply.raw.end();
        }
      } catch (error) {
        app.log.error({ err: error }, "SSE planning stream error");
        if (!clientDisconnected) {
          try {
            if (error instanceof ZodError) {
              reply.raw.write(`data: ${JSON.stringify({ error: "INVALID_REQUEST", issues: error.issues })}\n\n`);
            } else if (error instanceof Error && error.message.startsWith("MISSING_REQUIRED_SLOTS:")) {
              const missingSlots = error.message.replace("MISSING_REQUIRED_SLOTS:", "").split(",");
              reply.raw.write(`data: ${JSON.stringify({
                error: "MISSING_REQUIRED_SLOTS",
                message: `缺少必要规划信息：${missingSlots.join("、")}`,
                missingSlots,
              })}\n\n`);
            } else {
              reply.raw.write(`data: ${JSON.stringify({ error: "INTERNAL_SERVER_ERROR" })}\n\n`);
            }
            reply.raw.write("data: [DONE]\n\n");
            reply.raw.end();
          } catch {
            // Connection already closed, ignore write errors
          }
        }
      }
    },
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


