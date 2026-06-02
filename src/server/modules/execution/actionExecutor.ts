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

    // Check if authorization is required
    if (action.confirmationRequired) {
      const newStatus = transitionState(status, "waiting_authorization");
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
      switch (type) {
        case "navigation":
          result = await this.executeNavigation(payload);
          break;
        case "calendar_event":
          result = await this.executeCalendar(payload);
          break;
        case "share_message":
          result = await this.executeShare(payload);
          break;
        case "restaurant_reservation":
        case "ticket_lock":
          result = await this.executeReservation(payload);
          break;
        default:
          throw new Error(`Unknown action type: ${type}`);
      }

      // Update status to succeeded
      await prisma.action.update({
        where: { id: actionId },
        data: {
          status: "succeeded",
          result: result as unknown as Prisma.InputJsonValue,
        },
      });

      // Log action event
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
   * Authorize an action for execution
   */
  async authorizeAction(actionId: string): Promise<ActionResult> {
    const prisma = getPrisma();

    const action = await prisma.action.findUnique({
      where: { id: actionId },
    });

    if (!action) {
      throw new Error("Action not found");
    }

    if (action.status !== "waiting_authorization") {
      throw new Error(`Action is not waiting for authorization: ${action.status}`);
    }

    // Transition to authorized
    const newStatus = transitionState(action.status as ActionStatus, "authorized");
    await prisma.action.update({
      where: { id: actionId },
      data: { status: newStatus },
    });

    // Log authorization event
    await prisma.actionEvent.create({
      data: {
        actionId,
        eventType: "authorized",
        fromStatus: "waiting_authorization",
        toStatus: "authorized",
      },
    });

    // Execute the action
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
   */
  private async executeReservation(payload: unknown): Promise<unknown> {
    // In production, this would call external reservation APIs
    return {
      reservationId: `res_${Date.now()}`,
      poiId: (payload as Record<string, unknown>)?.poiId,
      poiName: (payload as Record<string, unknown>)?.poiName,
      status: "confirmed",
    };
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
