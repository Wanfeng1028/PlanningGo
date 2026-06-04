import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";

describe("location nearby route", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("network unavailable");
    }));
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await app.close();
  });

  it("falls back to mock POIs when AMap is unavailable", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/location/nearby?lat=31.2304&lng=121.4737&city=上海&radius=3000",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.ok).toBe(true);
    expect(body.data.fallbackUsed).toBe(true);
    expect(body.data.source).toBe("mock");
    expect(body.data.count).toBeGreaterThan(0);
    expect(body.data.pois[0].location.lng).toBeGreaterThan(121);
  });
});
