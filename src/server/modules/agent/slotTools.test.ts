import { describe, expect, it } from "vitest";
import { executeUpdatePlanningDraft } from "./slotTools.js";

describe("slotTools", () => {
  it("records origin and returns missing slots", () => {
    const result = executeUpdatePlanningDraft({}, { origin: "朝阳区" });
    expect(result.knownSlots.origin).toBe("朝阳区");
    expect(result.missingSlots).toContain("budget");
    expect(result.isReady).toBe(false);
  });

  it("merges multiple slots", () => {
    const result = executeUpdatePlanningDraft(
      { origin: "朝阳区" },
      { budget: 500, partySize: 3, companions: "family" },
    );
    expect(result.knownSlots.origin).toBe("朝阳区");
    expect(result.knownSlots.budget).toBe(500);
    expect(result.knownSlots.partySize).toBe(3);
    expect(result.knownSlots.companions).toBe("family");
  });

  it("isReady when all required slots are present", () => {
    const result = executeUpdatePlanningDraft({}, {
      origin: "海淀区",
      budget: 300,
      partySize: 2,
    });
    expect(result.isReady).toBe(true);
  });

  it("handles destinationCity", () => {
    const result = executeUpdatePlanningDraft({}, {
      origin: "朝阳区",
      destinationCity: "杭州",
      budget: 800,
      partySize: 2,
    });
    expect(result.knownSlots.destinationCity).toBe("杭州");
    expect(result.isReady).toBe(true);
  });

  it("merges preference arrays", () => {
    const result = executeUpdatePlanningDraft(
      { preference: ["亲子"] },
      { preference: "美食" },
    );
    expect(result.knownSlots.preference).toContain("亲子");
    expect(result.knownSlots.preference).toContain("美食");
  });

  it("returns empty slots for empty input", () => {
    const result = executeUpdatePlanningDraft({}, {});
    expect(result.missingSlots.length).toBeGreaterThan(0);
    expect(result.isReady).toBe(false);
  });
});
