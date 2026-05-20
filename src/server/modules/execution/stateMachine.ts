/**
 * Action status states
 */
export type ActionStatus =
  | "proposed"
  | "prepared"
  | "waiting_authorization"
  | "authorized"
  | "executing"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "expired";

/**
 * Valid state transitions
 */
const stateTransitions: Record<ActionStatus, ActionStatus[]> = {
  proposed: ["prepared", "cancelled", "expired"],
  prepared: ["waiting_authorization", "cancelled", "expired"],
  waiting_authorization: ["authorized", "cancelled", "expired"],
  authorized: ["executing", "cancelled", "expired"],
  executing: ["succeeded", "failed", "cancelled"],
  succeeded: [], // Terminal state
  failed: ["prepared"], // Can retry
  cancelled: [], // Terminal state
  expired: [], // Terminal state
};

/**
 * Check if a state transition is valid
 */
export function isValidTransition(from: ActionStatus, to: ActionStatus): boolean {
  return stateTransitions[from].includes(to);
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
  return ["succeeded", "cancelled", "expired"].includes(status);
}

/**
 * Check if an action can be retried
 */
export function canRetry(status: ActionStatus): boolean {
  return status === "failed";
}

/**
 * Check if an action requires authorization
 */
export function requiresAuthorization(status: ActionStatus): boolean {
  return status === "waiting_authorization";
}
