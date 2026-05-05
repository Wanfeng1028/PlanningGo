import type { FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { z } from "zod";
import { demoProfile, pois, baseToolLogs, planOptions, trafficRoutes, weather } from "./data/mockData";
import { parseDemand, planningRequestSchema, runPlanningAgent, simulateWhatIf } from "./services/agent";
import {
  createShareRoom,
  deleteMemory,
  listMemories,
  listReservations,
  listShareRooms,
  updateReservationStatus,
  upsertMemory,
  upsertReservation,
  vote,
} from "./services/store";

const authSchema = z.object({
  phone: z.string().min(3),
  code: z.string().optional(),
  name: z.string().optional(),
});

const permissionSchema = z.object({
  key: z.string(),
  allowed: z.boolean(),
});

export async function registerRoutes(app: FastifyInstance) {
  app.get("/api/health", async () => ({
    ok: true,
    service: "planning-go-api",
  }));

  app.get("/api/docs", async () => ({
    name: "PlanningGo API",
    version: "0.1.0",
    groups: [
      { group: "Auth", endpoints: ["POST /api/auth/login", "POST /api/auth/register"] },
      { group: "Profile", endpoints: ["GET /api/profile/demo", "PATCH /api/profile/demo", "PATCH /api/profile/demo/permissions"] },
      { group: "Planning Agent", endpoints: ["POST /api/agent/parse", "POST /api/agent/plan", "POST /api/agent/what-if"] },
      { group: "Mock Data", endpoints: ["GET /api/mock/pois", "GET /api/mock/weather", "GET /api/mock/routes"] },
      { group: "Plans", endpoints: ["GET /api/plans/demo"] },
      { group: "Reservations", endpoints: ["GET /api/reservations", "POST /api/reservations", "PATCH /api/reservations/:id/status"] },
      { group: "Execution", endpoints: ["GET /api/execution/demo", "GET /api/tools/logs"] },
      { group: "Share", endpoints: ["GET /api/share/rooms", "POST /api/share/rooms", "POST /api/share/rooms/:id/vote"] },
      { group: "Memory", endpoints: ["GET /api/memories", "POST /api/memories", "DELETE /api/memories/:id"] },
      { group: "Developer", endpoints: ["GET /api/developer/dashboard"] },
      { group: "Calendar", endpoints: ["POST /api/ics"] },
    ],
  }));

  app.get("/api/profile/demo", async () => demoProfile);

  app.post("/api/auth/login", async (request) => {
    const input = authSchema.parse(request.body);
    return {
      token: `demo_token_${Date.now()}`,
      user: {
        id: demoProfile.id,
        name: input.name ?? demoProfile.name,
        phone: input.phone,
      },
      profile: demoProfile,
    };
  });

  app.post("/api/auth/register", async (request) => {
    const input = authSchema.parse(request.body);
    return {
      token: `demo_token_${Date.now()}`,
      user: {
        id: `user_${Date.now()}`,
        name: input.name ?? "新用户",
        phone: input.phone,
      },
      onboardingSteps: ["城市", "家庭成员", "预算习惯"],
    };
  });

  app.patch("/api/profile/demo", async (request) => ({
    ...demoProfile,
    ...(request.body as object),
  }));

  app.patch("/api/profile/demo/permissions", async (request) => {
    const input = permissionSchema.parse(request.body);
    return {
      ...demoProfile.permissions,
      [input.key]: input.allowed,
    };
  });

  app.get("/api/mock/pois", async () => ({
    city: "杭州",
    items: pois,
  }));

  app.get("/api/mock/weather", async () => weather);

  app.get("/api/mock/routes", async () => ({
    startPoint: demoProfile.startPoint,
    destination: "西湖 / 湖滨",
    routes: trafficRoutes,
  }));

  app.get("/api/tools/logs", async () => ({
    traceId: "demo_trace",
    logs: baseToolLogs,
  }));

  app.get("/api/plans/demo", async () => ({
    selectedPlanId: "plan_a",
    options: planOptions,
  }));

  app.post("/api/agent/parse", async (request, reply) => {
    try {
      const input = planningRequestSchema.parse(request.body);
      return parseDemand(input);
    } catch (error) {
      if (error instanceof ZodError) return reply.status(400).send({ error: "INVALID_REQUEST", issues: error.issues });
      throw error;
    }
  });

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

  app.post("/api/agent/what-if", async (request) => {
    const input = z
      .object({
        planId: z.string().default("plan_a"),
        scenario: z.enum(["rain", "late", "budget", "traffic"]),
      })
      .parse(request.body);
    return simulateWhatIf(input.planId, input.scenario);
  });

  app.get("/api/reservations", async () => ({ items: listReservations() }));

  app.post("/api/reservations", async (request) => {
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

  app.patch("/api/reservations/:id/status", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({ status: z.enum(["draft", "holding", "confirmed", "failed"]) }).parse(request.body);
    const next = updateReservationStatus(params.id, body.status);
    if (!next) return reply.status(404).send({ error: "RESERVATION_NOT_FOUND" });
    return next;
  });

  app.get("/api/execution/demo", async () => ({
    traceId: "exec_demo",
    steps: [
      { key: "location", title: "定位确认", status: "done" },
      { key: "restaurant", title: "海底捞预约", status: "running" },
      { key: "ticket", title: "电影票锁座", status: "pending" },
      { key: "calendar", title: "日历提醒", status: "pending" },
      { key: "share", title: "分享给家人", status: "pending" },
    ],
  }));

  app.get("/api/share/rooms", async () => ({ items: listShareRooms() }));

  app.post("/api/share/rooms", async (request) => {
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

  app.post("/api/share/rooms/:id/vote", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({ memberName: z.string(), vote: z.enum(["yes", "no"]), comment: z.string().optional() }).parse(request.body);
    const next = vote(params.id, body.memberName, body.vote, body.comment);
    if (!next) return reply.status(404).send({ error: "SHARE_ROOM_NOT_FOUND" });
    return next;
  });

  app.get("/api/memories", async () => ({ items: listMemories() }));

  app.post("/api/memories", async (request) => {
    const input = z
      .object({
        category: z.enum(["family", "food", "route", "collaboration"]),
        title: z.string(),
        detail: z.string(),
        weight: z.number().min(0).max(1),
      })
      .parse(request.body);
    return upsertMemory(input);
  });

  app.delete("/api/memories/:id", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const ok = deleteMemory(params.id);
    return ok ? { ok: true } : reply.status(404).send({ error: "MEMORY_NOT_FOUND" });
  });

  app.get("/api/developer/dashboard", async () => ({
    metrics: [
      { label: "规划成功率", value: "94%" },
      { label: "兜底触发率", value: "18%" },
      { label: "支付交接率", value: "100%" },
      { label: "用户确认率", value: "87%" },
    ],
    logs: baseToolLogs,
  }));

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
