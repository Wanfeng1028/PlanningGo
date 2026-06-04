import type { CandidatePoi } from "./schemas";
import type { PlanningProviders } from "./schemas";
import type { PlanningContext } from "./contextBuilder";
import type { PoiResult } from "../../providers/types";
import { env } from "../../config/env";

// ── Mock booking failure helpers ──

/** Check if a specific booking failure type is enabled */
function isMockBookingFailure(type: string): boolean {
  return env.MOCK_BOOKING_FAILURES.includes(type);
}

/** Determine if a POI should have bookingAvailable=false based on MOCK_BOOKING_FAILURES */
function resolveBookingAvailable(category: CandidatePoi["category"], poiName?: string): {
  bookingAvailable: boolean;
  queueRisk: CandidatePoi["queueRisk"];
  riskFlags: string[];
} {
  if (!isMockBookingFailure("no_seat") && !isMockBookingFailure("no_ticket")) {
    return { bookingAvailable: true, queueRisk: "unknown", riskFlags: [] };
  }

  const isRestaurant = category === "restaurant";
  const isActivity = category === "activity";

  // no_seat: restaurants and activities have no seats
  if (isMockBookingFailure("no_seat") && (isRestaurant || isActivity)) {
    return {
      bookingAvailable: false,
      queueRisk: "high",
      riskFlags: [`${poiName || "该场所"}当前时段已无可用座位`, "建议调整时间或选择其他门店"],
    };
  }

  // no_ticket: scenic spots and activities have no tickets
  if (isMockBookingFailure("no_ticket") && (category === "scenic" || isActivity)) {
    return {
      bookingAvailable: false,
      queueRisk: "high",
      riskFlags: [`${poiName || "该场所"}当日门票已售罄`, "建议改期或选择其他日期"],
    };
  }

  return { bookingAvailable: true, queueRisk: "unknown", riskFlags: [] };
}

// V4: 简单内存缓存 — 同一 session 内避免重复高德调用
const _poiCache = new Map<string, { data: PoiResult[]; expiresAt: number }>();
const POI_CACHE_TTL_MS = 5 * 60 * 1000; // 5 分钟

