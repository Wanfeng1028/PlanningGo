/**
 * POI 详情补全：为方案中的 POI 补充 address、rating、avgPrice 等信息。
 * 在方案生成后调用，通过 amap 搜索周边服务丰富数据。
 */
import type { ActivityPlan, CandidatePoi } from "./schemas";
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
    ...(candidates.cafes ?? []),
    ...(candidates.cinemas ?? []),
  ];
  for (const poi of allPois) {
    poiMap.set(poi.id, poi);
    if (poi.name) poiMap.set(poi.name, poi);
  }

  return plans.map((plan) => ({
    ...plan,
    timeline: plan.timeline.map((step) => {
      const poi = step.poiId ? poiMap.get(step.poiId) : step.poiName ? poiMap.get(step.poiName) : undefined;
      if (!poi) return step;
      return {
        ...step,
        // Enrich with candidate data if not already present
        description: step.description ?? buildStepDescription(step, poi),
        estimatedCost: step.estimatedCost ?? (poi.avgPrice ? `人均${poi.avgPrice}元` : undefined),
      };
    }),
  }));
}

function buildStepDescription(step: { type: string; title: string }, poi: CandidatePoi): string | undefined {
  const parts: string[] = [];
  if (poi.address) parts.push(poi.address);
  if (poi.rating) parts.push(`评分 ${poi.rating}`);
  if (poi.tags.length > 0) parts.push(poi.tags.join("、"));
  return parts.length > 0 ? parts.join(" | ") : undefined;
}
