import cors from "@fastify/cors";
import Fastify from "fastify";
import { ZodError } from "zod";
import { corsOrigins } from "./config/env";
import { createTraceId } from "./common/id";
import { registerRoutes } from "./routes";

export async function buildApp() {
  const app = Fastify({
    logger: true,
    bodyLimit: 1024 * 1024,
  });

  await app.register(cors, {
    origin: corsOrigins,
  });

  // 为每个请求生成或透传 traceId
  app.addHook("onRequest", async (request, reply) => {
    const incomingTraceId = request.headers["x-trace-id"];
    const traceId = typeof incomingTraceId === "string" ? incomingTraceId : createTraceId();
    (request as typeof request & { traceId: string }).traceId = traceId;
    reply.header("x-trace-id", traceId);
  });

  // 统一错误处理
  app.setErrorHandler((error, request, reply) => {
    const traceId = (request as typeof request & { traceId?: string }).traceId ?? "unknown";

    if (error instanceof ZodError) {
      return reply.status(400).send({
        ok: false,
        error: {
          code: "INVALID_REQUEST",
          message: "请求参数不正确",
          issues: error.issues,
        },
        traceId,
      });
    }

    app.log.error({ error, traceId });
    return reply.status(500).send({
      ok: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "服务暂时不可用",
      },
      traceId,
    });
  });

  await registerRoutes(app);
  return app;
}
