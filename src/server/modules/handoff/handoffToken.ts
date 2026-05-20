import { createId } from "../../common/id";
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
  const nonce = Math.random().toString(36).substring(2, 15);
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
  // Simple hash for demonstration - in production use proper crypto
  let hash = 0;
  for (let i = 0; i < token.length; i++) {
    const char = token.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString(16);
}
