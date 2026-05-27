import { createId } from "../../common/id";
import { randomBytes } from "node:crypto";
import { createHash } from "node:crypto";
import { env } from "../../config/env";
import type { PermissionScope } from "../agent/middleware/permissionGuard";

/**
 * Handoff token payload
 */
export interface HandoffTokenPayload {
  tokenId: string;
  conversationId: string;
  planId: string;
  selectedOptionId?: string;
  userId?: string;
  guestId?: string;
  scopes: PermissionScope[];
  expiresAt: string;
  nonce: string;
}

/**
 * Create a handoff token
 */
export function createHandoffToken(params: {
  conversationId: string;
  planId: string;
  selectedOptionId?: string;
  userId?: string;
  guestId?: string;
  scopes: PermissionScope[];
}): HandoffTokenPayload {
  const tokenId = createId("hnd");
  const nonce = randomBytes(16).toString("hex");
  const expiresAt = new Date(Date.now() + env.HANDOFF_TOKEN_TTL_SECONDS * 1000).toISOString();

  return {
    tokenId,
    conversationId: params.conversationId,
    planId: params.planId,
    selectedOptionId: params.selectedOptionId,
    userId: params.userId,
    guestId: params.guestId,
    scopes: params.scopes,
    expiresAt,
    nonce,
  };
}

/**
 * Validate a handoff token
 */
export function validateHandoffToken(payload: HandoffTokenPayload): boolean {
  // Check expiration
  if (new Date() > new Date(payload.expiresAt)) {
    return false;
  }

  // Check required fields
  if (!payload.tokenId || !payload.conversationId || !payload.planId) {
    return false;
  }

  return true;
}

/**
 * Generate token hash for storage (don't store the full token)
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
