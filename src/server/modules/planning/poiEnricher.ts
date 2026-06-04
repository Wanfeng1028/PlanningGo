/**
 * POI 详情补全：为方案中的 POI 补充 address、rating、avgPrice 等信息。
 * 在方案生成后调用，通过 amap 搜索周边服务丰富数据。
 * V4: 增强版 — 补推荐饮品/菜品/排队风险/营业时间，generic step 替换为具体咖啡店。
 */
import type { ActivityPlan, CandidatePoi, TimelineStep } from "./schemas";
import type { CandidatePool } from "./candidateGenerator";

export interface EnrichedPoi extends CandidatePoi {
  enrichedAddress?: string;
  enrichedRating?: number;
  enrichedAvgPrice?: number;
  nearbyServices?: NearbyService[];
}

export interface NearbyService {
  name: string;
  category: string;
  distance: string;
  address: string;
}

/**
 * 为方案中的 POI 补全详情
 */
export function enrichPlanWithPoiDetails(
  plans: ActivityPlan[],
  candidates: CandidatePool,
): ActivityPlan[] {
  // Build a lookup map from candidates
  const poiMap = new Map<string, CandidatePoi>();
  const allPois = [
    ...candidates.activities,
    ...candidates.restaurants,
    ...candidates.movies,
    ...candidates.events,
    ...candidates.cafes,
    ...candidates.cinemas,
  ];
  for (const poi of allPois) {
    poiMap.set(poi.id, poi);
    if (poi.name) poiMap.set(poi.name, poi);
  }

  return plans.map((plan) => ({
    ...plan,
    timeline: plan.timeline.map((step) => enrichStep(step, poiMap, candidates)),
  }));
}

/**
 * V4 增强：根据 step type 和候选池补全深度字段
 */
function enrichStep(
  step: TimelineStep,
  poiMap: Map<string, CandidatePoi>,
  candidates: CandidatePool,
): TimelineStep {
  const poi = step.poiId ? poiMap.get(step.poiId) : step.poiName ? poiMap.get(step.poiName) : undefined;

  if (!poi) {
    // 没有匹配到候选 POI — 尝试用 step type 从候选池找最佳匹配
    return enrichStepByType(step, candidates);
  }

  return {
    ...step,
    // Enrich with candidate data if not already present
    description: step.description ?? buildStepDescription(step, poi),
    estimatedCost: step.estimatedCost ?? (poi.avgPrice ? `人均${poi.avgPrice}元` : undefined),
    /* V4: deep fields */
    address: step.address ?? (poi.address || undefined),
    lat: step.lat ?? poi.lat,
    lng: step.lng ?? poi.lng,
    whyRecommended: step.whyRecommended ?? buildWhyRecommended(step, poi),
    recommendedItems: step.recommendedItems ?? poi.recommendedItems,
    bookingAdvice: step.bookingAdvice ?? poi.reservationHints ?? buildBookingAdvice(step, poi),
    queueRisk: step.queueRisk ?? poi.queueRisk,
    businessHours: step.businessHours ?? poi.openingHours,
    actionHints: step.actionHints ?? buildActionHints(step, poi),
    fallbackPois: step.fallbackPois ?? getFallbackPois(step, poi, candidates),
  };
}

/**
 * 当 step 没有匹配到具体 POI 时，根据 type 从候选池找最佳匹配
 */
function enrichStepByType(
  step: TimelineStep,
  candidates: CandidatePool,
): TimelineStep {
  // buffer/rest step — 尝试匹配咖啡店
  if ((step.type === "buffer" || step.type === "rest") && step.poiName === null) {
    const cafe = candidates.cafes[0];
    if (cafe) {
      return {
        ...step,
        poiId: cafe.id,
        poiName: cafe.name,
        title: `在 ${cafe.name} 休息`,
        description: `推荐 ${cafe.name}，${buildCafeRecommendation(cafe)}`,
        estimatedCost: cafe.avgPrice ? `人均${cafe.avgPrice}元` : undefined,
        address: cafe.address,
        lat: cafe.lat,
        lng: cafe.lng,
        whyRecommended: "附近步行可达，适合短暂休息",
        recommendedItems: cafe.recommendedItems,
        bookingAdvice: cafe.reservationHints || "无需预约，直接到店即可",
        queueRisk: cafe.queueRisk,
        businessHours: cafe.openingHours,
        actionHints: buildCafeActionHints(cafe),
        fallbackPois: candidates.cafes.slice(1, 4).map((c) => c.name),
      };
    }
  }

  // meal step — 尝试匹配餐厅
  if (step.type === "meal" && step.poiName === null) {
    const restaurant = candidates.restaurants[0];
    if (restaurant) {
      return {
        ...step,
        poiId: restaurant.id,
        poiName: restaurant.name,
        title: restaurant.name,
        description: restaurant.name ? `${restaurant.name}用餐，推荐招牌菜` : "在目的地附近用餐",
        estimatedCost: restaurant.avgPrice ? `人均${restaurant.avgPrice}元` : "人均80-120元",
        address: restaurant.address,
        lat: restaurant.lat,
        lng: restaurant.lng,
        whyRecommended: "目的地附近评分较高的餐厅",
        recommendedItems: restaurant.recommendedItems,
        bookingAdvice: restaurant.bookingRequired ? "建议提前1天预约餐位" : "无需预约，现场排队",
        queueRisk: restaurant.queueRisk,
        businessHours: restaurant.openingHours,
        actionHints: buildRestaurantActionHints(restaurant),
        fallbackPois: candidates.restaurants.slice(1, 4).map((r) => r.name),
      };
    }
  }

  // activity step — 尝试匹配景点
  if (step.type === "activity" && step.poiName === null) {
    const activity = candidates.activities[0] ?? candidates.events[0];
    if (activity) {
      return {
        ...step,
        poiId: activity.id,
        poiName: activity.name,
        title: activity.name,
        description: activity.name ? `游览${activity.name}，建议按推荐路线参观` : "参观景点",
        estimatedCost: activity.avgPrice ? `人均${activity.avgPrice}元` : "免费",
        address: activity.address,
        lat: activity.lat,
        lng: activity.lng,
        whyRecommended: "目的地附近热门景点",
        bookingAdvice: activity.bookingRequired ? "建议提前1天在线预约" : "无需预约",
        queueRisk: activity.queueRisk,
        businessHours: activity.openingHours,
        actionHints: ["穿舒适运动鞋", "带相机拍照"],
        fallbackPois: [...candidates.activities, ...candidates.events].slice(1, 4).map((a) => a.name),
      };
    }
  }

  // 无法匹配 — 标记为"需地图确认"
  return {
    ...step,
    whyRecommended: "需地图确认具体地点",
    fallbackPois: [],
  };
}

