import { describe, it, expect } from "vitest";
import { formatMatchScore } from "./formatMatchScore";

describe("formatMatchScore", () => {
  it("formats 0–1 range correctly", () => {
    expect(formatMatchScore(0.9)).toBe("90%");
    expect(formatMatchScore(0.86)).toBe("86%");
    expect(formatMatchScore(1)).toBe("100%");
    expect(formatMatchScore(0)).toBe("0%");
    expect(formatMatchScore(0.5)).toBe("50%");
    expect(formatMatchScore(0.99)).toBe("99%");
  });

  it("formats 1–100 range correctly", () => {
    expect(formatMatchScore(90)).toBe("90%");
    expect(formatMatchScore(86)).toBe("86%");
    expect(formatMatchScore(100)).toBe("100%");
    expect(formatMatchScore(50)).toBe("50%");
    // Note: score=1 is treated as 0–1 range (1.0 = 100%), tested above
    expect(formatMatchScore(2)).toBe("2%");
  });

  it("clamps anomalous values (>100) to 100%", () => {
    expect(formatMatchScore(8600)).toBe("100%");
    expect(formatMatchScore(9000)).toBe("100%");
    expect(formatMatchScore(200)).toBe("100%");
    expect(formatMatchScore(101)).toBe("100%");
  });

  it("clamps negative values to 0%", () => {
    expect(formatMatchScore(-10)).toBe("0%");
    expect(formatMatchScore(-0.5)).toBe("0%");
  });

  it("handles null, undefined, and NaN", () => {
    expect(formatMatchScore(null)).toBe("");
    expect(formatMatchScore(undefined)).toBe("");
    expect(formatMatchScore(NaN)).toBe("");
  });

  it("rounds fractional percentages", () => {
    expect(formatMatchScore(0.855)).toBe("86%");
    expect(formatMatchScore(85.4)).toBe("85%");
    expect(formatMatchScore(85.5)).toBe("86%");
  });
});
