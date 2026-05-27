/**
 * Redis 插件
 * 提供 ioredis 客户端，支持 graceful shutdown
 */

import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import Redis from "ioredis";
import { env } from "../config/env.js";

declare module "fastify" {
  interface FastifyInstance {
    redis: Redis | null;
  }
}

async function redisPlugin(app: FastifyInstance) {
  const url = env.REDIS_URL;
  let redis: Redis | null = null;
  try {
    redis = new Redis(url, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 3) return null;
        return Math.min(times * 200, 2000);
      },
      lazyConnect: true,
    });
    await redis.connect();
    app.decorate("redis", redis);
    app.log.info("✅ Redis connected");
  } catch (err) {
    app.log.error(
      { error: err instanceof Error ? err.message : String(err) },
      "Redis connection failed",
    );

    if (env.NODE_ENV === "production") {
      throw err;
    }

    app.log.warn("Redis not available, sessions will be in-memory only in non-production mode");
    app.decorate("redis", null);
  }

  app.addHook("onClose", async () => {
    if (redis) {
      try { await redis.quit(); } catch { /* ignore */ }
    }
  });
}

export default fp(redisPlugin, { name: "redis" });
