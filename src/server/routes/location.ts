/**
 * Location 路由 — 逆地理编码
 * 有高德 Key 时调用高德 API，否则返回模拟数据
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { env } from "../config/env.js";
import { sendOk } from "../common/response.js";

const reverseGeocodeQuery = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});

const nearbyQuery = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  city: z.string().min(1).default("上海"),
  radius: z.coerce.number().int().min(300).max(10_000).default(3000),
});

type NearbyPoi = {
  id: string;
  name: string;
  address: string;
  type: string;
  location: { lng: number; lat: number };
  rating?: number;
  cost?: number;
  distance?: number;
  source: "amap" | "mock";
};

// 城市中心坐标 → 城市名映射（模拟 fallback）
const CITY_FALLBACKS: Array<{ lat: number; lng: number; city: string; district: string }> = [
  { lat: 39.9042, lng: 116.4074, city: "北京", district: "东城区" },
  { lat: 31.2304, lng: 121.4737, city: "上海", district: "黄浦区" },
  { lat: 23.1291, lng: 113.2644, city: "广州", district: "天河区" },
  { lat: 22.5431, lng: 114.0579, city: "深圳", district: "南山区" },
  { lat: 30.2741, lng: 120.1551, city: "杭州", district: "西湖区" },
  { lat: 30.5728, lng: 104.0668, city: "成都", district: "武侯区" },
  { lat: 29.563, lng: 106.5516, city: "重庆", district: "渝中区" },
  { lat: 32.0603, lng: 118.7969, city: "南京", district: "玄武区" },
  { lat: 34.2658, lng: 108.9541, city: "西安", district: "雁塔区" },
  { lat: 36.6512, lng: 117.1201, city: "济南", district: "历下区" },
];

function findNearestCity(lat: number, lng: number) {
  let best = CITY_FALLBACKS[0];
  let bestDist = Infinity;
  for (const c of CITY_FALLBACKS) {
    const d = Math.hypot(c.lat - lat, c.lng - lng);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best;
}

const MOCK_NEARBY_TEMPLATES: Array<Omit<NearbyPoi, "location" | "source" | "distance"> & { dx: number; dy: number }> = [
  { id: "mock_nearby_cafe_1", name: "Manner Coffee 附近店", address: "当前区域步行范围内", type: "餐饮服务;咖啡厅", rating: 4.6, cost: 24, dx: 0.004, dy: 0.002 },
  { id: "mock_nearby_food_1", name: "知味小馆 周边店", address: "当前区域商圈内", type: "餐饮服务;中餐厅", rating: 4.4, cost: 86, dx: -0.003, dy: 0.003 },
  { id: "mock_nearby_activity_1", name: "城市漫步打卡点", address: "当前区域公共空间", type: "风景名胜;城市广场", rating: 4.5, cost: 0, dx: 0.002, dy: -0.004 },
  { id: "mock_nearby_mall_1", name: "附近购物中心", address: "当前区域主干道旁", type: "购物服务;购物中心", rating: 4.3, cost: 0, dx: -0.005, dy: -0.001 },
  { id: "mock_nearby_rest_1", name: "海底捞火锅 备选店", address: "当前区域 3 公里内", type: "餐饮服务;火锅店", rating: 4.7, cost: 128, dx: 0.006, dy: -0.003 },
  { id: "mock_nearby_indoor_1", name: "室内展览空间", address: "当前区域文化综合体", type: "科教文化服务;展览馆", rating: 4.4, cost: 60, dx: -0.002, dy: 0.006 },
];

function buildMockNearby(lat: number, lng: number): NearbyPoi[] {
  return MOCK_NEARBY_TEMPLATES.map((item, index) => ({
    id: item.id,
    name: item.name,
    address: item.address,
    type: item.type,
    rating: item.rating,
    cost: item.cost,
    source: "mock",
    distance: 260 + index * 180,
    location: { lng: Number((lng + item.dx).toFixed(6)), lat: Number((lat + item.dy).toFixed(6)) },
  }));
}

async function amapNearbySearch(input: { lat: number; lng: number; city: string; radius: number }): Promise<NearbyPoi[] | null> {
  const key = env.AMAP_WEB_SERVICE_KEY;
  if (!key) return null;

  const categories = ["餐饮服务", "风景名胜", "购物服务", "生活服务", "体育休闲服务", "科教文化服务"];
  const timeout = AbortSignal.timeout(3000);

  try {
    const batches = await Promise.allSettled(
      categories.slice(0, 4).map(async (types) => {
        const url = new URL("https://restapi.amap.com/v5/place/around");
        url.searchParams.set("key", key);
        url.searchParams.set("location", `${input.lng},${input.lat}`);
        url.searchParams.set("radius", String(input.radius));
        url.searchParams.set("types", types);
        url.searchParams.set("city", input.city);
        url.searchParams.set("sortrule", "distance");
        url.searchParams.set("offset", "8");
        url.searchParams.set("page", "1");
        url.searchParams.set("extensions", "all");

        const res = await fetch(url, { signal: timeout });
        if (!res.ok) return [];
        const data = (await res.json()) as {
          status?: string;
          pois?: Array<{
            id?: string;
            name?: string;
            address?: string | string[];
            type?: string;
            location?: string;
            distance?: string;
            biz_ext?: { rating?: string; cost?: string };
          }>;
        };
        if (data.status !== "1") return [];
        return (data.pois ?? []).flatMap((poi): NearbyPoi[] => {
          if (!poi.id || !poi.name || !poi.location) return [];
          const [poiLng, poiLat] = poi.location.split(",").map(Number);
          if (!Number.isFinite(poiLng) || !Number.isFinite(poiLat)) return [];
          return [{
            id: poi.id,
            name: poi.name,
            address: Array.isArray(poi.address) ? poi.address.join("") : poi.address || "",
            type: poi.type || types,
            location: { lng: poiLng, lat: poiLat },
            rating: poi.biz_ext?.rating ? Number.parseFloat(poi.biz_ext.rating) : undefined,
            cost: poi.biz_ext?.cost ? Number.parseFloat(poi.biz_ext.cost) : undefined,
            distance: poi.distance ? Number.parseInt(poi.distance, 10) : undefined,
            source: "amap",
          }];
        });
      }),
    );

    const pois = batches.flatMap((result) => result.status === "fulfilled" ? result.value : []);
    const seen = new Set<string>();
    return pois
      .filter((poi) => {
        if (seen.has(poi.id)) return false;
        seen.add(poi.id);
        return true;
      })
      .sort((a, b) => (a.distance ?? 999999) - (b.distance ?? 999999))
      .slice(0, 12);
  } catch (err) {
    console.warn("高德周边搜索失败:", err);
    return null;
  }
}

async function amapReverseGeocode(lat: number, lng: number) {
  const key = env.AMAP_WEB_SERVICE_KEY;
  if (!key) return null;

  try {
    const url = `https://restapi.amap.com/v3/geocode/regeo?key=${key}&location=${lng},${lat}&extensions=base`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;

    const data = (await res.json()) as {
      status: string;
      regeocode?: {
        addressComponent?: { city?: string | string[]; district?: string; formatted_address?: string };
      };
    };

    if (data.status !== "1" || !data.regeocode?.addressComponent) return null;

    const ac = data.regeocode.addressComponent;
    const city = Array.isArray(ac.city) ? ac.city[0] ?? "" : ac.city ?? "";
    return {
      city,
      district: ac.district ?? "",
      address: data.regeocode.addressComponent?.formatted_address ?? "",
      formattedAddress: data.regeocode.addressComponent?.formatted_address ?? "",
    };
  } catch (err) {
    console.warn("高德逆地理编码失败:", err);
    return null;
  }
}

export async function registerLocationRoutes(app: FastifyInstance) {
  app.get("/api/location/reverse-geocode", async (request, reply) => {
    const { lat, lng } = reverseGeocodeQuery.parse(request.query);

    // 优先高德 API
    const amapResult = await amapReverseGeocode(lat, lng);
    if (amapResult) {
      return sendOk(reply, {
        ...amapResult,
        source: "amap",
        confidence: "high",
        needsConfirmation: false,
      });
    }

    // Fallback: 最近城市匹配（低可信度，需要用户确认）
    const nearest = findNearestCity(lat, lng);
    return sendOk(reply, {
      city: nearest.city,
      district: nearest.district,
      address: `${nearest.city}${nearest.district}`,
      formattedAddress: `${nearest.city}${nearest.district}附近`,
      source: "fallback",
      confidence: "low",
      needsConfirmation: true,
    });
  });

  app.get("/api/location/nearby", async (request, reply) => {
    const query = nearbyQuery.parse(request.query);
    const amapPois = await amapNearbySearch(query);
    const pois = amapPois && amapPois.length > 0 ? amapPois : buildMockNearby(query.lat, query.lng);

    return sendOk(reply, {
      pois,
      count: pois.length,
      source: amapPois && amapPois.length > 0 ? "amap" : "mock",
      fallbackUsed: !(amapPois && amapPois.length > 0),
      hint: amapPois && amapPois.length > 0 ? undefined : "周边服务暂不可用，已切换为演示推荐地点。",
    });
  });
}
