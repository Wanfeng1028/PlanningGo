/**
 * 路线计算模块：计算连续 POI 之间的交通时间。
 * 更新步骤的 transport 和 durationMinutes，重算后续步骤时间。
 */
import type { ActivityPlan, TimelineStep } from "./schemas";
import type { CandidatePoi } from "./schemas";
import type { CandidatePool } from "./candidateGenerator";
import type { AmapClient } from "../tools/amap/client";

/** 将 "HH:MM" 格式的时间转换为分钟数 */
export function timeToMinutes(time: string): number {
  const m = time.match(/(\d{1,2})[：:](\d{2})/);
  if (!m) return 14 * 60;
  return parseInt(m[1]!, 10) * 60 + parseInt(m[2]!, 10);
}

/** 将分钟数转换为 "HH:MM" 格式 */
export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * 估算两点之间的交通时间（分钟）
 * 使用简化模型：直线距离 × 模式系数
 */
function estimateTransportTime(
  from: CandidatePoi | undefined,
  to: CandidatePoi | undefined,
  mode: string,
): number {
  if (!from || !to) return 15; // Default 15 min when no data

  // If both have coordinates, estimate distance
  if (from.lat && from.lng && to.lat && to.lng) {
    const R = 6371; // Earth radius in km
    const dLat = ((to.lat - from.lat) * Math.PI) / 180;
    const dLng = ((to.lng - from.lng) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((from.lat * Math.PI) / 180) * Math.cos((to.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
    const distKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    // Mode-specific speed estimates (km/h)
    const speeds: Record<string, number> = {
      walking: 4,
      subway: 30,
      driving: 25,
      taxi: 25,
      mixed: 15,
    };
    const speed = speeds[mode] ?? 15;
    const timeMinutes = Math.round((distKm / speed) * 60);
    return Math.max(5, Math.min(timeMinutes, 120)); // Clamp between 5-120 min
  }

  // No coordinates: use distanceMinutes from candidate if available
  if (to.distanceMinutes) return to.distanceMinutes;

  // Final fallback
  return 20;
}

/**
 * 计算方案中连续步骤间的交通时间。
 * 优先使用高德路线 API 获取真实交通时间，失败时回退到估算模型。
 */
export async function calculateRouteTimes(
  plans: ActivityPlan[],
  candidates: CandidatePool,
  amapClient?: AmapClient,
): Promise<ActivityPlan[]> {
  const poiMap = buildPoiMap(candidates);

  return Promise.all(plans.map(async (plan) => {
    const updatedTimeline = [...plan.timeline];

    for (let i = 0; i < updatedTimeline.length - 1; i++) {
      const current = updatedTimeline[i]!;
      const next = updatedTimeline[i + 1]!;

      if (next.type === "buffer" || next.type === "travel") continue;

      const fromPoi = current.poiId ? poiMap.get(current.poiId) : current.poiName ? poiMap.get(current.poiName) : undefined;
      const toPoi = next.poiId ? poiMap.get(next.poiId) : next.poiName ? poiMap.get(next.poiName) : undefined;

      let transportTime = 0;
      let usedRealApi = false;

      // Try real Amap route API first
      if (amapClient && amapClient.isConfigured() && fromPoi?.lat && fromPoi?.lng && toPoi?.lat && toPoi?.lng) {
        transportTime = await fetchRealRouteTime(amapClient, fromPoi, toPoi, next.transport);
        if (transportTime > 0) usedRealApi = true;
      }

      // Fallback to estimation
      if (!usedRealApi) {
        transportTime = estimateTransportTime(fromPoi, toPoi, next.transport);
      }

      const transportMode = next.transport !== "none" ? next.transport : inferTransportMode(transportTime);

      updatedTimeline[i + 1] = {
        ...next,
        transport: transportMode,
        durationMinutes: next.durationMinutes,
      };

      const currentEndMin = timeToMinutes(current.endTime);
      const neededStartMin = currentEndMin + transportTime;
      const nextStartMin = timeToMinutes(next.startTime);

      if (neededStartMin > nextStartMin) {
        updatedTimeline[i + 1] = {
          ...updatedTimeline[i + 1]!,
          startTime: minutesToTime(neededStartMin),
        };
        cascadeTimeAdjust(updatedTimeline, i + 1);
      }
    }

    const firstStart = timeToMinutes(updatedTimeline[0]?.startTime ?? "09:00");
    const lastEnd = timeToMinutes(updatedTimeline[updatedTimeline.length - 1]?.endTime ?? "18:00");
    const totalDuration = lastEnd - firstStart;

    return {
      ...plan,
      timeline: updatedTimeline,
      totalDurationMinutes: totalDuration > 0 ? totalDuration : plan.totalDurationMinutes,
    };
  }));
}

/**
 * 调用高德真实路线 API 获取交通时间（分钟）。
 * 失败返回 -1 表示应使用 fallback。
 */
async function fetchRealRouteTime(
  client: AmapClient,
  from: CandidatePoi,
  to: CandidatePoi,
  mode: string,
): Promise<number> {
  const origin = `${from.lng},${from.lat}`;
  const destination = `${to.lng},${to.lat}`;

  try {
    let response: { route?: { paths?: Array<{ duration?: string }> } } | undefined;

    if (mode === "walk" || mode === "walking") {
      response = await client.routeWalking({ origin, destination });
    } else if (mode === "driving" || mode === "taxi") {
      response = await client.routeDriving({ origin, destination });
    } else {
      // Default to transit for subway/mixed
      response = await client.routeTransit({ origin, destination });
    }

    const duration = response?.route?.paths?.[0]?.duration;
    if (duration) {
      const seconds = parseInt(duration, 10);
      if (!isNaN(seconds) && seconds > 0) {
        return Math.max(1, Math.round(seconds / 60));
      }
    }
  } catch (err) {
    // Non-fatal: fall back to estimation
    console.warn("[routeCalculator] Amap route API failed, using estimation:", err instanceof Error ? err.message : err);
  }

  return -1; // Signal fallback
}

function buildPoiMap(candidates: CandidatePool): Map<string, CandidatePoi> {
  const map = new Map<string, CandidatePoi>();
  const allPois = [
    ...candidates.activities,
    ...candidates.restaurants,
    ...candidates.movies,
    ...candidates.events,
    ...(candidates.cafes ?? []),
    ...(candidates.cinemas ?? []),
  ];
  for (const poi of allPois) {
    map.set(poi.id, poi);
    if (poi.name) map.set(poi.name, poi);
  }
  return map;
}

function inferTransportMode(timeMinutes: number): TimelineStep["transport"] {
  if (timeMinutes <= 15) return "walk";
  if (timeMinutes <= 30) return "subway";
  return "taxi";
}

function cascadeTimeAdjust(timeline: TimelineStep[], startIndex: number): void {
  for (let i = startIndex; i < timeline.length - 1; i++) {
    const current = timeline[i]!;
    const next = timeline[i + 1]!;
    const currentEnd = timeToMinutes(current.endTime);
    const nextStart = timeToMinutes(next.startTime);

    if (nextStart < currentEnd) {
      // Push next step forward
      const _shift = currentEnd - nextStart;
      const durationMin = next.durationMinutes || (timeToMinutes(next.endTime) - timeToMinutes(next.startTime));
      timeline[i + 1] = {
        ...next,
        startTime: minutesToTime(currentEnd),
        endTime: minutesToTime(currentEnd + durationMin),
      };
    } else {
      break; // No more cascading needed
    }
  }
}
