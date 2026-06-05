import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";

describe("maps routes", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    vi.stubEnv("AMAP_WEB_SERVICE_KEY", "");
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("overpass")) {
        return new Response(JSON.stringify({
          elements: [
            {
              id: 1,
              type: "node",
              lat: 31.232,
              lon: 121.474,
              tags: { name: "人民广场咖啡", amenity: "cafe", phone: "123" },
            },
          ],
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.includes("/route/v1/")) {
        return new Response(JSON.stringify({
          code: "Ok",
          routes: [
            {
              distance: 1200,
              duration: 600,
              geometry: { coordinates: [[121.4737, 31.2304], [121.474, 31.232]] },
              legs: [{ steps: [{ name: "人民大道", distance: 1200, duration: 600, maneuver: { type: "depart" } }] }],
            },
          ],
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.includes("nominatim")) {
        return new Response(JSON.stringify([
          { place_id: 1, display_name: "上海市人民广场", lat: "31.2304", lon: "121.4737", type: "square", class: "place" },
        ]), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response("{}", { status: 404 });
    }));
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    await app.close();
  });

  it("reports open map as default when amap is not configured", async () => {
    const res = await app.inject({ method: "GET", url: "/api/maps/status" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.defaultProvider).toBe("open");
    expect(body.data.providers.open.configured).toBe(true);
    expect(body.data.providers.amap.configured).toBe(false);
  });

  it("returns nearby POIs from open provider", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/maps/nearby?provider=open&lat=31.2304&lng=121.4737&city=上海&radius=3000",
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.provider).toBe("open");
    expect(body.data.pois[0].name).toBe("人民广场咖啡");
    expect(body.data.pois[0].source).toBe("open");
  });

  it("plans a route with open provider", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/maps/route",
      payload: {
        provider: "open",
        from: { location: { lng: 121.4737, lat: 31.2304 } },
        to: { name: "人民广场咖啡", location: { lng: 121.474, lat: 31.232 } },
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.route.distance).toBe(1200);
    expect(body.data.route.coordinates.length).toBe(2);
    expect(body.data.route.navigationUrl).toContain("openstreetmap.org");
  });

  it("rejects amap requests when key is missing", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/maps/search?provider=amap&keywords=咖啡&city=上海",
    });
    expect(res.statusCode).toBe(503);
    const body = JSON.parse(res.payload);
    expect(body.error.code).toBe("MAP_PROVIDER_NOT_CONFIGURED");
  });
});
