import type { FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { demoProfile, pois, baseToolLogs, planOptions } from "./data/mockData";
import { planningRequestSchema, runPlanningAgent } from "./services/agent";

export async function registerRoutes(app: FastifyInstance) {
  app.get("/api/health", async () => ({
    ok: true,
    service: "planning-go-api",
  }));

  app.get("/api/profile/demo", async () => demoProfile);

  app.get("/api/mock/pois", async () => ({
    city: "杭州",
    items: pois,
  }));

  app.get("/api/tools/logs", async () => ({
    traceId: "demo_trace",
    logs: baseToolLogs,
  }));

  app.get("/api/plans/demo", async () => ({
    selectedPlanId: "plan_a",
    options: planOptions,
  }));

  app.post("/api/agent/plan", async (request, reply) => {
    try {
      const input = planningRequestSchema.parse(request.body);
      return runPlanningAgent(input);
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.status(400).send({
          error: "INVALID_REQUEST",
          issues: error.issues,
        });
      }
      throw error;
    }
  });

  app.post("/api/ics", async (request, reply) => {
    const body = request.body as { title?: string; date?: string };
    const title = body.title ?? "周末有谱行程";
    const date = body.date ?? "20260509";
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//PlanningGo//Weekend Agent//CN",
      "BEGIN:VEVENT",
      `UID:${Date.now()}@planninggo.local`,
      `DTSTART:${date}T140000`,
      `DTEND:${date}T183000`,
      `SUMMARY:${title}`,
      "DESCRIPTION:由周末有谱 Agent 生成的本地生活规划。",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\\r\\n");

    return reply.header("content-type", "text/calendar; charset=utf-8").send(ics);
  });
}
