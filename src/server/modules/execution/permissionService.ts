import type { PermissionScope, UserPermissionSnapshot } from "../agent/middleware/permissionGuard";

// Use a lazy-loaded Prisma client to avoid initialization issues
let prismaInstance: any = null;

function getPrisma() {
  if (!prismaInstance) {
    try {
      const { PrismaClient } = require("../../generated/prisma/client.js");
      prismaInstance = new PrismaClient();
    } catch (error) {
      console.warn("Prisma client not available, using mock implementation");
      prismaInstance = createMockPrisma();
    }
  }
  return prismaInstance;
}

function createMockPrisma() {
  return {
    userPermission: {
      findUnique: async () => null,
    },
  };
}

/**
 * User execution grant
 */
export interface UserExecutionGrant {
  id: string;
  userId?: string;
  guestId?: string;
  scopes: PermissionScope[];
  city?: string;
  planId?: string;
  expiresAt: string;
  maxActions: number;
  maxAmountCny?: number;
  grantedFrom: "desktop" | "mobile";
  deviceId?: string;
}

/**
 * Create a user execution grant
 */
export async function createExecutionGrant(params: {
  userId?: string;
  guestId?: string;
  scopes: PermissionScope[];
  city?: string;
  planId?: string;
  maxActions: number;
  maxAmountCny?: number;
  grantedFrom: "desktop" | "mobile";
  deviceId?: string;
}): Promise<UserExecutionGrant> {
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

  // In production, this would be stored in the database
  // For now, return a mock grant
  return {
    id: `grant_${Date.now()}`,
    userId: params.userId,
    guestId: params.guestId,
    scopes: params.scopes,
    city: params.city,
    planId: params.planId,
    expiresAt: expiresAt.toISOString(),
    maxActions: params.maxActions,
    maxAmountCny: params.maxAmountCny,
    grantedFrom: params.grantedFrom,
    deviceId: params.deviceId,
  };
}

/**
 * Check if a grant is valid and has the required scope
 */
export function validateGrant(grant: UserExecutionGrant, requiredScope: PermissionScope): boolean {
  // Check expiration
  if (new Date() > new Date(grant.expiresAt)) {
    return false;
  }

  // Check scope
  if (!grant.scopes.includes(requiredScope)) {
    return false;
  }

  return true;
}

/**
 * Get user permission snapshot from database
 */
export async function getUserPermissionSnapshot(
  userId?: string,
  guestId?: string,
): Promise<UserPermissionSnapshot> {
  const prisma = getPrisma();

  if (userId) {
    const permission = await prisma.userPermission.findUnique({
      where: { userId },
    });

    if (permission) {
      return {
        locationEnabled: permission.locationEnabled,
        memoryEnabled: permission.memoryEnabled,
        calendarEnabled: permission.calendarEnabled,
        shareEnabled: permission.shareEnabled,
        developerEnabled: permission.developerEnabled,
        grantedScopes: [],
      };
    }
  }

  // Default permissions for guest
  return {
    locationEnabled: true,
    memoryEnabled: true,
    calendarEnabled: false,
    shareEnabled: true,
    developerEnabled: false,
    grantedScopes: [],
  };
}
