import cors from "@fastify/cors";
import Fastify from "fastify";
import { ZodError } from "zod";
import { corsOrigins, env } from "./config/env";
import { createTraceId } from "./common/id";
import { AppError } from "./common/errors";
import { sendError } from "./common/response";
import { registerRoutes } from "./routes";
import { getChatModel, hasAnyLlmKey } from "./modules/agent/modelClient";
import { initConnectors } from "./modules/connectors/index.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

export async function buildApp() {
  const app = Fastify({
    logger: env.NODE_ENV === "production"
      ? { level: "info" }
      : { level: "debug", transport: { target: "pino-pretty", options: { colorize: true, translateTime: "SYS:HH:MM:ss", ignore: "pid,hostname" } } },
    bodyLimit: 1024 * 1024,
    trustProxy: true,
  });

  // ── 初始化 Connectors（V3） ──
  initConnectors();

  // ── 安全 + Cookie ──
  await app.register(import("./plugins/security.js"));

  // ── CORS（credentials 支持跨域 Cookie） ──
  await app.register(cors, {
    origin: corsOrigins,
    credentials: true,
  });

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

    if (error && typeof error === "object" && "statusCode" in error && "error" in error) {
      const raw = error as { statusCode?: number; error?: { code?: string; message?: string } };
      if (raw.statusCode && raw.error?.code && raw.error?.message) {
        return sendError(reply, raw.statusCode, raw.error.code, raw.error.message);
      }
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
  app.get("/api/health", async (_request, reply) => {
    reply.header("Cache-Control", "public, max-age=5");
    return { ok: true, status: "ok", timestamp: new Date().toISOString() };
  });
  // 启动时间，用于计算 uptime
  const startedAt = Date.now();

  app.get("/api/ready", async (request, reply) => {
    // ── DB 检查 ──
    let dbStatus: string = app.db ? "ok" : "memory";
    try {
      if (app.db) await app.db.$queryRaw`SELECT 1`;
    } catch {
      dbStatus = "error";
    }

    // ── Redis 检查 ──
    let redisStatus: string = "memory";
    if (app.redis) {
      try {
        const pong = await app.redis.ping();
        redisStatus = pong === "PONG" ? "ok" : "error";
      } catch {
        redisStatus = "error";
      }
    }

    // ── LLM 状态（不泄露 key）──
    const llmConfigured = hasAnyLlmKey();
    const llmInfo: Record<string, unknown> = {
      configured: llmConfigured,
      mode: env.AGENT_CHAT_MODE,
    };
    if (llmConfigured) {
      const chatModel = getChatModel("flash");
      llmInfo.provider = chatModel.provider;
      llmInfo.model = chatModel.model;
    }
    if (env.LLM_EXPOSE_DIAGNOSTICS) {
      llmInfo.priority = env.LLM_PROVIDER_PRIORITY;
      llmInfo.fallback = env.LLM_PROVIDER_FALLBACK;
    }

    // ── AMap 状态 ──
    const amapConfigured = Boolean(env.AMAP_WEB_SERVICE_KEY);

    // ── mock 是否允许 ──
    const mockAllowed = env.NODE_ENV === "production"
      ? env.ALLOW_MOCK_PROVIDER_IN_PRODUCTION
      : true;

    // ── 整体就绪判断 ──
    const isReady = dbStatus !== "error" && redisStatus !== "error";

    const body = {
      ok: isReady,
      db: dbStatus,
      redis: redisStatus,
      llm: llmInfo,
      amap: { configured: amapConfigured },
      mockAllowed,
      uptime: Math.floor((Date.now() - startedAt) / 1000),
      timestamp: new Date().toISOString(),
    };

    if (!isReady) {
      return reply.status(503).send(body);
    }
    return body;
  });

  // ── 业务路由 ──
  await registerRoutes(app);

  // ── 前端静态文件服务（仅生产环境） ──
  if (env.NODE_ENV === "production") {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const distDir = path.resolve(currentDir, "..");

    if (fs.existsSync(path.join(distDir, "index.html"))) {
      const { default: staticPlugin } = await import("@fastify/static");

      // 仅服务 assets 目录（带 hash 的静态资源）
      await app.register(staticPlugin, {
        root: path.join(distDir, "assets"),
        prefix: "/assets/",
        decorateReply: false,
        setHeaders(res, filePath) {
          // 带 hash 的静态资源设置长期缓存
          if (/\.[a-f0-9]{8,}\.\w+$/.test(filePath)) {
            res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
          }
        },
      });

      // 服务 design 目录（图片资源）
      await app.register(staticPlugin, {
        root: path.join(distDir, "design"),
        prefix: "/design/",
        decorateReply: false,
      });

      // SPA fallback：非 /api 请求且文件不存在时返回 index.html
      app.setNotFoundHandler((request, reply) => {
        if (request.url.startsWith("/api/")) {
          return sendError(reply, 404, "NOT_FOUND", "接口不存在");
        }
        // 只返回 index.html，不暴露 server/generated 目录
        return reply.type("text/html").sendFile("index.html", distDir);
      });

      app.log.info(`? 前端静态文件已挂载: ${distDir}`);
    } else {
      app.log.warn("? 未找到 index.html，跳过静态文件服务（请先运行 npm run build:client）");
    }
  }

  return app;
}
