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
  app.post("/api/agent/parse", { preHandler: [app.optionalAuthGuard] }, async (request, reply) => {
    try {
      const input = planningRequestSchema.parse(request.body);
      return parseDemand(input);
    } catch (error) {
      if (error instanceof ZodError) return reply.status(400).send({ error: "INVALID_REQUEST", issues: error.issues });
      throw error;
    }
  });

  app.post("/api/agent/plan", { preHandler: [app.optionalAuthGuard] }, async (request, reply) => {
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

      // ── 3. 运行规划 Pipeline ──
      const result = await runPlanningPipeline(input);
      if (result.executableActions.length > 0) {
        saveActions(result.executableActions);
      }

      // ── 4. 保存方案到数据库/内存 ──
      const planTitle = result.options?.[0]?.title ?? input.prompt.slice(0, 30);
      let savedPlanId: string | null = null;

      if (db) {
        try {
          const plan = await db.plan.create({
            data: {
              userId: userId ?? "anonymous",
              conversationId,
              title: planTitle,
              summary: result.summary ?? "",
              intent: (result as any).intent ?? {},
              status: "completed",
            },
          });
          savedPlanId = plan.id;

          // Save plan options
          if (result.options) {
            for (const opt of result.options) {
              const planOption = await db.planOption.create({
                data: {
                  planId: plan.id,
                  title: opt.title,
                  targetGroup: (opt as any).targetGroup ?? "unknown",
                  score: opt.score ?? 0,
                  totalDurationMin: opt.totalDurationMinutes ?? 0,
                  costMin: opt.totalCostMin ?? 0,
                  costMax: opt.totalCostMax ?? 0,
                  summary: opt.summary ?? "",
                  risks: (opt as any).risks ?? [],
                  assumptions: (opt as any).assumptions ?? [],
                  backupPlan: (opt as any).backupPlan ?? {},
                  validationReport: (opt as any).validationReport ?? {},
                },
              });

              // Save steps
              if (opt.timeline) {
                for (let i = 0; i < opt.timeline.length; i++) {
                  const step = opt.timeline[i];
                  await db.planStep.create({
                    data: {
                      planOptionId: planOption.id,
                      orderIndex: i,
                      startTime: step.startTime ?? "",
                      endTime: step.endTime ?? "",
                      type: step.type ?? "activity",
                      placeName: step.poiName ?? "",
                      action: step.actionId ?? "",
                      durationMin: step.durationMinutes ?? 0,
                      transport: step.transport ?? "none",
                      bookingNeeded: step.bookingNeeded ?? false,
                    },
                  });
                }
              }
            }
          }

          // Save execution actions
          if (result.executableActions.length > 0) {
            for (const action of result.executableActions) {
              await db.executionAction.create({
                data: {
                  planId: plan.id,
                  type: action.type,
                  title: action.title,
                  description: action.description ?? "",
                  status: action.status ?? "pending",
                  priceEstimate: action.priceEstimate ?? null,
                },
              });
            }
          }
        } catch {
          // fallback to memory
          const plan = mem.createPlan({
            userId: userId ?? "anonymous",
            conversationId,
            title: planTitle,
            summary: result.summary,
            options: result.options,
            execActions: result.executableActions.map((a) => ({
              id: a.id,
              planId: "",
              type: a.type,
              title: a.title,
              description: a.description ?? "",
              status: a.status ?? "pending",
              priceEstimate: a.priceEstimate ?? null,
              metadata: {},
              createdAt: new Date(),
              updatedAt: new Date(),
            })),
          });
          savedPlanId = plan.id;
        }
      } else {
        const plan = mem.createPlan({
          userId: userId ?? "anonymous",
          conversationId,
          title: planTitle,
          summary: result.summary,
          options: result.options,
          execActions: result.executableActions.map((a) => ({
            id: a.id,
            planId: "",
            type: a.type,
            title: a.title,
            description: a.description ?? "",
            status: a.status ?? "pending",
            priceEstimate: a.priceEstimate ?? null,
            metadata: {},
            createdAt: new Date(),
            updatedAt: new Date(),
          })),
        });
        savedPlanId = plan.id;
      }

      // ── 5. 保存 assistant 消息 ──
      const assistantPayload = {
        plans: result.options,
        actions: result.executableActions,
        selectedPlanId: result.selectedPlanId,
        planId: savedPlanId,
      };

      if (db) {
        try {
          await db.message.create({
            data: {
              conversationId,
              role: "assistant",
              content: result.summary ?? "已完成规划",
              payloadJson: assistantPayload,
            },
          });
        } catch {
          mem.addMessage({
            conversationId,
            role: "assistant",
            content: result.summary ?? "已完成规划",
            payloadJson: assistantPayload,
          });
        }
      } else {
        mem.addMessage({
          conversationId,
          role: "assistant",
          content: result.summary ?? "已完成规划",
          payloadJson: assistantPayload,
        });
      }

      // ── 6. 返回结果（附加 conversationId 和 planId） ──
      return {
        ...result,
        conversationId,
        planId: savedPlanId,
      };
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.status(400).send({ error: "INVALID_REQUEST", issues: error.issues });
      }
      throw error;
    }
  });

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
