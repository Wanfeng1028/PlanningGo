/**
 * V3 Action status normalization
 * 将旧状态/未知状态映射到 V3 状态机，防止非法状态入库
 */

import type { ActionStatus } from "./stateMachine.js";

/**
 * 旧状态 → V3 状态映射表
 */
const STATUS_MAP: Record<string, ActionStatus> = {
  // 旧 Action 表状态
  "DRAFT": "proposed",
  "PENDING": "proposed",
  "CONFIRMED": "prepared",
  "EXECUTING": "executing",
  "EXECUTED": "succeeded",
  "EXPIRING": "expired",
  "EXPIRED": "expired",
  "CANCELLED": "cancelled",
  "FAILED": "failed",

  // 旧 actionExecutor 状态
  "waiting_authorization": "waiting_user_confirm",
  "authorized": "redirect_required",

  // V3 状态直接透传
  "proposed": "proposed",
  "quoted": "quoted",
  "prepared": "prepared",
  "waiting_user_confirm": "waiting_user_confirm",
  "redirect_required": "redirect_required",
  "redirected_to_payment": "redirected_to_payment",
  "waiting_external_confirm": "waiting_external_confirm",
  "external_confirmed": "external_confirmed",
  "executing": "executing",
  "succeeded": "succeeded",
  "failed": "failed",
  "cancelled": "cancelled",
  "expired": "expired",

  // ExecutionAction 旧默认值
  "pending": "proposed",
  "success": "succeeded",
};

/**
 * 已知 V3 状态集合（用于校验）
 */
const KNOWN_V3_STATUSES = new Set([
  "proposed", "quoted", "prepared", "waiting_user_confirm",
  "redirect_required", "redirected_to_payment", "waiting_external_confirm",
  "external_confirmed", "executing", "succeeded", "failed", "cancelled", "expired",
]);

/**
 * 规范化 action status 到 V3 状态
 * - 已知 V3 状态直接返回
 * - 旧状态通过映射表转换
 * - 未知状态返回 "proposed" 并打日志
 */
export function normalizeActionStatus(rawStatus: string | undefined): ActionStatus {
  if (!rawStatus) return "proposed";

  // 先查映射表
  if (STATUS_MAP[rawStatus]) {
    return STATUS_MAP[rawStatus];
  }

  // 再查 V3 集合
  if (KNOWN_V3_STATUSES.has(rawStatus)) {
    return rawStatus as ActionStatus;
  }

  // 未知状态 — 保守策略：降级为 proposed
  console.warn(`[normalizeActionStatus] 未知状态 "${rawStatus}"，降级为 "proposed"`);
  return "proposed";
}
