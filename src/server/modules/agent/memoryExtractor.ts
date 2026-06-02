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
