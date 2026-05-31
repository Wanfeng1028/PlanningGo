/**
 * Auth 路由 — 注册 / 登录 / Guest / Refresh / Logout
 * 支持 PostgreSQL 和内存 fallback 两种模式
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { UserRepository } from "../repositories/userRepository.js";
import { ProfileRepository } from "../repositories/profileRepository.js";
import { TokenService } from "../services/tokenService.js";
import { AuthService } from "../services/authService.js";
import * as mem from "../services/memoryStore.js";
import { sendOk, sendCreated, sendNoContent, sendError } from "../common/response.js";
import { env } from "../config/env.js";

const registerSchema = z.object({
  email: z.string().email("邮箱格式不正确"),
  password: z.string().min(6, "密码至少6位"),
  displayName: z.string().max(50).optional(),
  name: z.string().max(50).optional(),
  city: z.string().optional(),
  startPoint: z.string().optional(),
  companions: z.string().optional(),
  budgetMin: z.number().int().optional(),
  budgetMax: z.number().int().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});

const guestProfileSchema = z.object({
  city: z.string().optional(),
  startPoint: z.string().optional(),
  companions: z.enum(["family", "friends", "couple", "solo"]).optional(),
  budgetMin: z.number().int().optional(),
  budgetMax: z.number().int().optional(),
  homeLat: z.number().optional(),
  homeLng: z.number().optional(),
  locationLabel: z.string().optional(),
  locationSource: z.enum(["browser", "manual", "default"]).optional(),
}).optional();

const changePasswordSchema = z.object({
  oldPassword: z.string().min(1).optional(),
  currentPassword: z.string().min(1).optional(),
  newPassword: z.string().min(6),
}).refine((data) => data.oldPassword || data.currentPassword, {
  message: "oldPassword 或 currentPassword 必填其一",
});

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(6),
});

function getClientMeta(request: { headers: Record<string, string | string[] | undefined>; ip: string }) {
  return {
    userAgent: typeof request.headers["user-agent"] === "string" ? request.headers["user-agent"] : undefined,
    ipAddress: request.ip,
  };
}

export async function registerAuthRoutes(app: FastifyInstance) {
  // 判断是否使用内存模式
  const useMemory = !app.db;

  if (!useMemory) {
    // ── PostgreSQL 模式 ──
    const db = app.db!;
    const userRepo = new UserRepository(db);
    const profileRepo = new ProfileRepository(db);
    const tokenService = new TokenService(userRepo);
    const authService = new AuthService(userRepo, profileRepo, tokenService);

    app.post("/api/auth/register", { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (request, reply) => {
      const body = registerSchema.parse(request.body);
      const displayName = body.displayName ?? body.name ?? body.email.split("@")[0];
      const result = await authService.register(body.email, body.password, displayName, getClientMeta(request));
      // 创建用户画像（如果数据库可用）
      if (app.db && body.city) {
        try {
          await app.db.userProfile.upsert({
            where: { userId: result.user.id },
            update: {
              city: body.city,
              startPoint: body.startPoint,
              companions: body.companions ?? "solo",
              budgetMin: body.budgetMin,
              budgetMax: body.budgetMax,
            },
            create: {
              userId: result.user.id,
              city: body.city,
              startPoint: body.startPoint,
              companions: body.companions ?? "solo",
              budgetMin: body.budgetMin,
              budgetMax: body.budgetMax,
            },
          });
        } catch (profileErr) {
          app.log.warn({ err: profileErr }, "注册后画像创建失败（非阻断）");
        }
      }
      return sendCreated(reply, result);
    });

    app.post("/api/auth/login", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (request, reply) => {
      const body = loginSchema.parse(request.body);
      const result = await authService.login(body.email, body.password, getClientMeta(request));
      return sendOk(reply, result);
    });

    app.post("/api/auth/guest", async (request, reply) => {
      const profile = guestProfileSchema.parse(request.body) ?? undefined;
      const result = await authService.guestLogin(getClientMeta(request), profile);
      return sendCreated(reply, result);
    });

    app.post("/api/auth/demo", async (request, reply) => {
      if (!env.ENABLE_DEMO_AUTH) {
        return sendError(reply, 404, "NOT_FOUND", "Not found");
      }
      const result = await authService.demoLogin(getClientMeta(request));
      return sendOk(reply, result);
    });

    app.post("/api/auth/refresh", async (request, reply) => {
      const body = refreshTokenSchema.parse(request.body);
      const result = await tokenService.refreshTokens(body.refreshToken, getClientMeta(request));
      if (!result) return sendError(reply, 401, "TOKEN_EXPIRED", "Refresh token 无效或已过期");
      return sendOk(reply, result);
    });

    app.post("/api/auth/logout", { preHandler: [app.optionalAuthGuard] }, async (request, reply) => {
      const body = refreshTokenSchema.parse(request.body);
      await tokenService.revokeRefreshToken(body.refreshToken);
      return sendNoContent(reply);
    });

    app.post("/api/auth/logout-all", { preHandler: [app.authGuard] }, async (request, reply) => {
      await tokenService.revokeAllTokens(request.userId!);
      return sendNoContent(reply);
    });

    app.post("/api/auth/change-password", { preHandler: [app.authGuard] }, async (request, reply) => {
      const body = changePasswordSchema.parse(request.body);
      const oldPassword = body.oldPassword ?? body.currentPassword!;
      await authService.changePassword(request.userId!, oldPassword, body.newPassword);
      return sendNoContent(reply);
    });

    app.post("/api/auth/forgot-password", { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } }, async (request, reply) => {
      const body = forgotPasswordSchema.parse(request.body);
      const result = await authService.requestPasswordReset(body.email);
      // Always return success to prevent email enumeration
      if (result && env.NODE_ENV !== "production") {
        app.log.info({ token: result.token }, "Password reset token (dev only)");
      }
      return sendOk(reply, { message: "如果该邮箱已注册，重置链接将发送到您的邮箱" });
    });

    app.post("/api/auth/reset-password", async (request, reply) => {
      const body = resetPasswordSchema.parse(request.body);
      await authService.resetPassword(body.token, body.newPassword);
      return sendOk(reply, { message: "密码已重置，请使用新密码登录" });
    });

    return;
  }

  // ── 内存 fallback 模式 ──
  app.log.info("📝 Auth routes using in-memory store (no PostgreSQL)");

  app.post("/api/auth/register", { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (request, reply) => {
    const body = registerSchema.parse(request.body);
    const displayName = body.displayName ?? body.name ?? body.email.split("@")[0];
    try {
      const result = await mem.register(body.email, body.password, displayName, getClientMeta(request));
      return sendCreated(reply, result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "注册失败";
      return sendError(reply, 409, "EMAIL_EXISTS", message);
    }
  });

  app.post("/api/auth/login", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (request, reply) => {
    const body = loginSchema.parse(request.body);
    try {
      const result = await mem.login(body.email, body.password, getClientMeta(request));
      return sendOk(reply, result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "登录失败";
      return sendError(reply, 401, "INVALID_CREDENTIALS", message);
    }
  });

  app.post("/api/auth/guest", async (request, reply) => {
    const profile = guestProfileSchema.parse(request.body) ?? undefined;
    const result = await mem.guestLogin(getClientMeta(request), profile);
    return sendCreated(reply, result);
  });

  app.post("/api/auth/demo", async (request, reply) => {
    if (!env.ENABLE_DEMO_AUTH) {
      return sendError(reply, 404, "NOT_FOUND", "Not found");
    }
    const result = await mem.demoLogin(getClientMeta(request));
    return sendOk(reply, result);
  });

  app.post("/api/auth/refresh", async (request, reply) => {
    const body = refreshTokenSchema.parse(request.body);
    const result = mem.refreshTokens(body.refreshToken, getClientMeta(request));
    if (!result) return sendError(reply, 401, "TOKEN_EXPIRED", "Refresh token 无效或已过期");
    return sendOk(reply, result);
  });

  app.post("/api/auth/logout", { preHandler: [app.optionalAuthGuard] }, async (request, reply) => {
    return sendNoContent(reply);
  });

  app.post("/api/auth/logout-all", { preHandler: [app.authGuard] }, async (request, reply) => {
    mem.revokeAllRefreshTokens(request.userId!);
    return sendNoContent(reply);
  });

  app.post("/api/auth/change-password", { preHandler: [app.authGuard] }, async (request, reply) => {
    return sendError(reply, 501, "NOT_IMPLEMENTED", "内存模式不支持修改密码，请连接 PostgreSQL");
  });
}
