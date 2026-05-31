/**
 * Prisma 数据库插件
 * 在 Fastify 生命周期内管理 PrismaClient 连接/断开
 */

import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { PrismaClient } from "../../generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { setPrismaInstance } from "../common/prisma.js";
import { env } from "../config/env.js";

declare module "fastify" {
  interface FastifyInstance {
    db: PrismaClient | null;
  }
}

/** 清理 7 天前的 Guest 账号及其关联数据 */
async function cleanupExpiredGuests(db: PrismaClient, log: FastifyInstance["log"]) {
  try {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const expiredGuests = await db.user.findMany({
      where: { mode: "guest", createdAt: { lt: cutoff } },
      select: { id: true },
      take: 100,
    });

    if (expiredGuests.length === 0) return;

    const ids = expiredGuests.map((g) => g.id);
    log.info({ count: ids.length }, "Cleaning up expired guest accounts");

    await db.$transaction([
      db.message.deleteMany({ where: { conversation: { userId: { in: ids } } } }),
      db.conversation.deleteMany({ where: { userId: { in: ids } } }),
      db.memory.deleteMany({ where: { userId: { in: ids } } }),
      db.plan.deleteMany({ where: { userId: { in: ids } } }),
      db.action.deleteMany({ where: { userId: { in: ids } } }),
      db.reservation.deleteMany({ where: { userId: { in: ids } } }),
      db.shareRoom.deleteMany({ where: { userId: { in: ids } } }),
      db.userProfile.deleteMany({ where: { userId: { in: ids } } }),
      db.userPermission.deleteMany({ where: { userId: { in: ids } } }),
      db.refreshToken.deleteMany({ where: { userId: { in: ids } } }),
      db.notification.deleteMany({ where: { userId: { in: ids } } }),
      db.userSession.deleteMany({ where: { userId: { in: ids } } }),
      db.userEvent.deleteMany({ where: { userId: { in: ids } } }),
      db.user.deleteMany({ where: { id: { in: ids } } }),
    ]);

    log.info({ count: ids.length }, "Expired guest accounts cleaned up");
  } catch (err) {
    log.warn({ err }, "Guest cleanup failed (non-critical)");
  }
}

async function dbPlugin(app: FastifyInstance) {
  const connectionString = env.DATABASE_URL;
  let db: PrismaClient | null = null;
  let cleanupTimer: ReturnType<typeof setInterval> | null = null;

  try {
    const adapter = new PrismaPg({ connectionString });
    db = new PrismaClient({ adapter });
    await db.$connect();
    await db.$queryRaw`SELECT 1`;
    setPrismaInstance(db);
    app.decorate("db", db);
    app.log.info("? PostgreSQL connected");

    // 每小时清理过期 Guest 账号
    cleanupTimer = setInterval(() => {
      if (db) cleanupExpiredGuests(db, app.log);
    }, 60 * 60 * 1000);

    // 启动时执行一次清理（延迟 30 秒避免影响启动速度）
    setTimeout(() => {
      if (db) cleanupExpiredGuests(db, app.log);
    }, 30_000);
  } catch (err) {
    app.log.error(
      { error: err instanceof Error ? err.message : String(err) },
      "PostgreSQL connection failed",
    );
    if (db) { try { await db.$disconnect(); } catch { /* */ } }

    if (env.NODE_ENV === "production") {
      throw err;
    }

    app.log.warn("PostgreSQL not available, using in-memory fallback in non-production mode");
    app.decorate("db", null);
  }

  app.addHook("onClose", async () => {
    if (cleanupTimer) clearInterval(cleanupTimer);
    if (db) {
      try { await db.$disconnect(); } catch { /* ignore */ }
    }
  });
}

export default fp(dbPlugin, { name: "db" });
