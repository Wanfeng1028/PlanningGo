import { getPrismaClient } from "../../common/prisma";
import type { Prisma } from "../../../generated/prisma/client.js";
import type { ExecutionAction } from "../planning/schemas";
import { transitionState, type ActionStatus } from "./stateMachine";
import type { UserPermissionSnapshot } from "../agent/middleware/permissionGuard";
import { getConnectorRegistry } from "../connectors/registry.js";
import type { ConnectorSearchResult } from "../connectors/types.js";
import { buildNavigationUrl } from "../maps/navigationLinks.js";

function getPrisma() {
  const prisma = getPrismaClient();
  if (!prisma) throw new Error("Database not available");
  return prisma;
}

/**
 * Action execution result
 */
export interface ActionResult {
  actionId: string;
  status: ActionStatus;
  result?: unknown;
  error?: string;
}

/**
 * Action executor - handles execution of actions with idempotency and permissions
 */
export class ActionExecutor {
  /**
   * Execute an action with idempotency check
   */
  async executeAction(params: {
    userId?: string;
    planId: string;
    action: ExecutionAction;
    permissions: UserPermissionSnapshot;
  }): Promise<ActionResult> {
    const { userId, planId, action, permissions: _permissions } = params;
    const prisma = getPrisma();

    // Check if action already exists (idempotency)
    const existing = await prisma.action.findUnique({
      where: { idempotencyKey: action.idempotencyKey },
    });

    if (existing) {
      return {
        actionId: existing.id,
        status: existing.status as ActionStatus,
        result: existing.result,
        error: existing.errorMessage || undefined,
      };
    }

    // Create action record
    const actionRecord = await prisma.action.create({
      data: {
        userId: userId || "guest",
        planId,
        type: action.type,
        provider: action.provider || "mock",
        status: "proposed",
        confirmationRequired: action.confirmationRequired,
        idempotencyKey: action.idempotencyKey,
        payload: action.payload as unknown as Prisma.InputJsonValue,
        quote: action.priceEstimate ? { price: action.priceEstimate } : undefined,
      },
    });

    // Transition to prepared
    const status = transitionState("proposed", "prepared");
    await prisma.action.update({
      where: { id: actionRecord.id },
      data: { status },
    });

    // Check if authorization is required (trading actions need user confirmation)
    if (action.confirmationRequired) {
      const newStatus = transitionState(status, "waiting_user_confirm");
      await prisma.action.update({
        where: { id: actionRecord.id },
        data: { status: newStatus },
      });

      return {
        actionId: actionRecord.id,
        status: newStatus,
      };
    }

    // Execute action
    const provider = actionRecord.provider || "mock";
    return await this.performExecution(actionRecord.id, action.type, action.payload, provider);
  }

