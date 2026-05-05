import cors from "@fastify/cors";
import Fastify from "fastify";
import { ZodError } from "zod";
import { registerRoutes } from "./routes";

const app = Fastify({
  logger: true,
});

await app.register(cors, {
  origin: true,
});

app.setErrorHandler((error, _request, reply) => {
  if (error instanceof ZodError) {
    return reply.status(400).send({
      error: "INVALID_REQUEST",
      issues: error.issues,
    });
  }

  app.log.error(error);
  return reply.status(500).send({
    error: "INTERNAL_SERVER_ERROR",
    message: "服务暂时不可用",
  });
});

await registerRoutes(app);

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? "0.0.0.0";

try {
  await app.listen({ port, host });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
