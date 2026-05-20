/**
 * 美团 OAuth 登录路由（Stub）
 *
 * 需要环境变量：
 *   MEITUAN_APP_KEY      - 美团开放平台 AppKey
 *   MEITUAN_APP_SECRET   - 美团开放平台 AppSecret
 *   MEITUAN_REDIRECT_URI - OAuth 回调地址
 *
 * 当未配置时返回 501 NOT_IMPLEMENTED
 */

import type { FastifyInstance } from "fastify";
import { sendError, sendOk } from "../common/response.js";

export async function registerMeituanRoutes(app: FastifyInstance) {
  // ── GET /api/auth/meituan/start ──
  // 发起美团 OAuth 授权
  app.get("/api/auth/meituan/start", async (request, reply) => {
    const appKey = process.env.MEITUAN_APP_KEY;
    const redirectUri = process.env.MEITUAN_REDIRECT_URI;

    if (!appKey || !redirectUri) {
      return sendError(
        reply,
        501,
        "MEITUAN_NOT_CONFIGURED",
        "美团登录暂未配置，请在 .env 中设置 MEITUAN_APP_KEY 和 MEITUAN_REDIRECT_URI",
      );
    }

    // 构建美团 OAuth 授权 URL
    const state = Math.random().toString(36).slice(2, 10);
    const authUrl = new URL("https://openapi.meituan.com/oauth2/authorize");
    authUrl.searchParams.set("app_key", appKey);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("state", state);

    sendOk(reply, { url: authUrl.toString(), state });
  });

  // ── GET /api/auth/meituan/callback ──
  // 美团 OAuth 回调
  app.get("/api/auth/meituan/callback", async (request, reply) => {
    const appKey = process.env.MEITUAN_APP_KEY;
    const appSecret = process.env.MEITUAN_APP_SECRET;

    if (!appKey || !appSecret) {
      return sendError(reply, 501, "MEITUAN_NOT_CONFIGURED", "美团登录暂未配置");
    }

    // TODO: 实现完整的 OAuth code 换 token + 获取用户信息流程
    return sendError(reply, 501, "NOT_IMPLEMENTED", "美团回调处理正在开发中");
  });
}
