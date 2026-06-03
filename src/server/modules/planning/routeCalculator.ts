/**
 * 路线计算模块：计算连续 POI 之间的交通时间。
 * 更新步骤的 transport 和 durationMinutes，重算后续步骤时间。
 */
import type { ActivityPlan, TimelineStep } from "./schemas";
import type { CandidatePoi } from "./schemas";
import type { CandidatePool } from "./candidateGenerator";

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
 * 计算方案中连续步骤间的交通时间，更新 transport 和时间线
 */
export function calculateRouteTimes(
  plans: ActivityPlan[],
  candidates: CandidatePool,
): ActivityPlan[] {
  const poiMap = buildPoiMap(candidates);

  return plans.map((plan) => {
    const updatedTimeline = [...plan.timeline];

    for (let i = 0; i < updatedTimeline.length - 1; i++) {
      const current = updatedTimeline[i]!;
      const next = updatedTimeline[i + 1]!;

      // Skip buffer/travel steps
      if (next.type === "buffer" || next.type === "travel") continue;

      const fromPoi = current.poiId ? poiMap.get(current.poiId) : current.poiName ? poiMap.get(current.poiName) : undefined;
      const toPoi = next.poiId ? poiMap.get(next.poiId) : next.poiName ? poiMap.get(next.poiName) : undefined;

      const transportTime = estimateTransportTime(fromPoi, toPoi, next.transport);
      const transportMode = next.transport !== "none" ? next.transport : inferTransportMode(transportTime);

      // Update the next step's transport info
      updatedTimeline[i + 1] = {
        ...next,
        transport: transportMode,
        durationMinutes: next.durationMinutes, // Keep activity duration, transport is in the gap
      };

      // Adjust start time if needed to account for transport
      const currentEndMin = timeToMinutes(current.endTime);
      const neededStartMin = currentEndMin + transportTime;
      const nextStartMin = timeToMinutes(next.startTime);

      if (neededStartMin > nextStartMin) {
        // Push next step start time forward
        updatedTimeline[i + 1] = {
          ...updatedTimeline[i + 1]!,
          startTime: minutesToTime(neededStartMin),
        };
        // Cascade: push subsequent steps if they overlap
        cascadeTimeAdjust(updatedTimeline, i + 1);
      }
    }

    // Recalculate total duration
    const firstStart = timeToMinutes(updatedTimeline[0]?.startTime ?? "09:00");
    const lastEnd = timeToMinutes(updatedTimeline[updatedTimeline.length - 1]?.endTime ?? "18:00");
    const totalDuration = lastEnd - firstStart;

    return {
      ...plan,
      timeline: updatedTimeline,
      totalDurationMinutes: totalDuration > 0 ? totalDuration : plan.totalDurationMinutes,
    };
  });
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
      const shift = currentEnd - nextStart;
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
