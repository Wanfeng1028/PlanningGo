/**
 * Actions 路由 — V3: 接 Connector Registry + DB，不再只走 services/store 内存动作
 *
 * 流程:
 *   GET /api/actions      → 从 DB ExecutionAction 表查询
 *   POST /api/actions/:id/quote   → 通过 Connector Registry 执行 quote
 *   POST /api/actions/:id/confirm → 通过 Connector Registry 执行 prepare → redirect
 *   POST /api/actions/:id/cancel  → 更新 DB 状态为 cancelled
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Prisma } from "../../generated/prisma/client.js";
import { ForbiddenError, NotFoundError } from "../common/errors.js";
import { sendOk } from "../common/response.js";
import { optionalUserId } from "../common/uid.js";
import { getConnectorRegistry } from "../modules/connectors/registry.js";

export async function registerActionRoutes(app: FastifyInstance) {
  // ── GET /api/actions — 从 DB 查询 ──
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

    const actions = await db.executionAction.findMany({
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

    const action = await db.executionAction.findUnique({
      where: { id: params.id },
    });

    if (!action) throw new NotFoundError("ACTION_NOT_FOUND");
    if (action.status === "cancelled" || action.status === "expired") {
      throw new NotFoundError("ACTION_EXPIRED");
    }

    // 通过 Connector Registry 执行 quote
    const registry = getConnectorRegistry();
    const actionType = action.type;

    // 根据 action type 推断 provider
    let provider = "mock";
    if (actionType.includes("meituan") || actionType.includes("restaurant")) provider = "meituan";
    else if (actionType.includes("calendar") || actionType.includes("add_to_calendar")) provider = "calendar";
    else if (actionType.includes("amap") || actionType.includes("navigation")) provider = "amap";

    const connector = registry.get(provider as any);

    if (!connector?.quote) {
      // Fallback: 更新 DB 状态为 quoted
      await db.executionAction.update({
        where: { id: params.id },
        data: { status: "quoted" },
      });
      return sendOk(reply, {
        quoteId: `quote-${params.id}`,
        status: "available",
        warnings: [`Connector ${provider} 未实现 quote，使用 fallback`],
      });
    }

    try {
      const metadata = action.metadata as Record<string, unknown>;
      const quoteResult = await connector.quote({
        provider: provider as any,
        actionType,
        poi: metadata.poi ? {
          provider: "mock",
          name: (metadata.poi as Record<string, unknown>)?.name as string | undefined || action.title,
          address: (metadata.poi as Record<string, unknown>)?.address as string | undefined,
          lat: (metadata.poi as Record<string, unknown>)?.lat as number | undefined,
          lng: (metadata.poi as Record<string, unknown>)?.lng as number | undefined,
        } : undefined,
        items: metadata.items as Array<{ name: string; quantity: number; price?: number }> | undefined,
        partySize: metadata.partySize as number | undefined,
        startTime: metadata.startTime as string | undefined,
        userId: request.userId!,
      });

      // 更新 DB 状态
      await db.executionAction.update({
        where: { id: params.id },
        data: { status: "quoted", metadata: { ...(metadata as Record<string, unknown>), quote: quoteResult as unknown as Prisma.InputJsonValue } },
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

    const action = await db.executionAction.findUnique({
      where: { id: params.id },
    });

    if (!action) throw new NotFoundError("ACTION_NOT_FOUND");
    if (action.status === "cancelled" || action.status === "expired") {
      throw new NotFoundError("ACTION_EXPIRED");
    }

    // V3: 所有交易动作不直接 succeeded，走 Connector prepare → redirect
    const registry = getConnectorRegistry();
    const actionType = action.type;

    let provider = "mock";
    if (actionType.includes("meituan") || actionType.includes("restaurant")) provider = "meituan";
    else if (actionType.includes("calendar") || actionType.includes("add_to_calendar")) provider = "calendar";
    else if (actionType.includes("amap") || actionType.includes("navigation")) provider = "amap";

    const connector = registry.get(provider as any);

    if (!connector?.prepare) {
      // Fallback: 更新为 redirect_required
      await db.executionAction.update({
        where: { id: params.id },
        data: { status: "redirect_required" },
      });
      return sendOk(reply, {
        preparedActionId: `prepared-${params.id}`,
        status: "redirect_required",
        message: `请前往 ${provider} 平台完成确认`,
        redirectUrl: `https://www.${provider}.com/search?keyword=${encodeURIComponent(action.title)}`,
      });
    }

    try {
      const metadata = action.metadata as Record<string, unknown>;
      const prepared = await connector.prepare({
        provider: provider as any,
        actionType,
        poi: metadata.poi ? {
          provider: "mock",
          name: (metadata.poi as Record<string, unknown>)?.name as string | undefined || action.title,
          address: (metadata.poi as Record<string, unknown>)?.address as string | undefined,
          lat: (metadata.poi as Record<string, unknown>)?.lat as number | undefined,
          lng: (metadata.poi as Record<string, unknown>)?.lng as number | undefined,
        } : undefined,
        items: metadata.items as Array<{ name: string; quantity: number; price?: number }> | undefined,
        partySize: metadata.partySize as number | undefined,
        startTime: metadata.startTime as string | undefined,
        userId: request.userId!,
      });

      // 更新 DB 状态
      await db.executionAction.update({
        where: { id: params.id },
        data: {
          status: prepared.status,
          metadata: { ...(metadata as Record<string, unknown>), preparedAction: prepared as unknown as Prisma.InputJsonValue },
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

    const action = await db.executionAction.findUnique({
      where: { id: params.id },
    });

    if (!action) throw new NotFoundError("ACTION_NOT_FOUND");

    // 只有非终态才能取消
    const terminalStates = ["cancelled", "expired", "success"];
    if (terminalStates.includes(action.status)) {
      throw new NotFoundError("ACTION_ALREADY_TERMINAL");
    }

    const result = await db.executionAction.update({
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
