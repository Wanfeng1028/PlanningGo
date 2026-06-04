import type { CandidatePoi } from "./schemas";
import type { PlanningProviders } from "./schemas";
import type { PlanningContext } from "./contextBuilder";
import type { PoiResult } from "../../providers/types";
import { env } from "../../config/env";

export interface CandidatePool {
  activities: CandidatePoi[];
  restaurants: CandidatePoi[];
  movies: CandidatePoi[];
  events: CandidatePoi[];
  cafes: CandidatePoi[];
  cinemas: CandidatePoi[];
}

const POI_CATEGORIES = {
  activities: { keywords: "景点 博物馆 展览 公园", types: "风景名胜;科教文化服务" },
  restaurants: { keywords: "餐厅 美食", types: "餐饮服务" },
  events: { keywords: "展览 演出 活动", types: "体育休闲服务;科教文化服务" },
  cafes: { keywords: "咖啡 咖啡馆 咖啡厅", types: "餐饮服务" },
  cinemas: { keywords: "电影院 影院", types: "科教文化服务" },
} as const;

/**
 * 生成候选 POI 池。
 * 优先通过 providers.map.searchPois 获取真实高德数据；
 * 生产环境无 provider 则抛错；开发环境 fallback 到 mock。
 */
export async function generateCandidates(context: PlanningContext): Promise<CandidatePool> {
  const isProd = env.NODE_ENV === "production";
  const mapProvider = context.providers?.map;

  if (mapProvider) {
    return generateFromProvider(context, mapProvider);
  }

  if (isProd) {
    throw new Error("[candidateGenerator] 生产环境必须提供 map provider 以获取 POI 数据");
  }

  return generateMockFallback(context);
}

async function generateFromProvider(
  context: PlanningContext,
  mapProvider: NonNullable<PlanningProviders["map"]>,
): Promise<CandidatePool> {
  const city = context.intent.city || "杭州";

  const [activityPois, restaurantPois, eventPois, cafePois, cinemaPois] = await Promise.all([
    searchPoisSafe(mapProvider, city, POI_CATEGORIES.activities.keywords, POI_CATEGORIES.activities.types),
    searchPoisSafe(mapProvider, city, POI_CATEGORIES.restaurants.keywords, POI_CATEGORIES.restaurants.types),
    searchPoisSafe(mapProvider, city, POI_CATEGORIES.events.keywords, POI_CATEGORIES.events.types),
    searchPoisSafe(mapProvider, city, POI_CATEGORIES.cafes.keywords, POI_CATEGORIES.cafes.types),
    searchPoisSafe(mapProvider, city, POI_CATEGORIES.cinemas.keywords, POI_CATEGORIES.cinemas.types),
  ]);

  const filterByCity = (pois: PoiResult[]) => pois.filter((poi) => isSameCity(poi, city));

  return {
    activities: filterByCity(activityPois).map((poi) => mapAmapPoiToCandidate(poi, "activity")),
    restaurants: filterByCity(restaurantPois).map((poi) => mapAmapPoiToCandidate(poi, "restaurant")),
    movies: filterByCity(cinemaPois).map((poi) => mapAmapPoiToCandidate(poi, "movie")),
    events: filterByCity(eventPois).map((poi) => mapAmapPoiToCandidate(poi, "event")),
    cafes: filterByCity(cafePois).map((poi) => mapAmapPoiToCandidate(poi, "activity")),
    cinemas: filterByCity(cinemaPois).map((poi) => mapAmapPoiToCandidate(poi, "movie")),
  };
}

/** 判断 POI 是否属于目标城市：优先 adcode 前缀匹配，其次 cityname 包含匹配 */
function isSameCity(poi: PoiResult, targetCity: string): boolean {
  if (!poi.city && !poi.adcode) return true; // 无城市信息时不丢弃，交由下游处理
  if (poi.city && (poi.city === targetCity || poi.city.includes(targetCity) || targetCity.includes(poi.city))) return true;
  return false;
}

