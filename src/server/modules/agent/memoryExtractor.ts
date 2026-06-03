/**
 * Memory Extractor — 从规划 Slots 中提取用户偏好画像
 *
 * 在方案生成成功后，从 PlanningSlots 提取结构化用户记忆，
 * 并与已有画像合并，持久化到 Memory 表。
 */

import type { PlanningSlots, UserMemoryProfile } from "../../../shared/agentResponse.js";

// ─── Food keywords for preference classification ────────────

const FOOD_KEYWORDS = new Set([
  "火锅", "烧烤", "咖啡", "午饭", "晚饭", "晚餐", "午餐", "吃饭",
]);

// ─── Risk-related preference keywords ───────────────────────

const RISK_KEYWORDS = ["少排队", "交通方便", "室内优先", "低负担"];

// ─── Extract Memory Profile from Planning Slots ─────────────

/**
 * Extract a partial UserMemoryProfile from PlanningSlots after successful plan generation.
 * Only fields that can be inferred from the slots are populated.
 */
export function extractMemoryFromSlots(slots: PlanningSlots): Partial<UserMemoryProfile> {
  const profile: Partial<UserMemoryProfile> = {};

  // homeOrigin
  if (slots.origin && typeof slots.origin === "string") {
    profile.homeOrigin = slots.origin;
  }

  // commonCity — prefer destinationCity, fall back to destination
  const city = slots.destinationCity ?? slots.destination;
  if (city && typeof city === "string") {
    profile.commonCity = city;
  }

  // budgetRange — rough range: [budget * 0.5, budget]
  if (typeof slots.budget === "number" && slots.budget > 0) {
    profile.budgetRange = [Math.round(slots.budget * 0.5), slots.budget];
  }

  // companionsPreference
  if (slots.companions && typeof slots.companions === "string") {
    profile.companionsPreference = slots.companions;
  }

  // Split preferences into food / activity / risk
  const prefs = slots.preferences ?? slots.preference;
  const prefArray: string[] = Array.isArray(prefs) ? prefs : [];

  if (prefArray.length > 0) {
    const foodPrefs: string[] = [];
    const activityPrefs: string[] = [];

    for (const p of prefArray) {
      if (FOOD_KEYWORDS.has(p)) {
        foodPrefs.push(p);
      } else {
        activityPrefs.push(p);
      }
    }

    if (foodPrefs.length > 0) {
      profile.foodPreferences = foodPrefs;
    }
    if (activityPrefs.length > 0) {
      profile.activityPreferences = activityPrefs;
    }

    // Risk preferences — check if any risk-related keywords appear
    const riskPrefs = prefArray.filter((p) => RISK_KEYWORDS.includes(p));
    if (riskPrefs.length > 0) {
      profile.riskPreferences = riskPrefs;
    }
  }

  // timePreferences — from time or timeWindow
  const timePref: string[] = [];
  if (slots.time && typeof slots.time === "string") {
    timePref.push(slots.time);
  }
  if (slots.timeWindow && typeof slots.timeWindow === "string") {
    timePref.push(slots.timeWindow);
  }
  if (timePref.length > 0) {
    profile.timePreferences = timePref;
  }

  return profile;
}

// ─── Merge Memory Profiles ──────────────────────────────────

/**
 * Merge an incoming partial profile into the existing profile.
 * - Scalar fields (homeOrigin, commonCity, companionsPreference) are overwritten by new values.
 * - Array fields (foodPreferences, activityPreferences, timePreferences, riskPreferences) are merged with dedup.
 * - budgetRange always comes from the latest explicit input.
 */
export function mergeMemoryProfile(
  existing: UserMemoryProfile,
  incoming: Partial<UserMemoryProfile>,
): UserMemoryProfile {
  const merged: UserMemoryProfile = { ...existing };

  // Scalar fields — overwrite if incoming has a value
  if (incoming.homeOrigin !== undefined) {
    merged.homeOrigin = incoming.homeOrigin;
  }
  if (incoming.commonCity !== undefined) {
    merged.commonCity = incoming.commonCity;
  }
  if (incoming.companionsPreference !== undefined) {
    merged.companionsPreference = incoming.companionsPreference;
  }

  // budgetRange — always take from latest explicit input
  if (incoming.budgetRange !== undefined) {
    merged.budgetRange = incoming.budgetRange;
  }

  // Array fields — merge with dedup
  merged.foodPreferences = mergeArrays(existing.foodPreferences, incoming.foodPreferences);
  merged.activityPreferences = mergeArrays(existing.activityPreferences, incoming.activityPreferences);
  merged.timePreferences = mergeArrays(existing.timePreferences, incoming.timePreferences);
  merged.riskPreferences = mergeArrays(existing.riskPreferences, incoming.riskPreferences);

  return merged;
}

