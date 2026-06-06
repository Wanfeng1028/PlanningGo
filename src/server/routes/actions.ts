/**
 * Actions 路由 — V3: 统一使用 Action 表 + Connector Registry
 *
 * 流程:
 *   GET /api/actions      → 从 DB Action 表查询
 *   POST /api/actions/:id/quote   → 通过 Connector Registry 执行 quote
 *   POST /api/actions/:id/confirm → 通过 Connector Registry 执行 prepare → redirect
 *   POST /api/actions/:id/cancel  → 更新 DB 状态为 cancelled
 *
 * 安全:
 *   - 所有 /api/actions/:id/* 操作必须校验 userId ownership（不能仅靠 id 查找）
 *   - confirm 必须走 V3 状态机门禁，不允许任意非终态 confirm
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
import type { ConnectorSearchResult } from "../modules/connectors/types.js";
import { isTerminalState, isValidTransition, type ActionStatus } from "../modules/execution/stateMachine.js";
import { getActionExecutor } from "../modules/execution/actionExecutor.js";
import { getAction, listActions, updateActionStatus } from "../services/store.js";

/**
 * 安全查找 action：同时校验 id 和 userId ownership
 * 防止用户 A 通过用户 B 的 action id 执行 quote/confirm/cancel
 */
async function findActionOwnedByUser(db: NonNullable<FastifyInstance["db"]>, id: string, userId: string) {
  return db.action.findFirst({
    where: { id, userId },
  });
}

/**
 * confirm 状态门禁：只有 waiting_user_confirm 状态允许 confirm
 * V3 交易状态机要求：用户确认动作必须处于 waiting_user_confirm 状态
 */
function assertConfirmable(status: ActionStatus): void {
  if (status !== "waiting_user_confirm") {
    throw new ForbiddenError(`ACTION_NOT_CONFIRMABLE: 当前状态 "${status}" 不允许 confirm`);
  }
}

export async function registerActionRoutes(app: FastifyInstance) {
  // ── GET /api/actions — 从 DB Action 表查询 ──
  app.get("/api/actions", { preHandler: [app.authGuard] }, async (request, reply) => {
    const query = z.object({ planId: z.string().optional() }).parse(request.query);
    const db = app.db;
    if (!db) {
      return sendOk(reply, { items: listActions(query.planId, request.userId!) });
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
      const action = getAction(params.id);
      if (!action || action.userId !== request.userId) throw new NotFoundError("ACTION_NOT_FOUND");
      if (isTerminalState(action.status as ActionStatus)) throw new NotFoundError("ACTION_EXPIRED");

      updateActionStatus(params.id, "quoted");
      return sendOk(reply, {
        quoteId: `quote-${params.id}`,
        status: "available",
        warnings: ["DB 不可用，使用内存模式 quote fallback"],
      });
    }

    // V3: 必须校验 userId ownership，防止越权操作
    const action = await findActionOwnedByUser(db, params.id, request.userId!);

    if (!action) throw new NotFoundError("ACTION_NOT_FOUND");
    if (isTerminalState(action.status as ActionStatus)) {
      throw new NotFoundError("ACTION_EXPIRED");
    }

    // 通过 Connector Registry 执行 quote
    const registry = getConnectorRegistry();
    const actionType = action.type;
    const connectorProvider = (action.provider || "mock") as Parameters<typeof registry.get>[0];
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
      const payload = action.payload as Record<string, unknown> | undefined;
      const quoteResult = await connector.quote({
        provider: connectorProvider,
        actionType,
        poi: payload?.poi as ConnectorSearchResult | undefined,
        items: payload?.items as Array<{ name: string; quantity: number; price?: number }> | undefined,
        partySize: payload?.partySize as number | undefined,
        startTime: payload?.startTime as string | undefined,
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
      const action = getAction(params.id);
      if (!action || action.userId !== request.userId) throw new NotFoundError("ACTION_NOT_FOUND");
      if (isTerminalState(action.status as ActionStatus)) throw new NotFoundError("ACTION_EXPIRED");

      const actionStatus = action.status as ActionStatus;
      assertConfirmable(actionStatus);

      updateActionStatus(params.id, "redirect_required" as ActionStatus);
      return sendOk(reply, {
        preparedActionId: `prepared-${params.id}`,
        status: "redirect_required",
        message: "请在移动端或第三方平台完成确认",
        redirectUrl: "https://example.com/redirect",
      });
    }

    // V3: 必须校验 userId ownership，防止越权操作
    const action = await findActionOwnedByUser(db, params.id, request.userId!);

    if (!action) throw new NotFoundError("ACTION_NOT_FOUND");
    if (isTerminalState(action.status as ActionStatus)) {
      throw new NotFoundError("ACTION_EXPIRED");
    }

    // V3: confirm 状态门禁 — 只有 waiting_user_confirm 允许 confirm
    const actionStatus = action.status as ActionStatus;
    assertConfirmable(actionStatus);

    // V3: 非交易类动作（calendar/navigation/share）直接执行，不走 connector.prepare
    const NON_TRADING_TYPES = new Set(["calendar_event", "add_to_calendar", "navigation", "share_message"]);
    const isNonTrading = NON_TRADING_TYPES.has(action.type);

    if (isNonTrading) {
      // 委托 ActionExecutor 处理状态转换和具体执行
      const executor = getActionExecutor();
      const result = await executor.confirmAction(params.id);

      return sendOk(reply, {
        actionId: result.actionId,
        status: result.status,
        result: result.result,
      });
    }

    // V3: 交易动作走 Connector prepare → redirect
    const registry = getConnectorRegistry();
    const actionType = action.type;
    const connectorProvider = (action.provider || "mock") as Parameters<typeof registry.get>[0];
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
      const payload = action.payload as Record<string, unknown> | undefined;
      const prepared = await connector.prepare({
        provider: connectorProvider,
        actionType,
        poi: payload?.poi as ConnectorSearchResult | undefined,
        items: payload?.items as Array<{ name: string; quantity: number; price?: number }> | undefined,
        partySize: payload?.partySize as number | undefined,
        startTime: payload?.startTime as string | undefined,
        userId: request.userId!,
      });

      // V3: 验证状态转换合法性
      const nextState = prepared.status as ActionStatus;
      if (!isValidTransition(actionStatus, nextState)) {
        throw new ForbiddenError(`Invalid state transition: ${actionStatus} -> ${nextState}`);
      }

      // 更新 DB 状态
      await db.action.update({
        where: { id: params.id },
        data: {
          status: nextState,
          payload: { ...(payload ?? {}), preparedAction: prepared as unknown as Prisma.InputJsonValue },
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
      const action = getAction(params.id);
      if (!action || action.userId !== request.userId) throw new NotFoundError("ACTION_NOT_FOUND");
      if (isTerminalState(action.status as ActionStatus)) {
        throw new NotFoundError("ACTION_ALREADY_TERMINAL");
      }
      const updated = updateActionStatus(params.id, "cancelled");
      if (!updated) throw new NotFoundError("ACTION_NOT_FOUND");
      return sendOk(reply, updated);
    }

    // V3: 必须校验 userId ownership，防止越权取消
    const action = await findActionOwnedByUser(db, params.id, request.userId!);

    if (!action) throw new NotFoundError("ACTION_NOT_FOUND");

    // 只有非终态才能取消 — 复用 V3 isTerminalState
    if (isTerminalState(action.status as ActionStatus)) {
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
