import { describe, expect, it } from "vitest";
import { isStrongJwtSecret, validateProductionJwtSecrets } from "./env.js";

describe("env security validation", () => {
  it("recognizes strong jwt secret", () => {
    expect(isStrongJwtSecret("a".repeat(32))).toBe(true);
  });

  it("rejects weak jwt secret", () => {
    expect(isStrongJwtSecret("change-me-access-secret")).toBe(false);
    expect(isStrongJwtSecret("short-secret")).toBe(false);
  });

  it("throws in production with weak secrets", () => {
    expect(() =>
      validateProductionJwtSecrets({
        NODE_ENV: "production",
        JWT_ACCESS_SECRET: "change-me-access-secret",
        JWT_REFRESH_SECRET: "change-me-refresh-secret",
      }),
    ).toThrow(/弱 JWT 密钥/);
  });

  it("does not throw outside production", () => {
    expect(() =>
      validateProductionJwtSecrets({
        NODE_ENV: "development",
        JWT_ACCESS_SECRET: "change-me-access-secret",
        JWT_REFRESH_SECRET: "change-me-refresh-secret",
      }),
    ).not.toThrow();
  });
});
