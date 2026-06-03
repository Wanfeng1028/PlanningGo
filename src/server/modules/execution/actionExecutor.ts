import { getPrismaClient } from "../../common/prisma";
import type { Prisma } from "../../../generated/prisma/client.js";
import type { ExecutionAction } from "../planning/schemas";
import { transitionState, type ActionStatus } from "./stateMachine";
import type { UserPermissionSnapshot } from "../agent/middleware/permissionGuard";

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
        status: "proposed",
        confirmationRequired: action.confirmationRequired,
        idempotencyKey: action.idempotencyKey,
        payload: {
          ...action.payload,
          _provider: action.type.includes("meituan") || action.type.includes("restaurant") ? "meituan" : action.type.includes("calendar") || action.type.includes("add_to_calendar") ? "calendar" : action.type.includes("amap") || action.type.includes("navigation") ? "amap" : "mock",
        } as unknown as Prisma.InputJsonValue,
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
    return await this.performExecution(actionRecord.id, action.type, action.payload);
  }

  /**
   * Perform the actual execution of an action
   * V3: 绝不模拟 confirmed/succeeded！
   * 所有需要第三方确认的动作，最终状态只能是 waiting_external_confirm
   * 只有 calendar_event / navigation / share_message 等非交易动作可以 succeeded
   */
  private async performExecution(
    actionId: string,
    type: string,
    payload: unknown,
  ): Promise<ActionResult> {
    const prisma = getPrisma();

    // Update status to executing
    await prisma.action.update({
      where: { id: actionId },
      data: { status: "executing" },
    });

    try {
      // Execute based on action type
      let result: unknown;
      let finalStatus: ActionStatus = "succeeded";

      switch (type) {
        case "navigation":
          result = await this.executeNavigation(payload);
          finalStatus = "succeeded";
          break;
        case "calendar_event":
          result = await this.executeCalendar(payload);
          finalStatus = "succeeded";
          break;
        case "share_message":
          result = await this.executeShare(payload);
          finalStatus = "succeeded";
          break;
        case "restaurant_reservation":
        case "ticket_lock":
        case "book_hotel":
        case "book_restaurant":
        case "book_transport":
        case "buy_ticket":
        case "reserve_activity":
        case "add_to_calendar":
        case "set_reminder":
          // V3: 所有交易/预约类动作，绝不返回 succeeded
          // 返回 prepared + redirectUrl，用户需到第三方平台确认
          result = await this.executeReservation(payload);
          finalStatus = "waiting_external_confirm";
          break;
        default:
          // 未知类型默认走 reservation 逻辑（保守策略）
          result = await this.executeReservation({ ...(payload as Record<string, unknown>), actionType: type });
          finalStatus = "waiting_external_confirm";
          break;
      }

      // V3: 只有非交易动作才能到达 succeeded
      // 交易动作的最终状态是 waiting_external_confirm（等第三方确认）
      if (finalStatus === "succeeded") {
        await prisma.action.update({
          where: { id: actionId },
          data: {
            status: "succeeded",
            result: result as unknown as Prisma.InputJsonValue,
          },
        });

        await prisma.actionEvent.create({
          data: {
            actionId,
            eventType: "execution_success",
            fromStatus: "executing",
            toStatus: "succeeded",
            payload: result as unknown as Prisma.InputJsonValue,
          },
        });

        return {
          actionId,
          status: "succeeded",
          result,
        };
      }

      // 交易动作: 更新为 waiting_external_confirm
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
          eventType: "redirect_to_third_party",
          fromStatus: "executing",
          toStatus: finalStatus,
          payload: result as unknown as Prisma.InputJsonValue,
        },
      });

      return {
        actionId,
        status: finalStatus,
        result,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Update status to failed
      await prisma.action.update({
        where: { id: actionId },
        data: {
          status: "failed",
          errorMessage,
        },
      });

      // Log action event
      await prisma.actionEvent.create({
        data: {
          actionId,
          eventType: "execution_failed",
          fromStatus: "executing",
          toStatus: "failed",
          payload: { error: errorMessage },
        },
      });

      return {
        actionId,
        status: "failed",
        error: errorMessage,
      };
    }
  }

  /**
   * Confirm an action for execution (user has confirmed they want to proceed)
   * V3: 确认后进入 executing，但交易动作不会直接 succeeded
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

    // Transition to redirect_required (user confirmed, now need to redirect to third party)
    const newStatus = transitionState(action.status as ActionStatus, "redirect_required");
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
        toStatus: "redirect_required",
      },
    });

    // Execute the action (performExecution handles V3 status logic internally)
    return await this.performExecution(actionId, action.type, action.payload);
  }

  /**
   * Execute navigation action
   */
  private async executeNavigation(payload: unknown): Promise<unknown> {
    // In production, this would generate a real navigation link
    return {
      navigationUrl: "https://uri.amap.com/navigation",
      points: (payload as Record<string, unknown>)?.points,
    };
  }

  /**
   * Execute calendar action
   */
  private async executeCalendar(payload: unknown): Promise<unknown> {
    // In production, this would write to user's calendar
    return {
      calendarEventId: `cal_${Date.now()}`,
      title: (payload as Record<string, unknown>)?.title,
      startTime: (payload as Record<string, unknown>)?.startTime,
      endTime: (payload as Record<string, unknown>)?.endTime,
    };
  }

  /**
   * Execute share action
   */
  private async executeShare(payload: unknown): Promise<unknown> {
    // In production, this would generate a shareable link
    return {
      shareUrl: `https://your-domain.com/share/${Date.now()}`,
      text: (payload as Record<string, unknown>)?.text,
    };
  }

  /**
   * Execute reservation action
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
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30分钟过期
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