async function searchPoisSafe(
  mapProvider: NonNullable<PlanningProviders["map"]>,
  city: string,
  keywords: string,
  types: string,
): Promise<PoiResult[]> {
  try {
    return await mapProvider.searchPois({ city, keywords, types, pageSize: 10 });
  } catch (error) {
    if (env.NODE_ENV === "production") {
      throw new Error(`[candidateGenerator] 高德 POI 搜索失败: ${error instanceof Error ? error.message : String(error)}`);
    }
    console.warn(`[candidateGenerator] POI 搜索失败: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

function mapAmapPoiToCandidate(poi: PoiResult, defaultCategory: CandidatePoi["category"]): CandidatePoi {
  const category = inferCategory(poi.type, defaultCategory);

  return {
    id: poi.id,
    source: "amap",
    name: poi.name,
    category,
    address: poi.address || "",
    lat: poi.location?.lat,
    lng: poi.location?.lng,
    rating: poi.rating,
    avgPrice: poi.cost,
    tags: buildTagsFromPoi(poi, category),
    indoor: isIndoor(category, poi.type),
    kidFriendly: category === "activity" || category === "scenic",
    dietFriendly: category === "restaurant",
    openingHours: undefined,
    todayOpenStatus: "unknown",
    distanceMinutes: poi.distance ? Math.round(poi.distance / 800) : undefined,
    bookingRequired: category === "restaurant",
    bookingAvailable: true,
    queueRisk: "unknown",
    riskFlags: [],
    city: poi.city,
    adcode: poi.adcode,
    /* V4: deep POI fields */
    tel: poi.tel,
    distanceMeters: poi.distance,
    deepLink: undefined,
    recommendedItems: undefined,
    reservationHints: undefined,
  };
}

function inferCategory(poiType: string, fallback: CandidatePoi["category"]): CandidatePoi["category"] {
  if (!poiType) return fallback;
  if (poiType.includes("餐饮") || poiType.includes("餐厅") || poiType.includes("美食")) return "restaurant";
  if (poiType.includes("风景") || poiType.includes("景点") || poiType.includes("公园")) return "scenic";
  if (poiType.includes("科教") || poiType.includes("博物馆") || poiType.includes("展览")) return "activity";
  if (poiType.includes("电影") || poiType.includes("影院")) return "movie";
  if (poiType.includes("购物") || poiType.includes("商场")) return "shopping";
  return fallback;
}

function buildTagsFromPoi(poi: PoiResult, category: CandidatePoi["category"]): string[] {
  const tags: string[] = [];
  if (poi.rating && poi.rating >= 4.5) tags.push("高评分");
  if (category === "restaurant") tags.push("餐饮");
  if (category === "scenic") tags.push("景点");
  return tags;
}

function isIndoor(category: CandidatePoi["category"], poiType: string): boolean {
  if (category === "restaurant" || category === "movie") return true;
  if (poiType.includes("博物馆") || poiType.includes("展览") || poiType.includes("商场")) return true;
  return false;
}

// ── Mock Fallback（仅开发环境） ──

/** V4: 开发环境 mock 咖啡店数据 — 确保 cafes 池不为空 */
const MOCK_CAFES: CandidatePoi[] = [
  {
    id: "mock_cafe_manner",
    source: "mock",
    name: "Manner 咖啡 浙大紫金港店",
    category: "other",
    address: "杭州市余杭区浙大紫金港校区附近",
    rating: 4.5,
    avgPrice: 18,
    tags: ["咖啡", "外带", "性价比"],
    indoor: true,
    kidFriendly: false,
    dietFriendly: false,
    openingHours: "07:30–20:00",
    todayOpenStatus: "open",
    distanceMinutes: 6,
    bookingRequired: false,
    bookingAvailable: false,
    queueRisk: "low",
    riskFlags: [],
    tel: "0571-8888-0001",
    distanceMeters: 480,
    deepLink: "https://waimai.meituan.com/shop/manner-zju",
    recommendedItems: ["冰拿铁", "澳白", "美式"],
    reservationHints: "无需预约，可外带或堂食",
  },
  {
    id: "mock_cafe Luckin",
    source: "mock",
    name: "瑞幸咖啡 紫金港店",
    category: "other",
    address: "杭州市余杭区西溪银泰城附近",
    rating: 4.3,
    avgPrice: 15,
    tags: ["咖啡", "小程序自提", "性价比"],
    indoor: true,
    kidFriendly: false,
    dietFriendly: false,
    openingHours: "07:00–21:00",
    todayOpenStatus: "open",
    distanceMinutes: 8,
    bookingRequired: false,
    bookingAvailable: false,
    queueRisk: "low",
    riskFlags: [],
    tel: "0571-8888-0002",
    distanceMeters: 650,
    deepLink: "https://www.luckincoffee.com/store/zijingang",
    recommendedItems: ["生椰拿铁", "丝绒拿铁", "橙C美式"],
    reservationHints: "小程序下单自提，无需排队",
  },
  {
    id: "mock_cafe_starbucks",
    source: "mock",
    name: "星巴克 西溪银泰店",
    category: "other",
    address: "杭州市余杭区西溪银泰城 1 楼",
    rating: 4.4,
    avgPrice: 35,
    tags: ["咖啡", "堂食", "氛围"],
    indoor: true,
    kidFriendly: true,
    dietFriendly: false,
    openingHours: "08:00–22:00",
    todayOpenStatus: "open",
    distanceMinutes: 10,
    bookingRequired: false,
    bookingAvailable: false,
    queueRisk: "medium",
    riskFlags: ["周末下午可能排队"],
    tel: "0571-8888-0003",
    distanceMeters: 800,
    deepLink: "https://www.starbucks.com.cn/store/xixi",
    recommendedItems: ["馥芮白", "拿铁", "星冰乐"],
    reservationHints: "可通过星巴克 APP 提前点单",
  },
];

async function generateMockFallback(context: PlanningContext): Promise<CandidatePool> {
  const { pois } = await import("../../data/mockData");

  const base = pois.map<CandidatePoi>((poi) => {
    const category = mapCategory(poi.type);
    const distanceMinutes = Number.parseInt(poi.distance.replace(/\D/g, ""), 10) || 40;

    return {
      id: poi.id,
      source: "mock" as const,
      name: poi.name,
      category,
      address: `${context.intent.city || "杭州"} ${poi.name}`,
      rating: 4.4,
      avgPrice: category === "restaurant" ? 120 : category === "activity" ? 80 : 0,
      tags: buildMockTags(poi),
      indoor: poi.type === "餐厅" || poi.type === "休息点" || poi.type === "雨天兜底",
      kidFriendly: Boolean(poi.kidFriendly),
      dietFriendly: poi.name.includes("轻食") || poi.type === "餐厅",
      openingHours: poi.type === "餐厅" ? "10:00-22:00" : "08:00-18:00",
      todayOpenStatus: "open" as const,
      distanceMinutes,
      bookingRequired: poi.type === "餐厅" || poi.type === "雨天兜底",
      bookingAvailable: true,
      queueRisk: poi.name.includes("海底捞") ? "medium" as const : "low" as const,
      riskFlags: poi.name.includes("海底捞") ? ["晚餐高峰可能等位"] : [],
    };
  });

  return {
    activities: base.filter((item) => ["activity", "scenic", "shopping"].includes(item.category)),
    restaurants: base.filter((item) => item.category === "restaurant"),
    movies: [],
    events: base.filter((item) => item.name.includes("展")),
    /* V4: mock fallback 不再返回空 cafes */
    cafes: MOCK_CAFES,
    cinemas: [],
  };
}

function mapCategory(type: string): CandidatePoi["category"] {
  if (type === "餐厅") return "restaurant";
  if (type === "景点" || type === "路线") return "scenic";
  if (type === "雨天兜底") return "activity";
  if (type === "休息点") return "shopping";
  return "other";
}

function buildMockTags(poi: { name: string; type: string; kidFriendly?: boolean }): string[] {
  const tags: string[] = [];
  if (poi.kidFriendly) tags.push("亲子友好");
  if (poi.type === "餐厅") tags.push("餐饮", "可预约");
  if (poi.type === "雨天兜底") tags.push("室内", "雨天兜底");
  return tags;
}
