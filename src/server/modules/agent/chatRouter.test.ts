import { describe, expect, it } from "vitest";
import {
  classifyAgentIntent,
  extractPlanningSlots,
  mergeSlots,
  getMissingSlots,
  isContinuationIntent,
  generateTitleFromSlots,
} from "./chatRouter.js";
import type { AgentState, PlanningSlots } from "../../../shared/agentResponse.js";

describe("chatRouter", () => {
  describe("classifyAgentIntent", () => {
    it("classifies greeting correctly", () => {
      expect(classifyAgentIntent("你好")).toBe("greeting");
      expect(classifyAgentIntent("hi")).toBe("greeting");
      expect(classifyAgentIntent("hello")).toBe("greeting");
      expect(classifyAgentIntent("嗨")).toBe("greeting");
    });

    it("classifies identity question correctly", () => {
      expect(classifyAgentIntent("你是谁")).toBe("identity_question");
      expect(classifyAgentIntent("你叫什么")).toBe("identity_question");
    });

    it("classifies capability question correctly", () => {
      expect(classifyAgentIntent("你能做什么")).toBe("capability_question");
      expect(classifyAgentIntent("你会什么")).toBe("capability_question");
      expect(classifyAgentIntent("怎么用")).toBe("capability_question");
    });

    it("classifies planning request correctly", () => {
      expect(classifyAgentIntent("帮我安排周末出行")).toBe("planning_request");
      expect(classifyAgentIntent("规划一下明天的行程")).toBe("planning_request");
    });

    it("classifies travel question correctly", () => {
      expect(classifyAgentIntent("杭州哪里好玩")).toBe("travel_question");
      expect(classifyAgentIntent("有什么好玩的地方")).toBe("travel_question");
    });

    it("classifies select_plan correctly", () => {
      expect(classifyAgentIntent("选这个方案")).toBe("select_plan");
      expect(classifyAgentIntent("我选择第二套")).toBe("select_plan");
    });

    it("classifies execute_action correctly", () => {
      expect(classifyAgentIntent("保存方案")).toBe("execute_action");
      expect(classifyAgentIntent("打开导航")).toBe("execute_action");
    });

    it("classifies slot_fill when in collecting_slots phase", () => {
      const state: AgentState = { phase: "collecting_slots" };
      // These contain slot info but don't match planning_request regex
      expect(classifyAgentIntent("预算300", state)).toBe("slot_fill");
      expect(classifyAgentIntent("和朋友一起", state)).toBe("slot_fill");
    });

    it("classifies casual_chat for Chinese text without clear intent", () => {
      expect(classifyAgentIntent("今天天气真不错")).toBe("casual_chat");
    });

    it("classifies empty string as unknown", () => {
      expect(classifyAgentIntent("")).toBe("unknown");
      expect(classifyAgentIntent("   ")).toBe("unknown");
    });
  });

  describe("extractPlanningSlots", () => {
    it("extracts origin from text", () => {
      const slots = extractPlanningSlots("从仓前出发去下沙");
      expect(slots.origin).toBe("仓前");
    });

    it("extracts budget from text", () => {
      const slots = extractPlanningSlots("预算300元");
      expect(slots.budget).toBe(300);
    });

    it("extracts partySize from text", () => {
      const slots = extractPlanningSlots("三个人一起去");
      expect(slots.partySize).toBe(3);
    });

    it("extracts companions from text", () => {
      expect(extractPlanningSlots("和朋友一起去").companions).toBe("friends");
      expect(extractPlanningSlots("带娃出去玩").companions).toBe("family");
      expect(extractPlanningSlots("情侣约会").companions).toBe("couple");
      expect(extractPlanningSlots("一个人").companions).toBe("solo");
    });

    it("extracts date from text", () => {
      expect(extractPlanningSlots("周末去玩").date).toBe("周末");
      expect(extractPlanningSlots("明天出发").date).toBe("明天");
    });

    it("extracts timeWindow from text", () => {
      expect(extractPlanningSlots("上午去").timeWindow).toBe("morning");
      expect(extractPlanningSlots("下午出发").timeWindow).toBe("afternoon");
      expect(extractPlanningSlots("晚上约会").timeWindow).toBe("evening");
    });

    it("extracts preferences from text", () => {
      const slots = extractPlanningSlots("不要排队，室内活动");
      expect(slots.preference).toContain("少排队");
      expect(slots.preference).toContain("室内优先");
    });

    it("extracts multiple slots at once", () => {
      const slots = extractPlanningSlots("从仓前出发，预算300，和朋友三个人，下午去");
      expect(slots.origin).toBe("仓前");
      expect(slots.budget).toBe(300);
      expect(slots.partySize).toBe(3);
      expect(slots.companions).toBe("friends");
      expect(slots.timeWindow).toBe("afternoon");
    });
  });

  describe("mergeSlots", () => {
    it("merges new slots into existing", () => {
      const existing: PlanningSlots = { origin: "仓前", budget: 200 };
      const incoming: PlanningSlots = { budget: 300, partySize: 2 };
      const merged = mergeSlots(existing, incoming);
      expect(merged.origin).toBe("仓前");
      expect(merged.budget).toBe(300);
      expect(merged.partySize).toBe(2);
    });

    it("merges preference arrays", () => {
      const existing: PlanningSlots = { preference: ["少排队"] };
      const incoming: PlanningSlots = { preference: ["室内优先"] };
      const merged = mergeSlots(existing, incoming);
      expect(merged.preference).toEqual(["少排队", "室内优先"]);
    });

    it("does not overwrite with empty string but does overwrite with 0", () => {
      const existing: PlanningSlots = { origin: "仓前", budget: 300 };
      const incoming: PlanningSlots = { origin: "", budget: 0 };
      const merged = mergeSlots(existing, incoming);
      expect(merged.origin).toBe("仓前"); // empty string doesn't overwrite
      expect(merged.budget).toBe(0); // 0 is a valid number, overwrites
    });
  });

  describe("getMissingSlots", () => {
    it("returns empty when all required slots present", () => {
      const slots: PlanningSlots = { origin: "仓前", destination: "西湖", time: "明天", partySize: 2 };
      expect(getMissingSlots(slots)).toEqual([]);
    });

    it("returns empty when companions present instead of partySize", () => {
      const slots: PlanningSlots = { origin: "仓前", destination: "西湖", time: "明天", companions: "friends" };
      expect(getMissingSlots(slots)).toEqual([]);
    });

    it("reports origin as missing when not provided", () => {
      const slots: PlanningSlots = { destination: "西湖", time: "明天", partySize: 2 };
      expect(getMissingSlots(slots)).toContain("origin");
    });

    it("does NOT require budget (optional field)", () => {
      const slots: PlanningSlots = { origin: "仓前", destination: "西湖", time: "明天", partySize: 2 };
      const missing = getMissingSlots(slots);
      expect(missing).not.toContain("budget");
      expect(missing).toEqual([]);
    });

    it("requires partySize or companions", () => {
      const slots: PlanningSlots = { origin: "仓前", destination: "西湖", time: "明天" };
      expect(getMissingSlots(slots)).toContain("partySize");
    });

    it("reports all missing fields when empty", () => {
      const slots: PlanningSlots = {};
      const missing = getMissingSlots(slots);
      expect(missing).toContain("destination");
      expect(missing).toContain("time");
      expect(missing).toContain("partySize");
      expect(missing).toContain("origin");
    });

    it("reports time as missing when destination + preferences present but no time", () => {
      const slots: PlanningSlots = { destination: "西湖", preferences: ["咖啡厅", "火锅"], partySize: 1 };
      const missing = getMissingSlots(slots);
      expect(missing).toContain("time");
    });

    it("reports time as missing when destination + origin + budget present but no time", () => {
      const slots: PlanningSlots = { destination: "西湖", origin: "杭师大仓前", budget: 200, partySize: 1 };
      const missing = getMissingSlots(slots);
      expect(missing).toContain("time");
    });
  });

  describe("isContinuationIntent", () => {
    it("identifies continuation intents", () => {
      expect(isContinuationIntent("生成完整的方案")).toBe(true);
      expect(isContinuationIntent("继续")).toBe(true);
      expect(isContinuationIntent("就这个")).toBe(true);
      expect(isContinuationIntent("安排吧")).toBe(true);
      expect(isContinuationIntent("帮我细化")).toBe(true);
      expect(isContinuationIntent("重新规划一下")).toBe(true);
      expect(isContinuationIntent("出方案")).toBe(true);
      expect(isContinuationIntent("给个方案")).toBe(true);
      expect(isContinuationIntent("来个方案")).toBe(true);
      expect(isContinuationIntent("可以了")).toBe(true);
      expect(isContinuationIntent("够了")).toBe(true);
      expect(isContinuationIntent("就这样")).toBe(true);
    });

    it("does not identify non-continuation messages", () => {
      expect(isContinuationIntent("你好")).toBe(false);
      expect(isContinuationIntent("你是谁")).toBe(false);
      expect(isContinuationIntent("去西湖")).toBe(false);
    });
  });

  describe("generateTitleFromSlots", () => {
    it("generates title with destination + preferences", () => {
      const slots: PlanningSlots = { destination: "西湖", preferences: ["咖啡厅", "火锅"] };
      const title = generateTitleFromSlots(slots);
      expect(title).toBe("西湖咖啡厅火锅游");
    });

    it("generates title with origin + destination", () => {
      const slots: PlanningSlots = { origin: "杭师大仓前", destination: "西湖" };
      const title = generateTitleFromSlots(slots);
      expect(title).toBe("杭师大仓前到西湖规划");
    });

    it("generates title with destination only", () => {
      const slots: PlanningSlots = { destination: "杭州" };
      const title = generateTitleFromSlots(slots);
      expect(title).toBe("杭州出行规划");
    });

    it("returns null when no destination", () => {
      const slots: PlanningSlots = { origin: "仓前", budget: 200 };
      const title = generateTitleFromSlots(slots);
      expect(title).toBeNull();
    });

    it("does NOT generate casual chat titles like '你好' or '你是谁'", () => {
      // These should never be valid titles from slots
      const slots: PlanningSlots = { destination: "西湖" };
      const title = generateTitleFromSlots(slots);
      expect(title).not.toContain("你好");
      expect(title).not.toContain("你是谁");
      expect(title).not.toContain("今天是什么时间");
    });
  });

  describe("continuation intent with existing draft", () => {
    it("classifies '生成完整的方案' as continuation when draft exists", () => {
      const state: AgentState = {
        phase: "collecting_slots",
        planningDraft: { destination: "西湖", budget: 200, partySize: 1, companions: "solo" },
      };
      expect(classifyAgentIntent("生成完整的方案", state)).toBe("continuation");
    });

    it("classifies '继续' as continuation when draft has destination", () => {
      const state: AgentState = {
        phase: "collecting_slots",
        planningDraft: { destination: "西湖" },
      };
      expect(classifyAgentIntent("继续", state)).toBe("continuation");
    });

    it("classifies '生成完整的方案' as planning_request when no draft exists", () => {
      expect(classifyAgentIntent("生成完整的方案")).toBe("planning_request");
    });
  });

  describe("budget preservation in slot merge", () => {
    it("preserves budget 200 when merging with empty incoming", () => {
      const existing: PlanningSlots = { budget: 200, destination: "西湖", origin: "杭师大仓前" };
      const incoming: PlanningSlots = {};
      const merged = mergeSlots(existing, incoming);
      expect(merged.budget).toBe(200);
    });

    it("preserves budget 200 when merging with non-budget incoming", () => {
      const existing: PlanningSlots = { budget: 200, destination: "西湖" };
      const incoming: PlanningSlots = { preferences: ["咖啡厅"] };
      const merged = mergeSlots(existing, incoming);
      expect(merged.budget).toBe(200);
      expect(merged.preferences).toEqual(["咖啡厅"]);
    });

    it("does NOT change budget 200 to 420", () => {
      const existing: PlanningSlots = { budget: 200 };
      const incoming: PlanningSlots = {};
      const merged = mergeSlots(existing, incoming);
      expect(merged.budget).toBe(200);
      expect(merged.budget).not.toBe(420);
    });
  });

  describe("slot extraction for complex planning messages", () => {
    it("extracts all slots from a detailed planning message", () => {
      const slots = extractPlanningSlots("一个人，从杭师大仓前出发，明天上午9点出发，找个咖啡厅坐坐，然后去吃午饭，想吃火锅，预算200");
      expect(slots.origin).toBe("杭师大仓前");
      expect(slots.partySize).toBe(1);
      expect(slots.companions).toBe("solo");
      expect(slots.budget).toBe(200);
      expect(slots.preferences).toContain("咖啡厅");
      expect(slots.preferences).toContain("火锅");
      expect(slots.preferences).toContain("午饭");
      expect(slots.time).toContain("明天");
      expect(slots.time).toContain("上午");
      expect(slots.time).toContain("9");
    });
  });
});
