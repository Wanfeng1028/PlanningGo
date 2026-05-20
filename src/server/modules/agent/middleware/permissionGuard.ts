/**
 * Permission scope types
 */
export type PermissionScope =
  | "location.read"
  | "profile.read"
  | "memory.write"
  | "calendar.write"
  | "navigation.open"
  | "reservation.create"
  | "share.send"
  | "notification.send"
  | "mobile.continue";

/**
 * User permission snapshot
 */
export interface UserPermissionSnapshot {
  locationEnabled: boolean;
  memoryEnabled: boolean;
  calendarEnabled: boolean;
  shareEnabled: boolean;
  developerEnabled: boolean;
  grantedScopes: PermissionScope[];
}

/**
 * Check if user has required permission
 */
export function hasPermission(
  snapshot: UserPermissionSnapshot,
  requiredScope: PermissionScope,
): boolean {
  return snapshot.grantedScopes.includes(requiredScope);
}

/**
 * Check if action requires permission
 */
export function requiresPermission(actionType: string): PermissionScope | null {
  const permissionMap: Record<string, PermissionScope> = {
    navigation: "navigation.open",
    calendar_event: "calendar.write",
    share_message: "share.send",
    restaurant_reservation: "reservation.create",
    ticket_lock: "reservation.create",
    notification: "notification.send",
  };

  return permissionMap[actionType] || null;
}

/**
 * Filter actions based on user permissions
 */
export function filterActionsByPermissions<T extends { type: string }>(
  actions: T[],
  snapshot: UserPermissionSnapshot,
): { allowed: T[]; blocked: T[] } {
  const allowed: T[] = [];
  const blocked: T[] = [];

  for (const action of actions) {
    const requiredScope = requiresPermission(action.type);
    if (!requiredScope || hasPermission(snapshot, requiredScope)) {
      allowed.push(action);
    } else {
      blocked.push(action);
    }
  }

  return { allowed, blocked };
}
