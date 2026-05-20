/**
 * 美团 OAuth 登录路由（Stub）
 *
 * 环境变量通过 env.ts 统一管理，未配置时返回 200 + { configured: false }
 */

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
    const state = Math.random().toString(36).slice(2, 10);
    const authUrl = new URL(authUrlBase);
    authUrl.searchParams.set("app_key", appKey);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("state", state);

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

    // TODO: 实现完整的 OAuth code 换 token + 获取用户信息流程
    return sendOk(reply, {
      configured: true,
      implemented: false,
      message: "美团回调处理正在开发中",
    });
  });
}
