/**
 * 限流插件
 * 基于 @fastify/rate-limit，支持 Redis 存储
 */

import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import rateLimit from "@fastify/rate-limit";

async function rateLimitPlugin(app: FastifyInstance) {
  await app.register(rateLimit, {
    max: 300,
    timeWindow: "1 minute",
    skipOnError: true,
    allowList: (request) =>
      request.url === "/api/health" ||
      request.url === "/api/ready" ||
      request.url.startsWith("/api/location/nearby"),
    keyGenerator: (request) => {
      return request.userId ?? request.ip;
    },
    errorResponseBuilder: (_request, context) => ({
      statusCode: 429,
      ok: false,
      error: {
        code: "RATE_LIMIT_EXCEEDED",
        message: `请求过于频繁，${Math.ceil(context.ttl / 1000)}秒后重试`,
      },
    }),
  });
}

export default fp(rateLimitPlugin, { name: "rate-limit" });