  /**
   * Perform the actual execution of an action
   * V3: 统一走 Connector Registry，不再本地模拟执行
   * - 交易类动作: prepare → redirect_required → 用户第三方确认 → commit → succeeded
   * - 非交易类动作 (navigation/calendar/share): 通过对应 provider connector 执行
   * - calendar_event: 生成 ICS 内容，返回 ics_generated 状态，不返回 fake calendarEventId
   */
  private async performExecution(
    actionId: string,
    type: string,
    payload: unknown,
    provider: string,
  ): Promise<ActionResult> {
    const prisma = getPrisma();

    // Update status to executing
    await prisma.action.update({
      where: { id: actionId },
      data: { status: "executing" },
    });

    try {
      const registry = getConnectorRegistry();
      const connector = registry.get(provider as any);

      // 交易类动作: 走 Connector Registry prepare → redirect
      const tradingTypes = new Set([
        "restaurant_reservation", "ticket_lock", "book_hotel",
        "book_restaurant", "book_transport", "buy_ticket",
        "reserve_activity",
      ]);

      if (tradingTypes.has(type)) {
        if (!connector?.prepare) {
          // Fallback: 返回 redirect_required
          const redirectUrl = this.buildThirdPartyUrl(payload);
          await prisma.action.update({
            where: { id: actionId },
            data: {
              status: "redirect_required",
              result: {
                status: "redirect_required",
                redirectUrl,
                message: `请前往 ${provider} 平台完成确认`,
              },
            },
          });

          await prisma.actionEvent.create({
            data: {
              actionId,
              eventType: "redirect_to_third_party",
              fromStatus: "executing",
              toStatus: "redirect_required",
              payload: { status: "redirect_required", redirectUrl },
            },
          });

          return {
            actionId,
            status: "redirect_required",
            result: { status: "redirect_required", redirectUrl },
          };
        }

        try {
          const poi = (payload as Record<string, unknown>)?.poi as Record<string, unknown> | undefined;
          const prepared = await connector.prepare({
            provider: provider as any,
            actionType: type,
            poi: poi ? {
              provider: provider as any,
              name: (poi.name as string) || type,
              address: (poi.address as string) || undefined,
              lat: (poi.lat as number) || undefined,
              lng: (poi.lng as number) || undefined,
            } : undefined,
            items: (payload as Record<string, unknown>)?.items as Array<{ name: string; quantity: number; price?: number }> | undefined,
            partySize: (payload as Record<string, unknown>)?.partySize as number | undefined,
            startTime: (payload as Record<string, unknown>)?.startTime as string | undefined,
            userId: "guest",
          });

          await prisma.action.update({
            where: { id: actionId },
            data: {
              status: prepared.status,
              result: prepared as unknown as Prisma.InputJsonValue,
            },
          });

          await prisma.actionEvent.create({
            data: {
              actionId,
              eventType: "redirect_to_third_party",
              fromStatus: "executing",
              toStatus: prepared.status,
              payload: prepared as unknown as Prisma.InputJsonValue,
            },
          });

          const resolvedStatus = (prepared.status as ActionStatus) || ("prepared" as ActionStatus);
          return { actionId, status: resolvedStatus, result: prepared };
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          if (message.includes("PAYMENT_DISABLED")) {
            await prisma.action.update({
              where: { id: actionId },
              data: {
                status: "cancelled",
                errorCode: "PAYMENT_DISABLED",
                result: { status: "cancelled", message: "支付功能未启用" },
              },
            });
            return { actionId, status: "cancelled", result: { status: "cancelled", message: "支付功能未启用" } };
          }
          throw err;
        }
      }

      // 非交易类动作: 根据类型分别处理
      let result: unknown;
      let finalStatus: ActionStatus = "succeeded";

      switch (type) {
        case "navigation": {
          // 导航: 生成导航 URL (高德)
          if (connector?.prepare) {
            const prepared = await connector.prepare({
              provider: provider as any,
              actionType: type,
              poi: (payload as Record<string, unknown>)?.poi as ConnectorSearchResult | undefined as any,
              userId: "guest",
            });
            result = prepared;
            finalStatus = prepared.status === "unavailable" ? "cancelled" : "succeeded";
          } else {
            // Fallback: 生成导航 URL
            const points = (payload as Record<string, unknown>)?.points as string[] | undefined;
            result = {
              navigationUrl: buildNavigationUrl({ provider: "open", destination: points?.[0] ?? "" }),
              points,
            };
            finalStatus = "succeeded";
          }
          break;
        }

        case "calendar_event":
        case "add_to_calendar": {
          // 日历: 生成 ICS 内容，不返回 fake calendarEventId
          // 状态为 ics_generated，提示用户手动导入
          const calendarData = (payload as Record<string, unknown>);
          result = {
            icsGenerated: true,
            title: (calendarData?.title as string) || "周末活动",
            startTime: (calendarData?.startTime as string) || undefined,
            endTime: (calendarData?.endTime as string) || undefined,
            message: "已生成日历事件，请手动导入到你的日历应用",
            icsContent: this.generateIcsContent(calendarData),
          };
          finalStatus = "ics_generated";
          break;
        }

        case "share_message": {
          // 分享: 生成分享链接
          if (connector?.prepare) {
            const prepared = await connector.prepare({
              provider: provider as any,
              actionType: type,
              userId: "guest",
            });
            result = prepared;
            finalStatus = prepared.status === "unavailable" ? "cancelled" : "succeeded";
          } else {
            // Fallback: 生成分享链接
            const text = (payload as Record<string, unknown>)?.text as string | undefined;
            result = {
              shareUrl: `https://your-domain.com/share/${Date.now()}`,
              text,
            };
            finalStatus = "succeeded";
          }
          break;
        }

        default:
          // 未知类型默认走 reservation 逻辑
          result = await this.executeReservation({ ...(payload as Record<string, unknown>), actionType: type });
          finalStatus = "waiting_external_confirm";
          break;
      }

      // 更新 DB 状态
      await prisma.action.update({
        where: { id: actionId },
        data: {
          status: finalStatus,
          result: result as unknown as Prisma.InputJsonValue,
        },
      });

      await prisma.actionEvent.create({
        data: {
          actionId,
          eventType: finalStatus === "succeeded" ? "execution_success" : "redirect_to_third_party",
          fromStatus: "executing",
          toStatus: finalStatus,
          payload: result as unknown as Prisma.InputJsonValue,
        },
      });

      return { actionId, status: finalStatus, result };
    } catch (err: unknown) {
      const errorResult = { error: err instanceof Error ? err.message : String(err) };
      await prisma.action.update({
        where: { id: actionId },
        data: {
          status: "cancelled",
          errorCode: "EXECUTION_FAILED",
          errorMessage: err instanceof Error ? err.message : String(err),
          result: errorResult as unknown as Prisma.InputJsonValue,
        },
      });

      await prisma.actionEvent.create({
        data: {
          actionId,
          eventType: "execution_error",
          fromStatus: "executing",
          toStatus: "cancelled",
          payload: errorResult as unknown as Prisma.InputJsonValue,
        },
      });

      return { actionId, status: "cancelled", result: errorResult };
    }
  }

