/**
 * 安全头 + Cookie 插件
 */

import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import helmet from "@fastify/helmet";
import cookie from "@fastify/cookie";
import { env } from "../config/env.js";

async function securityPlugin(app: FastifyInstance) {
  const isProd = env.NODE_ENV === "production";

  // CSP: 生产环境启用基础策略，开发环境关闭（HMR 需要 eval）
  await app.register(helmet, {
    contentSecurityPolicy: isProd
      ? {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", ...parseCorsOrigins(env.CORS_ORIGINS)],
            fontSrc: ["'self'"],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
            frameAncestors: ["'none'"],
          },
        }
      : false,
  });

  // Cookie secret: 生产必须使用 env.COOKIE_SECRET，不能 fallback
  const cookieSecret = env.COOKIE_SECRET;
  if (isProd && !cookieSecret) {
    throw new Error("[security] 生产环境必须配置 COOKIE_SECRET 环境变量");
  }

  await app.register(cookie, {
    secret: cookieSecret ?? "dev-cookie-secret-not-for-production",
  });
}

function parseCorsOrigins(origins: string): string[] {
  return origins
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export default fp(securityPlugin, { name: "security" });
