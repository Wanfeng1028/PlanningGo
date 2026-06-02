/**
 * JWT 认证守卫插件
 * 通过 Fastify preHandler 钩子保护路由
 *
 * 使用方式：
 *   app.get("/protected", { preHandler: [app.authGuard] }, handler)
 *   app.get("/admin", { preHandler: [app.authGuard, app.adminGuard] }, handler)
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import fp from "fastify-plugin";
import { verifyAccessToken, type AccessTokenPayload } from "../common/crypto.js";
import { sendError } from "../common/response.js";

declare module "fastify" {
  interface FastifyInstance {
    authGuard: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    optionalAuthGuard: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    adminGuard: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    userId?: string;
    userRole?: string;
    userEmail?: string;
  }
}

function extractToken(request: FastifyRequest): string | undefined {
  const auth = request.headers.authorization;
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  return undefined;
}

async function authPlugin(app: FastifyInstance) {
  // 必须认证
  app.decorate("authGuard", async (request: FastifyRequest, reply: FastifyReply) => {
    const token = extractToken(request);
    if (!token) {
      return sendError(reply, 401, "UNAUTHORIZED", "缺少认证令牌");
    }
    try {
      const payload: AccessTokenPayload = verifyAccessToken(token);
      request.userId = payload.sub;
      request.userRole = payload.role;
      request.userEmail = payload.email;
    } catch {
      return sendError(reply, 401, "TOKEN_EXPIRED", "令牌无效或已过期");
    }
  });

  // 可选认证（guest 接口）
  app.decorate("optionalAuthGuard", async (request: FastifyRequest, reply: FastifyReply) => {
    const token = extractToken(request);
    if (!token) return;
    try {
      const payload: AccessTokenPayload = verifyAccessToken(token);
      request.userId = payload.sub;
      request.userRole = payload.role;
      request.userEmail = payload.email;
    } catch {
      // token 无效 — 通过 header 通知前端刷新
      // 不阻断请求（仍可作为未登录访问），但前端收到 header 后应主动 refresh
      reply.header("x-token-expired", "1");
    }
  });

  // 管理员权限
  app.decorate("adminGuard", async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.userRole !== "admin") {
      return sendError(reply, 403, "FORBIDDEN", "需要管理员权限");
    }
  });
}

export default fp(authPlugin, { name: "auth" });