/**
 * 构建咖啡店推荐文案
 */
function buildCafeRecommendation(cafe: CandidatePoi): string {
  const parts: string[] = [];
  if (cafe.distanceMinutes) parts.push(`步行${cafe.distanceMinutes}分钟`);
  if (cafe.avgPrice) parts.push(`人均${cafe.avgPrice}元`);
  if (cafe.rating) parts.push(`评分${cafe.rating}`);
  if (cafe.queueRisk === "medium") parts.push("可能排队");
  return parts.join("，") || "附近可选";
}

/**
 * 构建咖啡店 action hints
 */
function buildCafeActionHints(cafe: CandidatePoi): string[] {
  const hints: string[] = [];
  if (cafe.deepLink) hints.push("打开小程序/美团下单");
  if (cafe.tel) hints.push(`电话${cafe.tel}`);
  hints.push("导航到店");
  return hints;
}

/**
 * 构建餐厅 action hints
 */
function buildRestaurantActionHints(restaurant: CandidatePoi): string[] {
  const hints: string[] = [];
  if (restaurant.bookingRequired) hints.push("建议提前预约");
  if (restaurant.deepLink) hints.push("打开大众点评/美团查看");
  if (restaurant.tel) hints.push(`电话${restaurant.tel}预约`);
  hints.push("导航到店");
  return hints;
}

/**
 * 构建步骤描述
 */
function buildStepDescription(step: { type: string; title: string }, poi: CandidatePoi): string | undefined {
  const parts: string[] = [];
  if (poi.address) parts.push(poi.address);
  if (poi.rating) parts.push(`评分 ${poi.rating}`);
  if (poi.tags.length > 0) parts.push(poi.tags.join("、"));
  return parts.length > 0 ? parts.join(" | ") : undefined;
}

/**
 * 构建"为什么推荐"
 */
function buildWhyRecommended(step: TimelineStep, poi: CandidatePoi): string {
  if (step.type === "meal") {
    return `目的地附近${poi.rating ? `评分${poi.rating}` : ""}的${poi.category === "restaurant" ? "餐厅" : "餐饮"}，${poi.distanceMinutes ? `步行${poi.distanceMinutes}分钟可达` : "交通便利"}`;
  }
  if (step.type === "buffer" || step.type === "rest") {
    return `附近${poi.distanceMinutes ? `步行${poi.distanceMinutes}分钟` : ""}的${poi.name}，适合短暂休息`;
  }
  if (step.type === "activity") {
    return `热门景点，${poi.rating ? `评分${poi.rating}` : ""}，${poi.distanceMinutes ? `步行${poi.distanceMinutes}分钟` : ""}可达`;
  }
  return poi.address || poi.name || "";
}

/**
 * 构建预约建议
 */
function buildBookingAdvice(step: TimelineStep, poi: CandidatePoi): string {
  if (step.type === "meal" && poi.bookingRequired) {
    return "建议提前1天在线预约，高峰期可能需要等位";
  }
  if (step.type === "activity" && poi.bookingRequired) {
    return "建议提前1天在线预约门票";
  }
  if (step.type === "buffer" || step.type === "rest") {
    return "无需预约，直接到店即可";
  }
  return poi.reservationHints || "无需特别预约";
}

/**
 * 构建 action hints
 */
function buildActionHints(step: TimelineStep, poi: CandidatePoi): string[] {
  const hints: string[] = [];
  if (poi.deepLink) hints.push("打开地图/小程序");
  if (poi.tel) hints.push(`电话${poi.tel}`);
  hints.push("导航到店");
  return hints;
}

/**
 * 获取 fallback POIs（同类型其他候选）
 */
function getFallbackPois(step: TimelineStep, poi: CandidatePoi, candidates: CandidatePool): string[] {
  if (step.type === "meal") {
    return candidates.restaurants.filter((r) => r.id !== poi.id).slice(0, 3).map((r) => r.name);
  }
  if (step.type === "buffer" || step.type === "rest") {
    return candidates.cafes.filter((c) => c.id !== poi.id).slice(0, 3).map((c) => c.name);
  }
  if (step.type === "activity") {
    return [...candidates.activities, ...candidates.events]
      .filter((a) => a.id !== poi.id)
      .slice(0, 3)
      .map((a) => a.name);
  }
  return [];
}
