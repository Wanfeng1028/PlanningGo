import { pois } from "../../data/mockData";
import type { CandidatePoi } from "./schemas";
import type { PlanningContext } from "./contextBuilder";

export interface CandidatePool {
  activities: CandidatePoi[];
  restaurants: CandidatePoi[];
  movies: CandidatePoi[];
  events: CandidatePoi[];
}

/**
 * 从 mock 数据源生成候选 POI 池。
 */
export async function generateCandidates(context: PlanningContext): Promise<CandidatePool> {
  const base = pois.map<CandidatePoi>((poi) => {
    const category = mapCategory(poi.type);
    const distanceMinutes = Number.parseInt(poi.distance.replace(/\D/g, ""), 10) || 40;

    return {
      id: poi.id,
      source: "mock",
      name: poi.name,
      category,
      address: `杭州市 ${poi.name}`,
      rating: 4.4,
      avgPrice: category === "restaurant" ? 120 : category === "activity" ? 80 : 0,
      tags: buildTags(poi),
      indoor: poi.type === "餐厅" || poi.type === "休息点" || poi.type === "雨天兜底",
      kidFriendly: Boolean(poi.kidFriendly),
      dietFriendly: poi.name.includes("轻食") || poi.type === "餐厅",
      openingHours: poi.type === "餐厅" ? "10:00-22:00" : "08:00-18:00",
      todayOpenStatus: "open",
      distanceMinutes,
      bookingRequired: poi.type === "餐厅" || poi.type === "雨天兜底",
      bookingAvailable: true,
      queueRisk: poi.name.includes("海底捞") ? "medium" : "low",
      riskFlags: poi.name.includes("海底捞") ? ["晚餐高峰可能等位"] : [],
    };
  });

  return {
    activities: base.filter((item) => ["activity", "scenic", "shopping"].includes(item.category)),
    restaurants: base.filter((item) => item.category === "restaurant"),
    movies: buildMockMovies(context),
    events: base.filter((item) => item.name.includes("展")),
  };
}

function mapCategory(type: string): CandidatePoi["category"] {
  if (type === "餐厅") return "restaurant";
  if (type === "景点" || type === "路线") return "scenic";
  if (type === "雨天兜底") return "activity";
  if (type === "休息点") return "shopping";
  return "other";
}

function buildTags(poi: { name: string; type: string; kidFriendly?: boolean }): string[] {
  const tags: string[] = [];
  if (poi.kidFriendly) tags.push("亲子友好");
  if (poi.type === "餐厅") tags.push("餐饮", "可预约");
  if (poi.type === "雨天兜底") tags.push("室内", "雨天兜底");
  return tags;
}

function buildMockMovies(context: PlanningContext): CandidatePoi[] {
  if (context.intent.participantMode !== "friends" && context.intent.participantMode !== "family") return [];

  return [
    {
      id: "movie_001",
      source: "mock",
      name: "湖滨影院 16:20 家庭场",
      category: "movie",
      address: "湖滨银泰影院",
      rating: 4.6,
      avgPrice: 49,
      tags: ["可锁座", "室内", "雨天友好"],
      indoor: true,
      kidFriendly: context.intent.participantMode === "family",
      dietFriendly: false,
      todayOpenStatus: "open",
      distanceMinutes: 42,
      bookingRequired: true,
      bookingAvailable: true,
      queueRisk: "low",
      riskFlags: ["锁座有效期 15 分钟", "支付前需用户确认"],
    },
  ];
}
