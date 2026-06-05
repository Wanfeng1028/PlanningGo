import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { sendError, sendOk } from "../common/response.js";
import { createMapProviders, selectMapProvider } from "../modules/maps/registry.js";
import type { UnifiedMapProvider } from "../modules/maps/types.js";

const providerSchema = z.enum(["open", "amap"]).optional();

const pointSchema = z.object({
  lng: z.coerce.number().min(-180).max(180),
  lat: z.coerce.number().min(-90).max(90),
});

function parseProvider(value: unknown): UnifiedMapProvider | undefined {
  return providerSchema.parse(value);
}

function mapError(reply: Parameters<typeof sendError>[0], error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("NOT_CONFIGURED")) {
    return sendError(reply, 503, "MAP_PROVIDER_NOT_CONFIGURED", "地图服务未配置");
  }
  if (message.includes("NO_RESULT")) {
    return sendError(reply, 404, "MAP_NO_RESULT", "没有找到地图结果");
  }
  return sendError(reply, 502, "MAP_PROVIDER_ERROR", "地图服务暂时不可用");
}

export async function registerMapRoutes(app: FastifyInstance) {
  app.get("/api/maps/status", async (_request, reply) => {
    const providers = createMapProviders();
    const statuses = {
      open: providers.open.status(),
      amap: providers.amap.status(),
    };
    return sendOk(reply, {
      providers: statuses,
      defaultProvider: statuses.amap.configured ? "amap" : "open",
    });
  });

  app.get("/api/maps/geocode", async (request, reply) => {
    const query = z.object({
      provider: providerSchema,
      address: z.string().min(1),
      city: z.string().optional(),
      pageSize: z.coerce.number().int().min(1).max(20).default(10),
    }).parse(request.query);
    try {
      const providers = createMapProviders();
      const provider = selectMapProvider(parseProvider(query.provider), providers);
      const pois = await provider.geocode({ address: query.address, city: query.city });
      return sendOk(reply, {
        provider: provider.status().provider,
        configured: provider.status().configured,
        fallbackUsed: false,
        pois: pois.slice(0, query.pageSize),
        count: pois.length,
        warnings: provider.status().warnings,
      });
    } catch (err) {
      return mapError(reply, err);
    }
  });

  app.get("/api/maps/reverse-geocode", async (request, reply) => {
    const query = z.object({
      provider: providerSchema,
      lat: z.coerce.number().min(-90).max(90),
      lng: z.coerce.number().min(-180).max(180),
    }).parse(request.query);
    try {
      const provider = selectMapProvider(parseProvider(query.provider));
      const result = await provider.reverseGeocode({ lng: query.lng, lat: query.lat });
      return sendOk(reply, result);
    } catch (err) {
      return mapError(reply, err);
    }
  });

  app.get("/api/maps/search", async (request, reply) => {
    const query = z.object({
      provider: providerSchema,
      keywords: z.string().min(1),
      city: z.string().optional(),
      types: z.string().optional(),
      lat: z.coerce.number().min(-90).max(90).optional(),
      lng: z.coerce.number().min(-180).max(180).optional(),
      radius: z.coerce.number().int().min(300).max(10000).optional(),
      pageSize: z.coerce.number().int().min(1).max(20).default(10),
    }).parse(request.query);
    try {
      const provider = selectMapProvider(parseProvider(query.provider));
      const location = query.lng !== undefined && query.lat !== undefined ? { lng: query.lng, lat: query.lat } : undefined;
      const pois = await provider.searchPois({
        keywords: query.keywords,
        city: query.city,
        types: query.types,
        location,
        radius: query.radius,
        pageSize: query.pageSize,
      });
      const status = provider.status();
      return sendOk(reply, {
        provider: status.provider,
        configured: status.configured,
        fallbackUsed: false,
        pois,
        count: pois.length,
        warnings: status.warnings,
      });
    } catch (err) {
      return mapError(reply, err);
    }
  });

  app.get("/api/maps/nearby", async (request, reply) => {
    const query = z.object({
      provider: providerSchema,
      lat: z.coerce.number().min(-90).max(90),
      lng: z.coerce.number().min(-180).max(180),
      city: z.string().optional(),
      types: z.string().optional(),
      radius: z.coerce.number().int().min(300).max(10000).default(3000),
    }).parse(request.query);
    try {
      const provider = selectMapProvider(parseProvider(query.provider));
      const pois = await provider.nearbyPois({
        location: { lng: query.lng, lat: query.lat },
        city: query.city,
        types: query.types,
        radius: query.radius,
      });
      const status = provider.status();
      return sendOk(reply, {
        provider: status.provider,
        configured: status.configured,
        fallbackUsed: false,
        pois,
        count: pois.length,
        warnings: status.warnings,
      });
    } catch (err) {
      return mapError(reply, err);
    }
  });

  app.post("/api/maps/route", async (request, reply) => {
    const body = z.object({
      provider: providerSchema,
      from: z.object({ name: z.string().optional(), location: pointSchema }),
      to: z.object({ name: z.string().optional(), location: pointSchema }),
      waypoints: z.array(z.object({ name: z.string().optional(), location: pointSchema })).optional(),
      mode: z.enum(["driving", "walking", "cycling"]).optional(),
      strategy: z.string().optional(),
    }).parse(request.body);
    try {
      const provider = selectMapProvider(parseProvider(body.provider));
      const route = await provider.route({
        from: body.from,
        to: body.to,
        waypoints: body.waypoints,
        mode: body.mode,
        strategy: body.strategy,
      });
      const status = provider.status();
      return sendOk(reply, {
        provider: status.provider,
        configured: status.configured,
        fallbackUsed: false,
        route,
        warnings: status.warnings,
      });
    } catch (err) {
      return mapError(reply, err);
    }
  });

  app.get("/api/maps/weather", async (request, reply) => {
    const query = z.object({
      provider: providerSchema,
      city: z.string().min(1),
      date: z.string().optional(),
    }).parse(request.query);
    try {
      const provider = selectMapProvider(parseProvider(query.provider));
      const weather = await provider.weather({ city: query.city, date: query.date });
      const status = provider.status();
      return sendOk(reply, {
        provider: status.provider,
        configured: status.configured,
        fallbackUsed: weather.source === "fallback",
        weather,
        warnings: status.warnings,
      });
    } catch (err) {
      return mapError(reply, err);
    }
  });
}
