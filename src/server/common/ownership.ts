/**
 * 通用资源 ownership 校验 helper
 *
 * 所有需要校验资源归属的接口都应使用这些函数，防止 BOLA/水平越权。
 * OWASP API Security 2023: Broken Object Level Authorization
 */

import type { PrismaClient } from "../../generated/prisma/client.js";
import type { Plan, Conversation, ShareRoom, Action, DeveloperApp, Webhook } from "../../generated/prisma/client.js";

// ============================================================================
// 错误
// ============================================================================

export class OwnershipError extends Error {
  constructor(resourceType: string) {
    super(`FORBIDDEN: ${resourceType} does not belong to this user`);
    this.name = "OwnershipError";
  }
}

// ============================================================================
// Plan ownership
// ============================================================================

/**
 * 校验 plan 归属：plan.userId === userId
 * 返回 plan 对象（调用方已确认拥有）
 */
export async function assertPlanOwnership(
  db: PrismaClient,
  planId: string,
  userId: string,
): Promise<Plan> {
  const plan = await db.plan.findUnique({ where: { id: planId } });
  if (!plan) throw new Error("NOT_FOUND");
  if (plan.userId !== userId) throw new OwnershipError("PLAN");
  return plan;
}

// ============================================================================
// Conversation ownership
// ============================================================================

/**
 * 校验 conversation 归属：userId 或 guestId 匹配
 * 注意：conversation 可能属于登录用户或游客
 */
export async function assertConversationOwnership(
  db: PrismaClient,
  conversationId: string,
  userId: string | null,
  guestId: string | null,
): Promise<Conversation> {
  const conv = await db.conversation.findUnique({ where: { id: conversationId } });
  if (!conv) throw new Error("NOT_FOUND");
  const ownedByUser = conv.userId === userId;
  const ownedByGuest = !conv.userId && conv.guestId === guestId;
  if (!ownedByUser && !ownedByGuest) throw new OwnershipError("CONVERSATION");
  return conv;
}

// ============================================================================
// Share room ownership
// ============================================================================

/**
 * 校验 share room 归属：room.userId === userId
 */
export async function assertShareRoomOwnership(
  db: PrismaClient,
  roomId: string,
  userId: string,
): Promise<ShareRoom> {
  const room = await db.shareRoom.findUnique({ where: { id: roomId } });
  if (!room) throw new Error("NOT_FOUND");
  if (room.userId !== userId) throw new OwnershipError("SHARE_ROOM");
  return room;
}

// ============================================================================
// Handoff ownership
// ============================================================================

/**
 * 校验 handoff conversation 归属（用于创建 handoff 前校验）
 * 复用 assertConversationOwnership 的逻辑
 */
export async function assertHandoffConversationOwnership(
  db: PrismaClient,
  conversationId: string,
  userId: string | null,
  guestId: string | null,
): Promise<void> {
  const conv = await db.conversation.findUnique({ where: { id: conversationId } });
  if (!conv) throw new Error("HANDOFF_CONVERSATION_NOT_FOUND");
  const ownedByUser = conv.userId === userId;
  const ownedByGuest = !conv.userId && conv.guestId === guestId;
  if (!ownedByUser && !ownedByGuest) throw new OwnershipError("HANDOFF_CONVERSATION");
}

// ============================================================================
// Action ownership
// ============================================================================

/**
 * 校验 action 归属（DB 版本）
 */
export async function assertActionOwnership(
  db: PrismaClient,
  actionId: string,
  userId: string,
): Promise<Action> {
  const action = await db.action.findUnique({ where: { id: actionId } });
  if (!action) throw new Error("NOT_FOUND");
  if (action.userId !== userId) throw new OwnershipError("ACTION");
  return action;
}

// ============================================================================
// Developer app/webhook ownership
// ============================================================================

/**
 * 校验 developer app 归属
 */
export async function assertAppOwnership(
  db: PrismaClient,
  appId: string,
  userId: string,
): Promise<DeveloperApp> {
  const app = await db.developerApp.findUnique({ where: { id: appId } });
  if (!app) throw new Error("APP_NOT_FOUND");
  if (app.userId !== userId) throw new OwnershipError("APP");
  return app;
}

/**
 * 校验 webhook 归属
 */
export async function assertWebhookOwnership(
  db: PrismaClient,
  webhookId: string,
  userId: string,
): Promise<Webhook> {
  const webhook = await db.webhook.findUnique({ where: { id: webhookId } });
  if (!webhook) throw new Error("WEBHOOK_NOT_FOUND");
  if (webhook.userId !== userId) throw new OwnershipError("WEBHOOK");
  return webhook;
}
