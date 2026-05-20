/**
 * Redis 插件
 * 提供 ioredis 客户端，支持 graceful shutdown
 */

import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import Redis from "ioredis";

declare module "fastify" {
  interface FastifyInstance {
    redis: Redis | null;
  }
}

async function redisPlugin(app: FastifyInstance) {
  const url = process.env.REDIS_URL ?? "redis://localhost:6379/0";
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
    app.log.warn("⚠️  Redis not available, sessions will be in-memory only");
    app.decorate("redis", null);
  }

  app.addHook("onClose", async () => {
    if (redis) {
      try { await redis.quit(); } catch { /* ignore */ }
    }
  });
}

export default fp(redisPlugin, { name: "redis" });
