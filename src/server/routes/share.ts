/**
 * Share 路由
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { listShareRooms, createShareRoom, vote } from "../services/store.js";
import { NotFoundError } from "../common/errors.js";
import { sendOk } from "../common/response.js";

export async function registerShareRoutes(app: FastifyInstance) {
  app.get("/api/share/rooms", { preHandler: [app.optionalAuthGuard] }, async () => ({
    items: listShareRooms(),
  }));

  app.post("/api/share/rooms", { preHandler: [app.optionalAuthGuard] }, async (request) => {
    const input = z
      .object({
        planId: z.string(),
        title: z.string(),
        members: z.array(
          z.object({
            name: z.string(),
            vote: z.enum(["yes", "no", "pending"]).default("pending"),
            comment: z.string().optional(),
          }),
        ),
      })
      .parse(request.body);
    return createShareRoom(input);
  });

  app.post("/api/share/rooms/:id/vote", { preHandler: [app.optionalAuthGuard] }, async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const body = z
      .object({ memberName: z.string(), vote: z.enum(["yes", "no"]), comment: z.string().optional() })
      .parse(request.body);
    const next = vote(params.id, body.memberName, body.vote, body.comment);
    if (!next) throw new NotFoundError("SHARE_ROOM_NOT_FOUND");
    return sendOk(reply, next);
  });
}
