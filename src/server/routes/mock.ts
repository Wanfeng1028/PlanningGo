/**
 * Mock Data 路由 — /api/mock/*
 * 生产环境禁用：仅在 development/test 环境注册
 */

import type { FastifyInstance } from "fastify";
import { demoProfile, pois, trafficRoutes, weather } from "../data/mockData.js";
import { env } from "../config/env.js";

export async function registerMockRoutes(app: FastifyInstance) {
  if (env.NODE_ENV === "production") {
    app.log.info("[mock] 生产环境跳过 mock 数据路由注册");
    return;
  }

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
}
