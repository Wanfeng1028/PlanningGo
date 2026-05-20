/**
 * Memory 路由 — Prisma 版
 */

import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { sendOk, sendCreated, sendNoContent, sendError } from "../common/response.js";
import { UnauthorizedError } from "../common/errors.js";

function uid(req: FastifyRequest): string {
  const id = (req as any).userId;
  if (!id) throw new UnauthorizedError("未登录");
  return id;
}

export async function registerMemoryRoutes(app: FastifyInstance) {
  if (!app.db) {
    // 内存模式：返回空数据
    app.get("/api/memories", { preHandler: [app.authGuard] }, async (_req, reply) => sendOk(reply, []));
    app.post("/api/memories", { preHandler: [app.authGuard] }, async (_req, reply) => sendError(reply, 501, "NOT_IMPLEMENTED", "内存模式不支持记忆功能"));
    return;
  }
  const db = app.db;

  // GET /api/memories — 返回数组（前端直接用）
  app.get("/api/memories", async (request, reply) => {
    const userId = uid(request);
    const memories = await db.memory.findMany({
      where: { userId, deletedAt: null },
      orderBy: { weight: "desc" },
    });
    return sendOk(reply, memories);
  });

  // POST /api/memories — 创建记忆
  app.post("/api/memories", async (request, reply) => {
    const userId = uid(request);
    const input = z
      .object({
        category: z.enum(["family", "food", "route", "collaboration"]),
        title: z.string().min(1),
        detail: z.string(),
        weight: z.number().min(0).max(1).default(0.5),
      })
      .parse(request.body);

    const memory = await db.memory.create({
      data: { userId, ...input },
    });
    return sendCreated(reply, memory);
  });

  // PATCH /api/memories/:id — 更新记忆
  app.patch("/api/memories/:id", async (request, reply) => {
    const userId = uid(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z
      .object({
        category: z.enum(["family", "food", "route", "collaboration"]).optional(),
        title: z.string().min(1).optional(),
        detail: z.string().optional(),
        weight: z.number().min(0).max(1).optional(),
      })
      .parse(request.body);

    const existing = await db.memory.findFirst({ where: { id, userId, deletedAt: null } });
    if (!existing) return sendError(reply, 404, "MEMORY_NOT_FOUND", "记忆不存在");

    const memory = await db.memory.update({ where: { id }, data: body });
    return sendOk(reply, memory);
  });

  // DELETE /api/memories/:id — 软删除记忆
  app.delete("/api/memories/:id", async (request, reply) => {
    const userId = uid(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);

    const existing = await db.memory.findFirst({ where: { id, userId, deletedAt: null } });
    if (!existing) return sendError(reply, 404, "MEMORY_NOT_FOUND", "记忆不存在");

    await db.memory.update({ where: { id }, data: { deletedAt: new Date() } });
    return sendNoContent(reply);
  });
}