// ─── Helpers ────────────────────────────────────────────────

function mergeArrays(existing?: string[], incoming?: string[]): string[] | undefined {
  if (!incoming || incoming.length === 0) return existing;
  if (!existing || existing.length === 0) return incoming;
  return [...new Set([...existing, ...incoming])];
}

// ─── Plan Selection Memory Extraction ──────────────────────

/**
 * 从用户选择/拒绝方案中提取记忆。
 * 记录选中的方案特征：活动类型、餐厅偏好、预算实际值、出行模式。
 */
export function extractMemoryFromPlanSelection(input: {
  selectedPlan: {
    title: string;
    targetGroup: string;
    totalCostMin: number;
    totalCostMax: number;
    timeline: Array<{ type: string; title: string; poiName: string | null; estimatedCost?: string }>;
  };
  rejectedPlans?: Array<{ title: string; targetGroup: string }>;
}): Partial<UserMemoryProfile> {
  const memory: Partial<UserMemoryProfile> = {};

  // Extract activity preferences from selected plan
  const activityTypes = input.selectedPlan.timeline
    .filter((s) => s.type === "activity")
    .map((s) => s.title);
  if (activityTypes.length > 0) {
    memory.activityPreferences = [...new Set(activityTypes)];
  }

  // Extract food preferences from meal steps
  const mealNames = input.selectedPlan.timeline
    .filter((s) => s.type === "meal")
    .map((s) => s.poiName || s.title)
    .filter(Boolean);
  if (mealNames.length > 0) {
    memory.foodPreferences = [...new Set(mealNames as string[])];
  }

  // Record actual budget from selected plan
  memory.budgetRange = [input.selectedPlan.totalCostMin, input.selectedPlan.totalCostMax];

  // Record companion mode
  memory.companionsPreference = input.selectedPlan.targetGroup;

  return memory;
}

// ─── Profile Sync from Plan Selection ───────────────────────

/**
 * 从方案选择中更新用户画像。
 * 更新 planCount、activityTags、dietPreference、budgetMin/Max。
 */
export function syncProfileFromPlan(input: {
  existingProfile: Partial<UserMemoryProfile>;
  selectedPlan: {
    totalCostMin: number;
    totalCostMax: number;
    targetGroup: string;
    timeline: Array<{ type: string; poiName: string | null; title: string }>;
  };
}): Partial<UserMemoryProfile> {
  const existing = { ...input.existingProfile };

  // Update plan count
  existing.planCount = (existing.planCount ?? 0) + 1;

  // Merge activity tags (accumulate, don't overwrite)
  const newActivities = input.selectedPlan.timeline
    .filter((s) => s.type === "activity")
    .map((s) => s.title)
    .filter(Boolean);
  const existingActivities = existing.activityPreferences ?? [];
  existing.activityPreferences = mergeWithDedup(existingActivities, newActivities);

  // Merge food preferences
  const newFoods = input.selectedPlan.timeline
    .filter((s) => s.type === "meal")
    .map((s) => s.poiName || s.title)
    .filter(Boolean);
  const existingFoods = existing.foodPreferences ?? [];
  existing.foodPreferences = mergeWithDedup(existingFoods, newFoods as string[]);

  // Update budget range (expand, not shrink)
  if (input.selectedPlan.totalCostMin < (existing.budgetRange?.[0] ?? Infinity)) {
    existing.budgetRange = [input.selectedPlan.totalCostMin, existing.budgetRange?.[1] ?? input.selectedPlan.totalCostMax];
  }
  if (input.selectedPlan.totalCostMax > (existing.budgetRange?.[1] ?? 0)) {
    existing.budgetRange = [existing.budgetRange?.[0] ?? input.selectedPlan.totalCostMin, input.selectedPlan.totalCostMax];
  }

  return existing;
}

function mergeWithDedup(existing: string[], incoming: string[]): string[] {
  const set = new Set([...existing, ...incoming]);
  return [...set].slice(0, 20); // Cap at 20 items
}
