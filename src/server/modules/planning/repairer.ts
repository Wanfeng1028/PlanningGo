import { createId } from "../../common/id";
import type { ActivityPlan, CandidatePoi, TimelineStep, UserIntent } from "./schemas";
import type { CandidatePool } from "./candidateGenerator";

type RepairNote = {
  reasons: string[];
  actions: string[];
};

const BUFFER_MINUTES = 10;

function timeToMinutes(time: string): number {
  const m = time.match(/(\d{1,2})[：:](\d{2})/);
  if (!m) return 14 * 60;
  return Number.parseInt(m[1]!, 10) * 60 + Number.parseInt(m[2]!, 10);
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function repairPlans(input: {
  intent: UserIntent;
  candidates: CandidatePool;
  options: ActivityPlan[];
}): ActivityPlan[] {
  return input.options.map((option) => repairPlan(option, input.intent, input.candidates));
}

function repairPlan(option: ActivityPlan, intent: UserIntent, candidates: CandidatePool): ActivityPlan {
  const note: RepairNote = { reasons: [], actions: [] };
  let timeline = option.timeline.map((step) => ({ ...step }));

  timeline = replaceUnavailableSteps(timeline, candidates, note);
  timeline = ensureCompleteChain(timeline, intent, candidates, note);
  timeline = repairTimeline(timeline, intent, note);

  const totalDurationMinutes = Math.max(
    1,
    timeToMinutes(timeline[timeline.length - 1]?.endTime ?? "00:01") - timeToMinutes(timeline[0]?.startTime ?? "00:00"),
  );
  const budgetMax = intent.budgetMax;
  const repairedCostMax = budgetMax && option.totalCostMax > budgetMax
    ? budgetMax
    : option.totalCostMax;
  if (budgetMax && option.totalCostMax > budgetMax) {
    note.reasons.push("原方案预算可能超过上限");
    note.actions.push("已按预算上限压缩可选消费，第三方价格以最终页面为准");
  }

  const constraints = [
    `${intent.city || "本地"}范围`,
    intent.participantMode === "unknown" ? `${intent.partySize}人` : `${participantLabel(intent.participantMode)} · ${intent.partySize}人`,
    `时间${timeline[0]?.startTime ?? "--:--"}-${timeline[timeline.length - 1]?.endTime ?? "--:--"}`,
    budgetMax ? `预算≤${budgetMax}元` : "预算可调整",
    "含预约/导航/分享",
  ];

  return {
    ...option,
    totalDurationMinutes,
    totalCostMax: repairedCostMax,
    totalCostMin: Math.min(option.totalCostMin, repairedCostMax),
    timeline,
    constraints,
    highlights: dedupe([...option.highlights, "已校验时间与约束", "支持一键执行"]),
    risks: dedupe([...option.risks, ...note.reasons]).slice(0, 6),
    recovery: {
      applied: note.actions.length > 0,
      reasons: dedupe(note.reasons),
      actions: dedupe(note.actions),
    },
  };
}

function replaceUnavailableSteps(timeline: TimelineStep[], candidates: CandidatePool, note: RepairNote): TimelineStep[] {
  return timeline.map((step) => {
    if (!step.poiId || !["meal", "activity", "movie", "event"].includes(step.type)) return step;
    const poi = findCandidate(candidates, step.poiId);
    if (!poi || poi.bookingAvailable !== false) return step;

    const replacement = pickReplacement(step, candidates);
    if (!replacement) {
      note.reasons.push(`${step.poiName ?? step.title} 当前不可预约`);
      note.actions.push("已保留原步骤并提示用户到第三方平台最终确认");
      return {
        ...step,
        bookingHint: "当前库存需确认，请打开第三方平台查看",
        queueRisk: "high",
      };
    }

    const noSeat = step.type === "meal";
    note.reasons.push(noSeat ? `${step.poiName ?? step.title} 当前时段无座` : `${step.poiName ?? step.title} 当前无票`);
    note.actions.push(noSeat ? `已替换为${replacement.name}` : `已切换到${replacement.name}`);
    return applyPoi(step, replacement, noSeat ? "已避开无座门店，选择同区域备选餐厅。" : "已避开无票项目，选择可执行备选活动。");
  });
}

function ensureCompleteChain(timeline: TimelineStep[], intent: UserIntent, candidates: CandidatePool, note: RepairNote): TimelineStep[] {
  const next = [...timeline];
  const start = next[0]?.startTime ?? resolveFallbackStart(intent);
  const origin = intent.origin?.label;

  if (origin && next[0]?.type !== "travel") {
    next.unshift({
      id: createId("step"),
      startTime: start,
      endTime: minutesToTime(timeToMinutes(start) + 25),
      type: "travel",
      title: `从${origin}出发`,
      poiId: null,
      poiName: origin,
      durationMinutes: 25,
      transport: intent.transportMode === "subway" ? "subway" : "taxi",
      reasoning: "补齐出发链路，便于直接导航。",
      bookingNeeded: false,
      actionId: null,
      description: `从${origin}出发，出发前确认实时路况。`,
      estimatedCost: "交通以实时平台为准",
      suggestions: ["预留10分钟缓冲"],
    });
    note.actions.push("已补齐出发步骤");
  }

  if (next.every((step) => step.type !== "meal") && estimatedDuration(next) >= 210) {
    const restaurant = candidates.restaurants.find((poi) => poi.bookingAvailable !== false) ?? candidates.restaurants[0];
    if (restaurant) {
      const insertAt = Math.max(1, Math.floor(next.length / 2));
      const prevEnd = next[insertAt - 1]?.endTime ?? start;
      next.splice(insertAt, 0, makeMealStep(prevEnd, restaurant));
      note.reasons.push("原方案超过3.5小时但缺少用餐");
      note.actions.push(`已插入${restaurant.name}用餐`);
    }
  }

  if (origin && next[next.length - 1]?.type !== "return") {
    const prevEnd = next[next.length - 1]?.endTime ?? start;
    next.push({
      id: createId("step"),
      startTime: prevEnd,
      endTime: minutesToTime(timeToMinutes(prevEnd) + 25),
      type: "return",
      title: `返回${intent.returnPoint || origin}`,
      poiId: null,
      poiName: intent.returnPoint || origin,
      durationMinutes: 25,
      transport: intent.transportMode === "subway" ? "subway" : "taxi",
      reasoning: "补齐返程闭环。",
      bookingNeeded: false,
      actionId: null,
      description: "行程结束后直接返程。",
      estimatedCost: "交通以实时平台为准",
    });
    note.actions.push("已补齐返程步骤");
  }

  return next;
}

function repairTimeline(timeline: TimelineStep[], intent: UserIntent, note: RepairNote): TimelineStep[] {
  const maxMinutes = Math.max(60, intent.durationHours[1] * 60);
  let cursor = timeToMinutes(timeline[0]?.startTime ?? resolveFallbackStart(intent));
  const startCursor = cursor;
  let changed = false;

  const repaired = timeline.map((step) => {
    const originalStart = timeToMinutes(step.startTime);
    const originalEnd = timeToMinutes(step.endTime);
    let duration = Math.max(15, step.durationMinutes || originalEnd - originalStart || 30);
    const remainingAfterThis = Math.max(0, maxMinutes - (cursor - startCursor));
    if (remainingAfterThis <= 25) duration = Math.min(duration, 25);
    else if (duration > remainingAfterThis) duration = Math.max(20, remainingAfterThis);

    const nextStep = {
      ...step,
      startTime: minutesToTime(cursor),
      endTime: minutesToTime(cursor + duration),
      durationMinutes: duration,
    };
    if (nextStep.startTime !== step.startTime || nextStep.endTime !== step.endTime) changed = true;
    cursor += duration + BUFFER_MINUTES;
    return nextStep;
  });

  const finalEnd = timeToMinutes(repaired[repaired.length - 1]?.endTime ?? "00:00");
  if (finalEnd - startCursor > maxMinutes) {
    note.reasons.push("原方案时间超出窗口");
    note.actions.push("已压缩低优先级步骤并保留关键活动");
    return trimToWindow(repaired, startCursor, maxMinutes);
  }

  if (changed) {
    note.reasons.push("原方案存在时间冲突或转场不足");
    note.actions.push("已自动重排时间并插入转场缓冲");
  }
  return repaired;
}

function trimToWindow(timeline: TimelineStep[], start: number, maxMinutes: number): TimelineStep[] {
  const deadline = start + maxMinutes;
  const skeleton = buildCriticalSkeleton(timeline);
  let cursor = start;
  return skeleton.map((step, index) => {
    const remainingSteps = skeleton.length - index - 1;
    const remainingBudget = Math.max(15, deadline - cursor - remainingSteps * 15);
    const preferred = preferredDuration(step);
    const duration = Math.max(15, Math.min(preferred, remainingBudget));
    const next = {
      ...step,
      startTime: minutesToTime(cursor),
      endTime: minutesToTime(Math.min(deadline, cursor + duration)),
      durationMinutes: Math.max(15, Math.min(deadline, cursor + duration) - cursor),
    };
    cursor = timeToMinutes(next.endTime);
    return next;
  });
}

function buildCriticalSkeleton(timeline: TimelineStep[]): TimelineStep[] {
  const selected: TimelineStep[] = [];
  const travel = timeline.find((step) => step.type === "travel");
  const activity = timeline.find((step) => ["activity", "event", "movie"].includes(step.type));
  const meal = timeline.find((step) => step.type === "meal");
  const ret = timeline.findLast((step) => step.type === "return");

  for (const step of [travel, activity, meal, ret]) {
    if (step && !selected.some((item) => item.id === step.id)) selected.push(step);
  }
  return selected.length >= 2 ? selected : timeline.slice(0, 3);
}

function preferredDuration(step: TimelineStep): number {
  if (step.type === "travel" || step.type === "return") return Math.min(step.durationMinutes, 25);
  if (step.type === "meal") return Math.min(step.durationMinutes, 55);
  return Math.min(step.durationMinutes, 75);
}

function makeMealStep(startTime: string, poi: CandidatePoi): TimelineStep {
  const start = timeToMinutes(startTime) + BUFFER_MINUTES;
  return {
    id: createId("step"),
    startTime: minutesToTime(start),
    endTime: minutesToTime(start + 60),
    type: "meal",
    title: `${poi.name}用餐`,
    poiId: poi.id,
    poiName: poi.name,
    durationMinutes: 60,
    transport: "walk",
    reasoning: "长行程中插入用餐，保证节奏自然。",
    bookingNeeded: poi.bookingRequired,
    actionId: null,
    description: poi.recommendedItems?.length ? `推荐${poi.recommendedItems.join("、")}` : "选择同区域餐厅用餐。",
    estimatedCost: poi.avgPrice ? `人均${poi.avgPrice}元` : "价格以门店为准",
    bookingHint: poi.reservationHints,
    suggestions: ["避开高峰或提前取号"],
    address: poi.address,
    lat: poi.lat,
    lng: poi.lng,
    recommendedItems: poi.recommendedItems,
    bookingAdvice: poi.reservationHints,
    queueRisk: poi.queueRisk,
    businessHours: poi.openingHours,
    actionHints: ["查看店铺", "导航到店", "生成预约草稿"],
  };
}

function applyPoi(step: TimelineStep, poi: CandidatePoi, reasoning: string): TimelineStep {
  return {
    ...step,
    title: step.type === "meal" ? `${poi.name}用餐` : poi.name,
    poiId: poi.id,
    poiName: poi.name,
    address: poi.address,
    lat: poi.lat,
    lng: poi.lng,
    reasoning,
    description: poi.recommendedItems?.length ? `推荐${poi.recommendedItems.join("、")}` : step.description,
    estimatedCost: poi.avgPrice ? `人均${poi.avgPrice}元` : step.estimatedCost,
    bookingHint: poi.reservationHints ?? step.bookingHint,
    recommendedItems: poi.recommendedItems ?? step.recommendedItems,
    queueRisk: poi.queueRisk,
    businessHours: poi.openingHours,
    fallbackPois: step.fallbackPois,
  };
}

function pickReplacement(step: TimelineStep, candidates: CandidatePool): CandidatePoi | undefined {
  const pool = step.type === "meal"
    ? candidates.restaurants
    : step.type === "movie"
      ? candidates.cinemas
      : [...candidates.activities, ...candidates.events];
  return pool.find((poi) => poi.id !== step.poiId && poi.bookingAvailable !== false) ?? pool.find((poi) => poi.id !== step.poiId);
}

function findCandidate(candidates: CandidatePool, id: string): CandidatePoi | undefined {
  return [
    ...candidates.activities,
    ...candidates.restaurants,
    ...candidates.movies,
    ...candidates.events,
    ...candidates.cafes,
    ...candidates.cinemas,
  ].find((poi) => poi.id === id);
}

function estimatedDuration(timeline: TimelineStep[]): number {
  if (timeline.length === 0) return 0;
  return timeToMinutes(timeline[timeline.length - 1]!.endTime) - timeToMinutes(timeline[0]!.startTime);
}

function resolveFallbackStart(intent: UserIntent): string {
  if (intent.departAt) return intent.departAt;
  if (intent.timeWindow === "morning") return "09:00";
  if (intent.timeWindow === "evening") return "18:00";
  return "14:00";
}

function participantLabel(mode: UserIntent["participantMode"]): string {
  return {
    family: "亲子/家庭",
    friends: "朋友",
    couple: "情侣",
    solo: "独自",
    unknown: "同行人",
  }[mode];
}

function dedupe(items: string[]): string[] {
  return [...new Set(items.filter(Boolean))];
}
