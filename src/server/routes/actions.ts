/**
 * Actions 路由 — V3: 统一使用 Action 表 + Connector Registry
 *
 * 流程:
 *   GET /api/actions      → 从 DB Action 表查询
 *   POST /api/actions/:id/quote   → 通过 Connector Registry 执行 quote
 *   POST /api/actions/:id/confirm → 通过 Connector Registry 执行 prepare → redirect
 *   POST /api/actions/:id/cancel  → 更新 DB 状态为 cancelled
 *
 * 注意: 所有 action 操作统一使用 Action 表（不是 ExecutionAction），
 *       与 actionExecutor.ts 共享同一套状态机和数据源。
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Prisma } from "../../generated/prisma/client.js";
import { ForbiddenError, NotFoundError } from "../common/errors.js";
import { sendOk } from "../common/response.js";
import { optionalUserId } from "../common/uid.js";
import { getConnectorRegistry } from "../modules/connectors/registry.js";
import { isTerminalState } from "../modules/execution/stateMachine.js";

export async function registerActionRoutes(app: FastifyInstance) {
  // ── GET /api/actions — 从 DB Action 表查询 ──
  app.get("/api/actions", { preHandler: [app.authGuard] }, async (request, reply) => {
    const query = z.object({ planId: z.string().optional() }).parse(request.query);
    const db = app.db;
    if (!db) {
      return sendOk(reply, { items: [] });
    }

    const where: Record<string, unknown> = { userId: request.userId! };
    if (query.planId) {
      where.planId = query.planId;
    }

    const actions = await db.action.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    return sendOk(reply, { items: actions });
  });

  // ── POST /api/actions/:id/quote — Connector quote ──
  app.post("/api/actions/:id/quote", { preHandler: [app.authGuard] }, async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const db = app.db;
    if (!db) {
      throw new NotFoundError("DB_UNAVAILABLE");
    }

    const action = await db.action.findUnique({
      where: { id: params.id },
    });

    if (!action) throw new NotFoundError("ACTION_NOT_FOUND");
    if (isTerminalState(action.status as any)) {
      throw new NotFoundError("ACTION_EXPIRED");
    }

    // 通过 Connector Registry 执行 quote
    const registry = getConnectorRegistry();
    const actionType = action.type;

    // 根据 action 的 provider 字段选择 connector（从 payload 中读取 _provider）
    const payload = (action.payload as Record<string, unknown>) ?? {};
    const provider = payload._provider as string | undefined;
    const connectorProvider = (provider || "mock") as any;
    const connector = registry.get(connectorProvider);

    if (!connector?.quote) {
      // Fallback: 更新 DB 状态为 quoted
      await db.action.update({
        where: { id: params.id },
        data: { status: "quoted" },
      });
      return sendOk(reply, {
        quoteId: `quote-${params.id}`,
        status: "available",
        warnings: [`Connector ${connectorProvider} 未实现 quote，使用 fallback`],
      });
    }

    try {
      const poi = payload.poi as Record<string, unknown> | undefined;
      const quoteResult = await connector.quote({
        provider: connectorProvider,
        actionType,
        poi: poi ? {
          provider: connectorProvider,
          name: (poi.name as string) || action.type,
          address: (poi.address as string) || undefined,
          lat: (poi.lat as number) || undefined,
          lng: (poi.lng as number) || undefined,
        } : undefined,
        items: payload.items as Array<{ name: string; quantity: number; price?: number }> | undefined,
        partySize: payload.partySize as number | undefined,
        startTime: payload.startTime as string | undefined,
        userId: request.userId!,
      });

      // 更新 DB 状态
      await db.action.update({
        where: { id: params.id },
        data: {
          status: "quoted",
          quote: quoteResult as unknown as Prisma.InputJsonValue,
        },
      });

      return sendOk(reply, quoteResult);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("FORBIDDEN")) throw new ForbiddenError("无权操作此 Action");
      if (message.includes("EXPIRED")) throw new NotFoundError("ACTION_EXPIRED");
      throw err;
    }
  });

  // ── POST /api/actions/:id/confirm — Connector prepare + redirect ──
  app.post("/api/actions/:id/confirm", { preHandler: [app.authGuard] }, async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({ userConfirmed: z.boolean().default(true) }).parse(request.body ?? {});
    if (!body.userConfirmed) throw new NotFoundError("CONFIRM_REQUIRED");

    const db = app.db;
    if (!db) {
      throw new NotFoundError("DB_UNAVAILABLE");
    }

    const action = await db.action.findUnique({
      where: { id: params.id },
    });

    if (!action) throw new NotFoundError("ACTION_NOT_FOUND");
    if (isTerminalState(action.status as any)) {
      throw new NotFoundError("ACTION_EXPIRED");
    }

    // V3: 所有交易动作不直接 succeeded，走 Connector prepare → redirect
    const registry = getConnectorRegistry();
    const actionType = action.type;
    const payload = (action.payload as Record<string, unknown>) ?? {};

    const provider = payload._provider as string | undefined;
    const connectorProvider = (provider || "mock") as any;
    const connector = registry.get(connectorProvider);

    if (!connector?.prepare) {
      // Fallback: 更新为 redirect_required
      await db.action.update({
        where: { id: params.id },
        data: { status: "redirect_required" },
      });
      return sendOk(reply, {
        preparedActionId: `prepared-${params.id}`,
        status: "redirect_required",
        message: `请前往 ${connectorProvider} 平台完成确认`,
        redirectUrl: `https://www.${connectorProvider}.com/search?keyword=${encodeURIComponent(action.type)}`,
      });
    }

    try {
      const poi = payload.poi as Record<string, unknown> | undefined;
      const prepared = await connector.prepare({
        provider: connectorProvider,
        actionType,
        poi: poi ? {
          provider: connectorProvider,
          name: (poi.name as string) || action.type,
          address: (poi.address as string) || undefined,
          lat: (poi.lat as number) || undefined,
          lng: (poi.lng as number) || undefined,
        } : undefined,
        items: payload.items as Array<{ name: string; quantity: number; price?: number }> | undefined,
        partySize: payload.partySize as number | undefined,
        startTime: payload.startTime as string | undefined,
        userId: request.userId!,
      });

      // 更新 DB 状态
      await db.action.update({
        where: { id: params.id },
        data: {
          status: prepared.status,
          payload: { ...(payload as Record<string, unknown>), preparedAction: prepared as unknown as Prisma.InputJsonValue },
        },
      });

      return sendOk(reply, prepared);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("FORBIDDEN")) throw new ForbiddenError("无权操作此 Action");
      if (message.includes("EXPIRED")) throw new NotFoundError("ACTION_EXPIRED");
      if (message.includes("PAYMENT_DISABLED")) throw new ForbiddenError("PAYMENT_DISABLED");
      throw err;
    }
  });

  // ── POST /api/actions/:id/cancel — DB 更新 ──
  app.post("/api/actions/:id/cancel", { preHandler: [app.authGuard] }, async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const db = app.db;
    if (!db) {
      throw new NotFoundError("DB_UNAVAILABLE");
    }

    const action = await db.action.findUnique({
      where: { id: params.id },
    });

    if (!action) throw new NotFoundError("ACTION_NOT_FOUND");

    // 只有非终态才能取消 — 复用 V3 isTerminalState
    if (isTerminalState(action.status as any)) {
      throw new NotFoundError("ACTION_ALREADY_TERMINAL");
    }

    const result = await db.action.update({
      where: { id: params.id },
      data: { status: "cancelled" },
    });

    return sendOk(reply, result);
  });

  // ── Track action clicks ──
  app.post("/api/actions/track", { preHandler: [app.optionalAuthGuard] }, async (request, reply) => {
    const body = z
      .object({
        conversationId: z.string().optional(),
        planId: z.string().optional(),
        actionType: z.string(),
        label: z.string(),
      })
      .parse(request.body);

    const userId = optionalUserId(request);
    app.log.info({ userId, ...body }, "[actions:track] action clicked");

    const db = app.db;
    if (db && userId) {
      try {
        await db.memory.create({
          data: {
            userId,
            category: "action_click",
            title: body.actionType,
            detail: JSON.stringify({
              conversationId: body.conversationId ?? null,
              planId: body.planId ?? null,
              label: body.label,
              clickedAt: new Date().toISOString(),
            }),
            weight: 0.3,
            source: "auto",
          },
        });
      } catch (err) {
        app.log.warn({ err }, "[actions:track] failed to persist click event");
      }
    }

    return sendOk(reply, { success: true });
  });
}
