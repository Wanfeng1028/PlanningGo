/**
 * Prisma 数据库插件
 * 在 Fastify 生命周期内管理 PrismaClient 连接/断开
 */

import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { PrismaClient } from "../../generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

declare module "fastify" {
  interface FastifyInstance {
    db: PrismaClient | null;
  }
}

async function dbPlugin(app: FastifyInstance) {
  const connectionString = process.env.DATABASE_URL ?? "postgresql://planninggo:planninggo@localhost:5432/planninggo?schema=public";
  let db: PrismaClient | null = null;
  try {
    const adapter = new PrismaPg({ connectionString });
    db = new PrismaClient({ adapter });
    await db.$connect();
    // 验证连接真正可用（$connect 是懒连接，不会真正验证凭据）
    await db.$queryRaw`SELECT 1`;
    app.decorate("db", db);
    app.log.info("✅ PostgreSQL connected");
  } catch (err) {
    app.log.error(
      { error: err instanceof Error ? err.message : String(err) },
      "PostgreSQL connection failed",
    );
    if (db) { try { await db.$disconnect(); } catch { /* */ } }

    if (process.env.NODE_ENV === "production") {
      throw err;
    }

    app.log.warn("PostgreSQL not available, using in-memory fallback in non-production mode");
    app.decorate("db", null);
  }

  app.addHook("onClose", async () => {
    if (db) {
      try { await db.$disconnect(); } catch { /* ignore */ }
    }
  });
}

export default fp(dbPlugin, { name: "db" });
