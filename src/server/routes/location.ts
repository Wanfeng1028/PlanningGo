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
}