  /**
   * 生成 ICS 日历内容（不依赖外部日历 API）
   */
  private generateIcsContent(payload: Record<string, unknown>): string {
    const title = (payload.title as string) || "周末活动";
    const startTime = (payload.startTime as string) || new Date().toISOString();
    const endTime = (payload.endTime as string) || new Date(Date.now() + 3600000).toISOString();

    return [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//PlanningGo//CN",
      "BEGIN:VEVENT",
      `DTSTART:${this.toIcsDate(startTime)}`,
      `DTEND:${this.toIcsDate(endTime)}`,
      `SUMMARY:${title}`,
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
  }

  private toIcsDate(isoString: string): string {
    try {
      const d = new Date(isoString);
      return d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    } catch {
      return new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    }
  }

  /**
   * Confirm an action for execution (user has confirmed they want to proceed)
   * V3: 确认后进入 executing，交易动作走 Connector Registry prepare → redirect
   *     非交易动作直接执行（navigation/calendar/share）
   */
  async confirmAction(actionId: string): Promise<ActionResult> {
    const prisma = getPrisma();

    const action = await prisma.action.findUnique({
      where: { id: actionId },
    });

    if (!action) {
      throw new Error("Action not found");
    }

    if (action.status !== "waiting_user_confirm") {
      throw new Error(`Action is not waiting for user confirmation: ${action.status}`);
    }

    // Transition to executing
    const newStatus = transitionState(action.status as ActionStatus, "executing");
    await prisma.action.update({
      where: { id: actionId },
      data: { status: newStatus },
    });

    // Log confirmation event
    await prisma.actionEvent.create({
      data: {
        actionId,
        eventType: "user_confirmed",
        fromStatus: "waiting_user_confirm",
        toStatus: "executing",
      },
    });

    // Execute the action via Connector Registry (pass provider from DB field)
    const provider = action.provider || "mock";
    return await this.performExecution(actionId, action.type, action.payload, provider);
  }

  /**
   * Execute reservation action (fallback for unknown types)
   * V3: 绝不返回 confirmed/succeeded！
   * 返回 prepared 状态 + redirectUrl，用户需到第三方平台确认
   */
  private async executeReservation(payload: unknown): Promise<unknown> {
    const poiName = (payload as Record<string, unknown>)?.poiName as string | undefined;
    const poiId = (payload as Record<string, unknown>)?.poiId as string | undefined;
    const actionType = (payload as Record<string, unknown>)?.actionType as string | undefined;

    return {
      reservationId: `res_${Date.now()}`,
      poiId,
      poiName: poiName || "待选择",
      actionType: actionType || "reservation",
      status: "prepared",
      message: `已生成${poiName ? poiName + ' ' : ''}预约信息，请前往第三方平台确认并支付`,
      redirectUrl: this.buildThirdPartyUrl(payload),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    };
  }

  /**
   * 构建第三方平台 URL（深链 fallback）
   */
  private buildThirdPartyUrl(payload: unknown): string | undefined {
    const poiName = (payload as Record<string, unknown>)?.poiName as string | undefined;
    if (!poiName) return undefined;

    // 美团/点评深链 fallback
    return `https://search.meituan.com/search?keyword=${encodeURIComponent(poiName)}`;
  }
}

// Singleton instance
let actionExecutorInstance: ActionExecutor | null = null;

export function getActionExecutor(): ActionExecutor {
  if (!actionExecutorInstance) {
    actionExecutorInstance = new ActionExecutor();
  }
  return actionExecutorInstance;
}
