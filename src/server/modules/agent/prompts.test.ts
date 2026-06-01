import { describe, expect, it } from "vitest";
import { buildSystemPrompt, buildToolCallingPrompt, buildTextPlanningPrompt } from "./prompts.js";

describe("prompts", () => {
  describe("buildSystemPrompt", () => {
    it("returns tool-calling prompt when toolCallingEnabled=true", () => {
      const prompt = buildSystemPrompt({ toolCallingEnabled: true });
      expect(prompt).toContain("update_planning_draft");
      expect(prompt).toContain("search_places");
      expect(prompt).toContain("generate_weekend_plan");
      expect(prompt).toContain("prepare_action");
    });

    it("returns text-planning prompt when toolCallingEnabled=false", () => {
      const prompt = buildSystemPrompt({ toolCallingEnabled: false });
      expect(prompt).not.toContain("update_planning_draft");
      expect(prompt).not.toContain("search_places");
      expect(prompt).toContain("提取关键信息");
      expect(prompt).toContain("方案标题");
    });

    it("defaults to tool-calling prompt when toolCallingEnabled not specified", () => {
      const prompt = buildSystemPrompt();
      expect(prompt).toContain("update_planning_draft");
    });

    it("appends city context when provided", () => {
      const prompt = buildSystemPrompt({ city: "杭州" });
      expect(prompt).toContain("用户当前城市：杭州");
    });

    it("appends time context when provided", () => {
      const prompt = buildSystemPrompt({ currentTime: "2024-01-01T12:00:00Z" });
      expect(prompt).toContain("当前时间：2024-01-01T12:00:00Z");
    });

    it("appends weather context when provided", () => {
      const prompt = buildSystemPrompt({ weather: "小雨" });
      expect(prompt).toContain("天气：小雨");
    });
  });

  describe("buildToolCallingPrompt", () => {
    it("always returns tool-calling prompt", () => {
      const prompt = buildToolCallingPrompt();
      expect(prompt).toContain("update_planning_draft");
      expect(prompt).toContain("search_places");
    });
  });

  describe("buildTextPlanningPrompt", () => {
    it("always returns text-planning prompt", () => {
      const prompt = buildTextPlanningPrompt();
      expect(prompt).not.toContain("update_planning_draft");
      expect(prompt).toContain("提取关键信息");
    });

    it("includes plan quality requirements", () => {
      const prompt = buildTextPlanningPrompt();
      expect(prompt).toContain("方案标题");
      expect(prompt).toContain("时间线");
      expect(prompt).toContain("总预算估算");
      expect(prompt).toContain("雨天备选");
    });

    it("includes slot extraction guidance", () => {
      const prompt = buildTextPlanningPrompt();
      expect(prompt).toContain("出发地");
      expect(prompt).toContain("预算");
      expect(prompt).toContain("同行人");
    });

    it("includes default strategy for missing info", () => {
      const prompt = buildTextPlanningPrompt();
      expect(prompt).toContain("最多追问");
      expect(prompt).toContain("默认");
    });
  });
});
