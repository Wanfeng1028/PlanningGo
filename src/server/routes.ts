import type { FastifyInstance } from "fastify";
import { env } from "./config/env";

export async function registerRoutes(app: FastifyInstance) {
  // ── 根路由：API 信息 ──
  app.get("/", async () => ({
    name: "PlanningGo API",
    version: "0.1.0",
    description: "「周末去哪儿」智能出行规划 API",
    docs: "/api/docs",
    health: "/api/health",
    environment: env.NODE_ENV,
  }));

  // ── 注册模块化路由 ──
  await import("./routes/auth.js").then((m) => m.registerAuthRoutes(app));
  await import("./routes/profile.js").then((m) => m.registerProfileRoutes(app));
  await import("./routes/plans.js").then((m) => m.registerPlanRoutes(app));
  await import("./routes/reservations.js").then((m) => m.registerReservationRoutes(app));
  await import("./routes/execution.js").then((m) => m.registerExecutionRoutes(app));
  await import("./routes/actions.js").then((m) => m.registerActionRoutes(app));
  await import("./routes/share.js").then((m) => m.registerShareRoutes(app));
  await import("./routes/memory.js").then((m) => m.registerMemoryRoutes(app));
  await import("./routes/developer.js").then((m) => m.registerDeveloperRoutes(app));
  await import("./routes/privacy.js").then((m) => m.registerPrivacyRoutes(app));
  await import("./routes/calendar.js").then((m) => m.registerCalendarRoutes(app));
  await import("./routes/agent.js").then((m) => m.registerAgentRoutes(app));
  await import("./routes/agentChat.js").then((m) => m.registerAgentChatRoutes(app));
  await import("./routes/mock.js").then((m) => m.registerMockRoutes(app));
  await import("./routes/location.js").then((m) => m.registerLocationRoutes(app));
  await import("./routes/maps.js").then((m) => m.registerMapRoutes(app));
  await import("./routes/meituan.js").then((m) => m.registerMeituanRoutes(app));
  await import("./routes/conversations.js").then((m) => m.registerConversationRoutes(app));
  await import("./routes/events.js").then((m) => m.registerEventRoutes(app));
  await import("./routes/handoff.js").then((m) => m.registerHandoffRoutes(app));
  await import("./routes/serviceActions.js").then((m) => m.registerServiceActionRoutes(app));

  app.get("/api/docs", async () => ({
    name: "PlanningGo API",
    version: "0.1.0",
    groups: [
      { group: "Auth", endpoints: ["POST /api/auth/login", "POST /api/auth/register", "POST /api/auth/guest"] },
      { group: "Profile", endpoints: ["GET /api/profile/demo", "PATCH /api/profile/demo", "GET /api/profile/demo/permissions", "PATCH /api/profile/demo/permissions"] },
      { group: "Planning Agent", endpoints: ["POST /api/agent/parse", "POST /api/agent/plan", "POST /api/agent/plan/legacy", "POST /api/agent/what-if", "POST /api/agent/chat", "POST /api/agent/chat/stream", "POST /api/agent/plans/select"] },
      { group: "Mock Data", endpoints: ["GET /api/mock/pois", "GET /api/mock/weather", "GET /api/mock/routes"] },
      { group: "Plans", endpoints: ["GET /api/plans/demo", "POST /api/plans/select"] },
      { group: "Reservations", endpoints: ["GET /api/reservations", "POST /api/reservations", "PATCH /api/reservations/:id/status"] },
      { group: "Execution", endpoints: ["GET /api/execution/demo", "POST /api/execution/advance", "PATCH /api/execution/:key", "GET /api/tools/logs"] },
      { group: "Actions", endpoints: ["GET /api/actions", "POST /api/actions/:id/quote", "POST /api/actions/:id/confirm", "POST /api/actions/:id/cancel"] },
      { group: "Share", endpoints: ["GET /api/share/rooms", "POST /api/share/rooms", "POST /api/share/rooms/:id/vote"] },
      { group: "Memory", endpoints: ["GET /api/memories", "POST /api/memories", "DELETE /api/memories/:id"] },
      { group: "Developer", endpoints: ["GET /api/developer/dashboard", "GET /api/developer/api-keys", "POST /api/developer/api-keys", "POST /api/developer/api-keys/:id/revoke", "GET /api/developer/webhooks", "POST /api/developer/webhooks", "POST /api/developer/webhooks/:id/replay"] },
      { group: "Privacy", endpoints: ["GET /api/privacy/export", "DELETE /api/privacy/memories"] },
      { group: "Calendar", endpoints: ["POST /api/ics"] },
      { group: "Handoff", endpoints: ["POST /api/handoff/mobile", "GET /api/handoff/mobile/:token", "POST /api/handoff/mobile/:token/claim"] },
    ],
  }));









}