function getCachedPois(key: string): PoiResult[] | null {
  const entry = _poiCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    _poiCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCachedPois(key: string, data: PoiResult[]): void {
  // 限制缓存条目数，防止内存泄漏
  if (_poiCache.size > 200) {
    const oldestKey = _poiCache.keys().next().value;
    if (oldestKey) _poiCache.delete(oldestKey);
  }
  _poiCache.set(key, { data, expiresAt: Date.now() + POI_CACHE_TTL_MS });
}

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

/** V4: 根据用户偏好动态扩展搜索关键词 */
function buildDynamicKeywords(intent: { raw: string; preferences: string[] }): {
  restaurantKeywords: string[];
  cafeKeywords: string[];
  activityKeywords: string[];
} {
  const raw = intent.raw + " " + intent.preferences.join(" ");
  const restaurantKeywords: string[] = [];
  const cafeKeywords: string[] = [];
  const activityKeywords: string[] = [];

  // 火锅相关
  if (/火锅|涮|海底捞|湊湊|巴奴/.test(raw)) {
    restaurantKeywords.push("火锅 海底捞 湊湊 巴奴");
  }
  // 烧烤相关
  if (/烧烤|烤肉|烤串/.test(raw)) {
    restaurantKeywords.push("烧烤 烤肉 烤串");
  }
  // 咖啡相关
  if (/咖啡|拿铁|美式|星巴克|瑞幸|Manner/.test(raw)) {
    cafeKeywords.push("咖啡 星巴克 瑞幸 Manner");
  }
  // 奶茶相关
  if (/奶茶|茶饮|喜茶|奈雪/.test(raw)) {
    cafeKeywords.push("奶茶 茶饮 喜茶 奈雪");
  }
  // 西湖相关
  if (/西湖/.test(raw)) {
    activityKeywords.push("西湖 断桥 白堤 孤山 湖滨");
  }
  // 景区通用
  if (/爬山|登山|徒步/.test(raw)) {
    activityKeywords.push("登山 步道 徒步");
  }

  return { restaurantKeywords, cafeKeywords, activityKeywords };
}

/**
 * 生成候选 POI 池。
 * 优先通过 providers.map.searchPois 获取真实高德数据；
 * 生产环境无 provider 则抛错；开发环境 fallback 到 mock。
 */
export async function generateCandidates(context: PlanningContext, signal?: AbortSignal): Promise<CandidatePool> {
  const isProd = env.NODE_ENV === "production";
  const mapProvider = context.providers?.map;

  if (mapProvider) {
    return generateFromProvider(context, mapProvider, signal);
  }

  if (isProd) {
    throw new Error("[candidateGenerator] 生产环境必须提供 map provider 以获取 POI 数据");
  }

  return generateMockFallback(context);
}

async function generateFromProvider(
  context: PlanningContext,
  mapProvider: NonNullable<PlanningProviders["map"]>,
  signal?: AbortSignal,
): Promise<CandidatePool> {
  const city = context.intent.city || "杭州";
  const dynamicKw = buildDynamicKeywords(context.intent);

  // V4: 合并基础关键词 + 动态关键词
  const restaurantKw = [POI_CATEGORIES.restaurants.keywords, ...dynamicKw.restaurantKeywords].join(" ");
  const cafeKw = [POI_CATEGORIES.cafes.keywords, ...dynamicKw.cafeKeywords].join(" ");
  const activityKw = [POI_CATEGORIES.activities.keywords, ...dynamicKw.activityKeywords].join(" ");

  const [activityPois, restaurantPois, eventPois, cafePois, cinemaPois] = await Promise.all([
    searchPoisSafe(mapProvider, city, activityKw, POI_CATEGORIES.activities.types, signal),
    searchPoisSafe(mapProvider, city, restaurantKw, POI_CATEGORIES.restaurants.types, signal),
    searchPoisSafe(mapProvider, city, POI_CATEGORIES.events.keywords, POI_CATEGORIES.events.types, signal),
    searchPoisSafe(mapProvider, city, cafeKw, POI_CATEGORIES.cafes.types, signal),
    searchPoisSafe(mapProvider, city, POI_CATEGORIES.cinemas.keywords, POI_CATEGORIES.cinemas.types, signal),
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
  signal?: AbortSignal,
): Promise<PoiResult[]> {
  // V4: 先查缓存
  const cacheKey = `${city}:${keywords}:${types}`;
  const cached = getCachedPois(cacheKey);
  if (cached) return cached;

  try {
    const timeoutSignal = AbortSignal.timeout(3000);
    const combinedSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
    const result = await mapProvider.searchPois({ city, keywords, types, pageSize: 10 }, combinedSignal);
    setCachedPois(cacheKey, result);
    return result;
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
  const booking = resolveBookingAvailable(category, poi.name);

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
    bookingAvailable: booking.bookingAvailable,
    queueRisk: booking.queueRisk,
    riskFlags: booking.riskFlags,
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

/** V4: 开发环境 mock 餐厅数据 — 包含推荐菜品、预约方式、排队风险 */
const MOCK_RESTAURANTS: CandidatePoi[] = [
  {
    id: "mock_rest_haidilao",
    source: "mock",
    name: "海底捞火锅 西湖银泰店",
    category: "restaurant",
    address: "杭州市上城区延安路 98 号银泰百货 5 楼",
    rating: 4.6,
    avgPrice: 128,
    tags: ["火锅", "服务好", "可预约"],
    indoor: true,
    kidFriendly: true,
    dietFriendly: false,
    openingHours: "10:00-02:00",
    todayOpenStatus: "open",
    distanceMinutes: 12,
    bookingRequired: true,
    bookingAvailable: true,
    queueRisk: "high",
    riskFlags: ["晚餐高峰可能等位30-60分钟", "建议提前1天预约"],
    tel: "0571-8765-4321",
    distanceMeters: 960,
    deepLink: "https://www.meituan.com/restaurant/haidilao-xihu",
    recommendedItems: ["毛肚", "鸭血", "肥牛卷", "虾滑", "番茄锅底"],
    reservationHints: "建议通过海底捞APP或美团提前1天预约，高峰期等位约30-60分钟",
  },
  {
    id: "mock_rest_toutou",
    source: "mock",
    name: "湊湊火锅 城西银泰店",
    category: "restaurant",
    address: "杭州市拱墅区丰潭路 380 号城西银泰城 4 楼",
    rating: 4.5,
    avgPrice: 145,
    tags: ["火锅", "台式", "下午茶"],
    indoor: true,
    kidFriendly: false,
    dietFriendly: false,
    openingHours: "11:00-23:00",
    todayOpenStatus: "open",
    distanceMinutes: 15,
    bookingRequired: true,
    bookingAvailable: true,
    queueRisk: "medium",
    riskFlags: ["周末晚餐可能等位"],
    tel: "0571-8765-4322",
    distanceMeters: 1200,
    deepLink: "https://www.meituan.com/restaurant/coucoubi-xihu",
    recommendedItems: ["花胶鸡锅底", "鲜鸭血", "手切鲜牛肉", "无限续甜品"],
    reservationHints: "可通过大众点评或电话预约，高峰期建议提前半天",
  },
  {
    id: "mock_rest_local",
    source: "mock",
    name: "知味观 湖滨总店",
    category: "restaurant",
    address: "杭州市上城区仁和路 83 号",
    rating: 4.3,
    avgPrice: 85,
    tags: ["杭帮菜", "老字号", "西湖边"],
    indoor: true,
    kidFriendly: true,
    dietFriendly: false,
    openingHours: "07:00-21:00",
    todayOpenStatus: "open",
    distanceMinutes: 5,
    bookingRequired: false,
    bookingAvailable: true,
    queueRisk: "medium",
    riskFlags: ["午高峰排队较长"],
    tel: "0571-8706-8626",
    distanceMeters: 400,
    deepLink: "https://www.dianping.com/shop/zhiweiguan-hubin",
    recommendedItems: ["小笼包", "猫耳朵", "龙井虾仁", "东坡肉"],
    reservationHints: "无需预约，到店排队即可，午高峰建议11:00前到",
  },
];

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
    const booking = resolveBookingAvailable(category, poi.name);

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
      bookingAvailable: booking.bookingAvailable,
      queueRisk: booking.queueRisk,
      riskFlags: booking.riskFlags.length > 0 ? booking.riskFlags : poi.name.includes("海底捞") ? ["晚餐高峰可能等位"] : [],
    };
  });

  return {
    activities: base.filter((item) => ["activity", "scenic", "shopping"].includes(item.category)),
    /* V4: mock fallback 合并真实餐厅 + mock 餐厅，确保推荐菜品不为空 */
    restaurants: [
      ...base.filter((item) => item.category === "restaurant"),
      ...MOCK_RESTAURANTS,
    ],
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
