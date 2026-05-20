import cors from "@fastify/cors";
import Fastify from "fastify";
import { ZodError } from "zod";
import { corsOrigins } from "./config/env";
import { createTraceId } from "./common/id";
import { AppError } from "./common/errors";
import { sendError } from "./common/response";
import { registerRoutes } from "./routes";

export async function buildApp() {
  const app = Fastify({
    logger: process.env.NODE_ENV === "production"
      ? { level: "info" }
      : { level: "debug", transport: { target: "pino-pretty", options: { colorize: true, translateTime: "SYS:HH:MM:ss", ignore: "pid,hostname" } } },
    bodyLimit: 1024 * 1024,
    trustProxy: true,
  });

  // ── 安全 + Cookie ──
  await app.register(import("./plugins/security.js"));

  // ── CORS ──
  await app.register(cors, { origin: corsOrigins });

  // ── 数据库 + Redis ──
  await app.register(import("./plugins/db.js"));
  await app.register(import("./plugins/redis.js"));

  // ── 限流 ──
  await app.register(import("./plugins/rateLimit.js"));

  // ── 认证守卫 ──
  await app.register(import("./plugins/auth.js"));

  // ── Provider 适配器 ──
  await app.register(import("./plugins/providers.js"));

  // ── TraceId 注入 ──
  app.addHook("onRequest", async (request, reply) => {
    const incomingTraceId = request.headers["x-trace-id"];
    const traceId = typeof incomingTraceId === "string" ? incomingTraceId : createTraceId();
    (request as typeof request & { traceId: string }).traceId = traceId;
    reply.header("x-trace-id", traceId);
  });

  // ── 统一错误处理 ──
  app.setErrorHandler((error, request, reply) => {
    const traceId = (request as typeof request & { traceId?: string }).traceId ?? "unknown";

    // Zod 校验错误
    if (error instanceof ZodError) {
      return sendError(reply, 400, "INVALID_REQUEST", "请求参数不正确", error.issues);
    }

    // 业务异常
    if (error instanceof AppError) {
      return sendError(reply, error.statusCode, error.code, error.message);
    }

    // Fastify 自身的 400 系列
    if (error instanceof Error && "statusCode" in error && typeof (error as Record<string, unknown>).statusCode === "number" && ((error as Record<string, unknown>).statusCode as number) < 500) {
      const statusCode = (error as Record<string, unknown>).statusCode as number;
      const code = "code" in error ? String((error as Record<string, unknown>).code) : "BAD_REQUEST";
      return sendError(reply, statusCode, code, error.message);
    }

    // 未知异常
    app.log.error({ error: error instanceof Error ? error.message : String(error), traceId });
    return sendError(reply, 500, "INTERNAL_SERVER_ERROR", "服务暂时不可用");
  });

  // ── 健康检查（不需要认证） ──
  app.get("/api/health", async () => ({ status: "ok", timestamp: new Date().toISOString() }));
  app.get("/api/ready", async (request, reply) => {
    try {
      if (app.db) await app.db.$queryRaw`SELECT 1`;
      return { status: "ready", db: app.db ? "ok" : "memory", redis: app.redis?.status ?? "memory" };
    } catch {
      return reply.status(503).send({ status: "not_ready", db: "error" });
    }
  });

  // ── 业务路由 ──
  await registerRoutes(app);

  return app;
}
