import { describe, expect, it } from "vitest";
import { extractMemoryFromSlots, mergeMemoryProfile } from "./memoryExtractor.js";
import type { PlanningSlots, UserMemoryProfile } from "../../../shared/agentResponse.js";

describe("memoryExtractor", () => {
  describe("extractMemoryFromSlots", () => {
    it("extracts homeOrigin from origin slot", () => {
      const slots: PlanningSlots = { origin: "杭师大仓前" };
      const result = extractMemoryFromSlots(slots);
      expect(result.homeOrigin).toBe("杭师大仓前");
    });

    it("extracts commonCity from destinationCity", () => {
      const slots: PlanningSlots = { destinationCity: "杭州" };
      const result = extractMemoryFromSlots(slots);
      expect(result.commonCity).toBe("杭州");
    });

    it("falls back to destination for commonCity", () => {
      const slots: PlanningSlots = { destination: "西湖" };
      const result = extractMemoryFromSlots(slots);
      expect(result.commonCity).toBe("西湖");
    });

    it("extracts budgetRange from budget", () => {
      const slots: PlanningSlots = { budget: 200 };
      const result = extractMemoryFromSlots(slots);
      expect(result.budgetRange).toEqual([100, 200]);
    });

    it("extracts companionsPreference", () => {
      const slots: PlanningSlots = { companions: "solo" };
      const result = extractMemoryFromSlots(slots);
      expect(result.companionsPreference).toBe("solo");
    });

    it("splits preferences into food and activity", () => {
      const slots: PlanningSlots = { preferences: ["咖啡厅", "火锅", "拍照"] };
      const result = extractMemoryFromSlots(slots);
      // "咖啡厅" is not in FOOD_KEYWORDS (only "咖啡" is), so it's classified as activity
      expect(result.foodPreferences).toEqual(["火锅"]);
      expect(result.activityPreferences).toEqual(["咖啡厅", "拍照"]);
    });

    it("extracts risk preferences", () => {
      const slots: PlanningSlots = { preferences: ["少排队", "交通方便", "咖啡厅"] };
      const result = extractMemoryFromSlots(slots);
      expect(result.riskPreferences).toEqual(["少排队", "交通方便"]);
      // Risk keywords are also classified as activity (not food), alongside "咖啡厅"
      expect(result.activityPreferences).toEqual(["少排队", "交通方便", "咖啡厅"]);
    });

    it("extracts timePreferences from time and timeWindow", () => {
      const slots: PlanningSlots = { time: "明天上午9点", timeWindow: "morning" };
      const result = extractMemoryFromSlots(slots);
      expect(result.timePreferences).toContain("明天上午9点");
      expect(result.timePreferences).toContain("morning");
    });

    it("returns empty profile for empty slots", () => {
      const result = extractMemoryFromSlots({});
      expect(Object.keys(result)).toHaveLength(0);
    });

    it("extracts full planning message correctly", () => {
      // Simulates: "一个人，从杭师大仓前出发，明天上午9点，咖啡厅坐坐，中午吃火锅，预算200"
      const slots: PlanningSlots = {
        origin: "杭师大仓前",
        destination: "杭州西湖",
        destinationCity: "杭州",
        budget: 200,
        partySize: 1,
        companions: "solo",
        time: "明天上午9点",
        preferences: ["咖啡厅", "火锅", "午饭"],
      };
      const result = extractMemoryFromSlots(slots);
      expect(result.homeOrigin).toBe("杭师大仓前");
      expect(result.commonCity).toBe("杭州");
      expect(result.budgetRange).toEqual([100, 200]);
      expect(result.companionsPreference).toBe("solo");
      expect(result.foodPreferences).toContain("火锅");
      expect(result.foodPreferences).toContain("午饭");
      // "咖啡厅" is not in FOOD_KEYWORDS (only "咖啡" is), so it is classified as activity
      expect(result.activityPreferences).toContain("咖啡厅");
      expect(result.timePreferences).toContain("明天上午9点");
    });
  });

  describe("mergeMemoryProfile", () => {
    it("overwrites scalar fields", () => {
      const existing: UserMemoryProfile = { homeOrigin: "家", commonCity: "北京" };
      const incoming: Partial<UserMemoryProfile> = { homeOrigin: "杭师大仓前", commonCity: "杭州" };
      const merged = mergeMemoryProfile(existing, incoming);
      expect(merged.homeOrigin).toBe("杭师大仓前");
      expect(merged.commonCity).toBe("杭州");
    });

    it("preserves existing fields when incoming is empty", () => {
      const existing: UserMemoryProfile = {
        homeOrigin: "杭师大仓前",
        foodPreferences: ["火锅"],
        activityPreferences: ["咖啡厅"],
      };
      const merged = mergeMemoryProfile(existing, {});
      expect(merged.homeOrigin).toBe("杭师大仓前");
      expect(merged.foodPreferences).toEqual(["火锅"]);
    });

    it("merges array fields with dedup", () => {
      const existing: UserMemoryProfile = { foodPreferences: ["火锅"] };
      const incoming: Partial<UserMemoryProfile> = { foodPreferences: ["火锅", "烧烤"] };
      const merged = mergeMemoryProfile(existing, incoming);
      expect(merged.foodPreferences).toEqual(["火锅", "烧烤"]);
    });

    it("updates budgetRange from latest input", () => {
      const existing: UserMemoryProfile = { budgetRange: [100, 300] };
      const incoming: Partial<UserMemoryProfile> = { budgetRange: [50, 100] };
      const merged = mergeMemoryProfile(existing, incoming);
      expect(merged.budgetRange).toEqual([50, 100]);
    });

    it("does not overwrite budget when incoming has no budget", () => {
      const existing: UserMemoryProfile = { budgetRange: [100, 200] };
      const incoming: Partial<UserMemoryProfile> = { homeOrigin: "家" };
      const merged = mergeMemoryProfile(existing, incoming);
      expect(merged.budgetRange).toEqual([100, 200]);
    });
  });
});
