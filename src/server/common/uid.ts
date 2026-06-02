import { UnauthorizedError } from "./errors";

/**
 * 从已认证请求中提取 userId，未登录时抛出 401
 */
export function requireUserId(request: { userId?: string }): string {
  const id = request.userId;
  if (!id) throw new UnauthorizedError("未登录");
  return id;
}

/**
 * 从可选认证请求中提取 userId，未登录时返回 null
 */
export function optionalUserId(request: { userId?: string }): string | null {
  return request.userId ?? null;
}
