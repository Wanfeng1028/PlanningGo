/**
 * V3 Action status states — 交易状态机
 * 核心原则: 没有真实第三方确认，永远不写 confirmed / succeeded
 */
export type ActionStatus =
  | "proposed"
  | "quoted"
  | "prepared"
  | "waiting_user_confirm"
  | "redirect_required"
  | "redirected_to_payment"
  | "waiting_external_confirm"
  | "external_confirmed"
  | "executing"
  | "succeeded"
  | "ics_generated"
  | "failed"
  | "cancelled"
  | "expired";

/**
 * Valid state transitions — V3 交易流程
 *
 * 主流程:
 *   proposed → quoted → prepared → waiting_user_confirm → redirect_required
 *   → redirected_to_payment → waiting_external_confirm → external_confirmed
 *   → executing → succeeded
 *
 * 取消/失败:
 *   任何非终态 → cancelled / expired
 *   waiting_user_confirm / waiting_external_confirm → cancelled
 *   failed → prepared (可重试)
 */
const stateTransitions: Record<ActionStatus, ActionStatus[]> = {
  proposed: ["quoted", "prepared", "cancelled", "expired"],
  quoted: ["prepared", "cancelled", "expired"],
  prepared: ["waiting_user_confirm", "cancelled", "expired"],
  waiting_user_confirm: [
    "redirect_required",
    "waiting_external_confirm",
    "executing",
    "cancelled",
    "expired",
  ],
  redirect_required: [
    "redirected_to_payment",
    "waiting_external_confirm",
    "cancelled",
    "expired",
  ],
  redirected_to_payment: ["waiting_external_confirm", "cancelled", "expired"],
  waiting_external_confirm: ["external_confirmed", "cancelled", "expired"],
  external_confirmed: ["executing", "cancelled"],
  executing: ["succeeded", "ics_generated", "failed", "cancelled"],
  succeeded: [], // Terminal
  ics_generated: [], // Terminal — 日历 ICS 已生成，用户需手动导入
  failed: ["prepared"], // 可重试
  cancelled: [], // Terminal
  expired: [], // Terminal
};

/**
 * Check if a state transition is valid
 */
export function isValidTransition(from: ActionStatus, to: ActionStatus): boolean {
  return stateTransitions[from]?.includes(to) ?? false;
}

/**
 * Execute a state transition
 */
export function transitionState(current: ActionStatus, target: ActionStatus): ActionStatus {
  if (!isValidTransition(current, target)) {
    throw new Error(`Invalid state transition: ${current} -> ${target}`);
  }
  return target;
}

/**
 * Check if an action is in a terminal state
 */
export function isTerminalState(status: ActionStatus): boolean {
  return ["succeeded", "ics_generated", "cancelled", "expired"].includes(status);
}

/**
 * Check if an action can be retried
 */
export function canRetry(status: ActionStatus): boolean {
  return status === "failed";
}

/**
 * Check if an action requires user confirmation
 */
export function requiresUserConfirm(status: ActionStatus): boolean {
  return [
    "waiting_user_confirm",
    "redirect_required",
    "redirected_to_payment",
    "waiting_external_confirm",
  ].includes(status);
}

/**
 * Check if an action needs a third-party redirect
 */
export function needsRedirect(status: ActionStatus): boolean {
  return ["redirect_required", "redirected_to_payment"].includes(status);
}

/**
 * Check if action is waiting for external (third-party) confirmation
 * This is the V3 "not yet confirmed" state — user has been redirected
 * but external service has not confirmed yet.
 */
export function isWaitingExternal(status: ActionStatus): boolean {
  return status === "waiting_external_confirm";
}
