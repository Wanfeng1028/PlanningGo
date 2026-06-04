/**
 * Share 路由 — 安全加固版
 *
 * 修复:
 * - 创建 share room 时关联 userId
 * - title/memberName/comment 长度限制 + sanitize
 * - members 数量限制
 * - vote 接口限流
 * - 公开展示内容确保 sanitize
 *
 * OWASP: BOLA, XSS, Unrestricted Resource Consumption
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { listShareRooms, createShareRoom, vote } from "../services/store.js";
import { NotFoundError } from "../common/errors.js";
import { sendOk, sendError } from "../common/response.js";
import { requireUserId } from "../common/uid.js";
import {
  sanitizeShareTitle,
  sanitizeMemberName,
  sanitizeComment,
  validateShareInput,
  validateVoteInput,
  sanitizeHtmlForRender,
} from "../common/ugcSanitizer.js";
import { getRateLimiter } from "../common/rateLimiter.js";
import { VOTE_RULE } from "../common/rateLimiter.js";

const uid = requireUserId;

function buildCollaborationSummary(members: Array<{ name: string; vote: "yes" | "no" | "pending"; comment?: string }>) {
  const agreed = members.filter((member) => member.vote === "yes").length;
  const rejected = members.filter((member) => member.vote === "no");
  const pending = members.filter((member) => member.vote === "pending").length;
  return {
    agreed,
    pending,
    conflicts: rejected.length,
    majorFeedback: rejected
      .map((member) => member.comment || `${member.name}想调整`)
      .slice(0, 3),
    nextAction: rejected.length > 0 ? "基于反馈调整方案" : pending > 0 ? "等待同行人确认" : "全员已确认，可继续执行",
  };
}

function withShareSummary<T extends { members: Array<{ name: string; vote: "yes" | "no" | "pending"; comment?: string }> }>(room: T) {
  return {
    ...room,
    collaboration: buildCollaborationSummary(room.members),
  };
}

export async function registerShareRoutes(app: FastifyInstance) {
  // ── 获取分享房间列表（公开） ──
  app.get("/api/share/rooms", { preHandler: [app.optionalAuthGuard] }, async () => {
    const rooms = listShareRooms();
    // 公开展示时 sanitize HTML
    return {
      items: rooms.map((room) => ({
        ...withShareSummary(room),
        title: sanitizeHtmlForRender(String(room.title)),
      })),
    };
  });

  // ── 创建分享房间 ──
  app.post("/api/share/rooms", { preHandler: [app.authGuard] }, async (request, reply) => {
    const userId = uid(request);
    const rawBody = request.body as Record<string, unknown>;

    // 先做结构化校验
    const validation = validateShareInput({
      title: (typeof rawBody?.title === "string" ? rawBody.title : "") as string,
      members: Array.isArray(rawBody?.members) ? rawBody.members : undefined,
    });
    if (!validation.ok) {
      return sendError(reply, 400, "VALIDATION_ERROR", validation.error);
    }

    // 对输入做 sanitize
    const title = sanitizeShareTitle(rawBody.title as string);
    const members = (Array.isArray(rawBody.members) ? rawBody.members : []).map(
      (m: Record<string, unknown>) => ({
        name: sanitizeMemberName(String(m.name ?? "")),
        vote: (m.vote as "yes" | "no" | "pending") ?? "pending",
        comment: m.comment ? sanitizeComment(String(m.comment)) : undefined,
      }),
    );

    const planId = typeof rawBody.planId === "string" ? rawBody.planId : undefined;

    const room = createShareRoom({
      title,
      members,
      userId, // 关联创建者
      planId: planId ?? "",
    });

    return sendOk(reply, withShareSummary(room));
  });

  // ── 投票 ──
  app.post("/api/share/rooms/:id/vote", { preHandler: [app.authGuard] }, async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const userId = uid(request);
    const body = z
      .object({ memberName: z.string(), vote: z.enum(["yes", "no"]), comment: z.string().optional() })
      .parse(request.body);

    // 限流：每 IP 每分钟最多 5 次投票
    const limiter = getRateLimiter();
    if (limiter) {
      const rateLimit = await limiter.check(`vote:${request.ip}`, VOTE_RULE);
      if (!rateLimit.allowed) {
        return sendError(reply, 429, "RATE_LIMIT_EXCEEDED", "投票过于频繁，请稍后再试");
      }
    }

    // 校验输入
    const voteValidation = validateVoteInput(body);
    if (!voteValidation.ok) {
      return sendError(reply, 400, "VALIDATION_ERROR", voteValidation.error);
    }

    // sanitize 输入
    const memberName = sanitizeMemberName(body.memberName);
    const comment = body.comment ? sanitizeComment(body.comment) : undefined;

    const next = vote(params.id, memberName, body.vote, comment);
    if (!next) throw new NotFoundError("SHARE_ROOM_NOT_FOUND");

    return sendOk(reply, {
      ...withShareSummary(next),
      title: sanitizeHtmlForRender(String(next.title)),
    });
  });
}
