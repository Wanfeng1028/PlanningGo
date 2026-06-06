/**
 * Reservations 路由
 *
 * 安全修复 (#6)：生产环境需要 auth 保护，内存 mock store 不应匿名公开。
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { listReservations, upsertReservation, updateReservationStatus } from "../services/store.js";
import { NotFoundError } from "../common/errors.js";
import { sendOk } from "../common/response.js";
import { env } from "../config/env.js";

export async function registerReservationRoutes(app: FastifyInstance) {
  // 安全修复 (#6)：生产环境要求登录
  const reservationGuard = env.NODE_ENV === "production" ? [app.authGuard] : [app.optionalAuthGuard];

  app.get("/api/reservations", { preHandler: reservationGuard }, async (request, reply) =>
    sendOk(reply, { items: listReservations() }),
  );

  app.post("/api/reservations", { preHandler: reservationGuard }, async (request) => {
    const input = z
      .object({
        type: z.enum(["restaurant", "ticket", "activity", "delivery"]),
        title: z.string(),
        status: z.enum(["draft", "holding", "confirmed", "failed"]).default("draft"),
        price: z.string().optional(),
        detail: z.string(),
      })
      .parse(request.body);
    return upsertReservation(input);
  });

  app.patch("/api/reservations/:id/status", { preHandler: reservationGuard }, async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({ status: z.enum(["draft", "holding", "confirmed", "failed"]) }).parse(request.body);
    const next = updateReservationStatus(params.id, body.status);
    if (!next) throw new NotFoundError("RESERVATION_NOT_FOUND");
    return sendOk(reply, next);
  });
}
