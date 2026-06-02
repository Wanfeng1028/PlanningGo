/**
 * 美团 OAuth 登录路由（Stub）
 *
 * 环境变量通过 env.ts 统一管理，未配置时返回 200 + { configured: false }
 */

import crypto from "node:crypto";
import type { FastifyInstance } from "fastify";
import { sendOk } from "../common/response.js";
import { env } from "../config/env.js";

export async function registerMeituanRoutes(app: FastifyInstance) {
  // ── GET /api/auth/meituan/start ──
  app.get("/api/auth/meituan/start", async (request, reply) => {
    const appKey = env.MEITUAN_APP_KEY;
    const redirectUri = env.MEITUAN_REDIRECT_URI;

    if (!appKey || !redirectUri) {
      return sendOk(reply, {
        configured: false,
        authUrl: null,
        message: "美团登录尚未配置",
      });
    }

    const authUrlBase = env.MEITUAN_AUTH_URL || "https://openapi.meituan.com/oauth2/authorize";
    const state = crypto.randomBytes(16).toString("hex");
    const authUrl = new URL(authUrlBase);
    authUrl.searchParams.set("app_key", appKey);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("state", state);

    // 存储 state 到 cookie 以便回调时验证
    reply.setCookie("meituan_oauth_state", state, {
      path: "/",
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600, // 10 分钟过期
    });

    sendOk(reply, { configured: true, authUrl: authUrl.toString(), state });
  });

  // ── GET /api/auth/meituan/callback ──
  app.get("/api/auth/meituan/callback", async (request, reply) => {
    const appKey = env.MEITUAN_APP_KEY;
    const appSecret = env.MEITUAN_APP_SECRET;

    if (!appKey || !appSecret) {
      return sendOk(reply, {
        configured: false,
        message: "美团登录暂未配置",
      });
    }

    // 验证 OAuth state 参数防 CSRF
    const query = request.query as Record<string, string | undefined>;
    const returnedState = query.state;
    const savedState = (request as unknown as { cookies?: Record<string, string> })?.cookies?.meituan_oauth_state;
    if (!returnedState || !savedState || returnedState !== savedState) {
      reply.clearCookie("meituan_oauth_state", { path: "/" });
      return sendOk(reply, { configured: true, implemented: false, message: "OAuth state 验证失败，请重新登录" });
    }
    reply.clearCookie("meituan_oauth_state", { path: "/" });

    // TODO: 实现完整的 OAuth code 换 token + 获取用户信息流程
    return sendOk(reply, {
      configured: true,
      implemented: false,
      message: "美团回调处理正在开发中",
    });
  });
}
