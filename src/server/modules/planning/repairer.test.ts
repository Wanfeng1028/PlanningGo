import { describe, expect, it } from "vitest";
import { repairPlans } from "./repairer.js";
import type { ActivityPlan, CandidatePoi, UserIntent } from "./schemas.js";
import type { CandidatePool } from "./candidateGenerator.js";

const intent: UserIntent = {
  raw: "周末下午上海两个人预算300想喝咖啡看展吃饭",
  city: "上海",
  origin: { label: "人民广场" },
  timeWindow: "afternoon",
  durationHours: [2, 4],
  participantMode: "couple",
  partySize: 2,
  budgetMax: 300,
  distanceLimitMinutes: 40,
  preferences: ["咖啡", "看展"],
  routeStops: [],
  returnPoint: "人民广场",
  foodPreferences: [],
  mustAsk: [],
  isPlanningRequest: true,
};

function poi(input: Partial<CandidatePoi> & Pick<CandidatePoi, "id" | "name" | "category">): CandidatePoi {
  return {
    source: "mock",
    id: input.id,
    name: input.name,
    category: input.category,
    address: "上海",
    tags: input.tags ?? [],
    indoor: input.indoor ?? true,
    kidFriendly: input.kidFriendly ?? false,
    dietFriendly: input.category === "restaurant",
    todayOpenStatus: input.todayOpenStatus ?? "open",
    bookingRequired: input.bookingRequired ?? (input.category === "restaurant" || input.category === "activity"),
    bookingAvailable: input.bookingAvailable ?? true,
    queueRisk: input.queueRisk ?? "low",
    riskFlags: input.riskFlags ?? [],
    avgPrice: input.avgPrice,
    recommendedItems: input.recommendedItems,
  };
}

const candidates: CandidatePool = {
  activities: [
    poi({ id: "act-sold-out", name: "热门展览", category: "activity", bookingAvailable: false, queueRisk: "high" }),
    poi({ id: "act-ok", name: "室内摄影展", category: "activity", bookingAvailable: true }),
  ],
  restaurants: [
    poi({ id: "rest-full", name: "满座餐厅", category: "restaurant", bookingAvailable: false, queueRisk: "high" }),
    poi({ id: "rest-ok", name: "备选餐厅", category: "restaurant", bookingAvailable: true, avgPrice: 120, recommendedItems: ["招牌菜", "甜品"] }),
  ],
  cafes: [
    poi({ id: "cafe-ok", name: "Manner Coffee", category: "other", bookingRequired: false }),
  ],
  movies: [],
  events: [],
  cinemas: [],
};

const brokenPlan: ActivityPlan = {
  id: "option-1",
  planId: "plan-1",
  title: "原始冲突方案",
  targetGroup: "couple",
  score: 80,
  summary: "有冲突和不可预约项目",
  totalDurationMinutes: 420,
  totalCostMin: 200,
  totalCostMax: 500,
  assumptions: [],
  highlights: [],
  risks: [],
  timeline: [
    {
      id: "s1",
      startTime: "14:00",
      endTime: "16:00",
      type: "activity",
      title: "热门展览",
      poiId: "act-sold-out",
      poiName: "热门展览",
      durationMinutes: 120,
      transport: "none",
      reasoning: "用户想看展",
      bookingNeeded: true,
      actionId: null,
    },
    {
      id: "s2",
      startTime: "15:30",
      endTime: "17:00",
      type: "meal",
      title: "满座餐厅",
      poiId: "rest-full",
      poiName: "满座餐厅",
      durationMinutes: 90,
      transport: "walk",
      reasoning: "安排吃饭",
      bookingNeeded: true,
      actionId: null,
    },
  ],
};

describe("repairPlans", () => {
  it("repairs no-ticket, no-seat, time conflict, budget and missing chain", () => {
    const [repaired] = repairPlans({ intent, candidates, options: [brokenPlan] });

    expect(repaired.timeline[0]?.type).toBe("travel");
    expect(repaired.timeline.at(-1)?.type).toBe("return");
    expect(repaired.timeline.some((step) => step.poiId === "act-ok")).toBe(true);
    expect(repaired.timeline.some((step) => step.poiId === "rest-ok")).toBe(true);
    expect(repaired.totalCostMax).toBe(300);
    expect(repaired.totalDurationMinutes).toBeLessThanOrEqual(240);
    expect(repaired.recovery?.applied).toBe(true);
    expect(repaired.recovery?.reasons.join(" ")).toContain("无票");
    expect(repaired.recovery?.reasons.join(" ")).toContain("无座");

    for (let i = 0; i < repaired.timeline.length - 1; i += 1) {
      const current = repaired.timeline[i]!;
      const next = repaired.timeline[i + 1]!;
      expect(next.startTime >= current.endTime).toBe(true);
    }
  });
});
