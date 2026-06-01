import { describe, expect, it } from "vitest";
import { isStrongJwtSecret, validateProductionJwtSecrets, validateProductionRuntime } from "./env.js";

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

const baseProdEnv = {
  NODE_ENV: "production" as const,
  PORT: 3001,
  HOST: "0.0.0.0",
  CORS_ORIGINS: "https://example.com",
  DATABASE_URL: "postgresql://user:pass@real-host:5432/planninggo?schema=public",
  REDIS_URL: "redis://:pass@real-host:6379/0",
  JWT_ACCESS_SECRET: "a".repeat(32),
  JWT_REFRESH_SECRET: "b".repeat(32),
  JWT_ACCESS_EXPIRES_IN: "15m",
  JWT_REFRESH_EXPIRES_IN: "7d",
  BCRYPT_ROUNDS: 12,
  PLANNING_MODE: "hybrid" as const,
  ENABLE_LLM_FALLBACK: false,
  OPENAI_API_KEY: undefined,
  OPENAI_BASE_URL: "https://api.openai.com/v1",
  LLM_MODEL: "gpt-4o",
  LLM_FLASH_MODEL: undefined,
  LLM_PRO_MODEL: undefined,
  LLM_TIMEOUT_MS: 30000,
  AGENT_CHAT_MODE: "auto" as const,
  LLM_PROVIDER_PRIORITY: "auto",
  DEEPSEEK_API_KEY: undefined,
  DEEPSEEK_BASE_URL: "https://api.deepseek.com",
  DEEPSEEK_FLASH_MODEL: undefined,
  DEEPSEEK_PRO_MODEL: undefined,
  MOONSHOT_API_KEY: undefined,
  MOONSHOT_BASE_URL: "https://api.moonshot.cn/v1",
  MOONSHOT_FLASH_MODEL: undefined,
  MOONSHOT_PRO_MODEL: undefined,
  GROQ_API_KEY: undefined,
  GROQ_BASE_URL: "https://api.groq.com/openai/v1",
  GROQ_FLASH_MODEL: undefined,
  GROQ_PRO_MODEL: undefined,
  GEMINI_API_KEY: undefined,
  GEMINI_BASE_URL: "https://generativelanguage.googleapis.com/v1beta/openai",
  GEMINI_FLASH_MODEL: undefined,
  GEMINI_PRO_MODEL: undefined,
  DOUBAO_API_KEY: undefined,
  DOUBAO_BASE_URL: "https://ark.cn-beijing.volces.com/api/v3",
  DOUBAO_FLASH_MODEL: undefined,
  DOUBAO_PRO_MODEL: undefined,
  MIMO_API_KEY: undefined,
  MIMO_BASE_URL: "https://api.mimo.ai/v1",
  MIMO_FLASH_MODEL: undefined,
  MIMO_PRO_MODEL: undefined,
  LONGCAT_API_KEY: undefined,
  LONGCAT_BASE_URL: "https://api.longcat.ai/openai/v1",
  LONGCAT_FLASH_MODEL: undefined,
  LONGCAT_PRO_MODEL: undefined,
  CLAUDE_API_KEY: undefined,
  CLAUDE_BASE_URL: "https://api.anthropic.com",
  CLAUDE_MODEL: undefined,
  GROK_API_KEY: undefined,
  GROK_BASE_URL: "https://api.x.ai",
  GROK_MODEL: undefined,
  AMAP_WEB_SERVICE_KEY: "test-key",
  AMAP_BASE_URL: "https://restapi.amap.com",
  AMAP_TIMEOUT_MS: 5000,
  AMAP_MAX_CALLS_FLASH: 8,
  AMAP_MAX_CALLS_PRO: 16,
  QWEATHER_API_KEY: undefined,
  MEITUAN_APP_KEY: undefined,
  MEITUAN_APP_SECRET: undefined,
  MEITUAN_REDIRECT_URI: undefined,
  MEITUAN_AUTH_URL: undefined,
  MEITUAN_TOKEN_URL: undefined,
  MEITUAN_USERINFO_URL: undefined,
  AUTO_EXECUTION_ENABLED: true,
  AUTO_EXECUTION_MAX_ACTIONS: 6,
  AUTO_EXECUTION_ALLOW_PAYMENT: false,
  ACTION_TOKEN_TTL_MINUTES: 15,
  PUBLIC_APP_URL: "https://example.com",
  HANDOFF_TOKEN_TTL_SECONDS: 300,
  HANDOFF_QR_ENABLED: true,
  ENABLE_TOOL_LOGS: true,
  ENABLE_USER_EVENTS: true,
  ENABLE_CLIENT_ERRORS: true,
  QWEN_API_KEY: "test-key",
  QWEN_BASE_URL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  QWEN_FLASH_MODEL: undefined,
  QWEN_PRO_MODEL: undefined,
  QWEN_ENABLE_THINKING: false,
  ENABLE_DEMO_AUTH: false,
  ENABLE_DEV_SANDBOX: false,
  ALLOW_MOCK_PROVIDER_IN_PRODUCTION: false,
  REQUIRE_DB_IN_PRODUCTION: true,
  REQUIRE_REDIS_IN_PRODUCTION: true,
  COOKIE_SECRET: "a-very-long-cookie-secret-for-production-use-32chars",
};

describe("validateProductionRuntime", () => {
  it("does not throw outside production", () => {
    expect(() =>
      validateProductionRuntime({ ...baseProdEnv, NODE_ENV: "development" }),
    ).not.toThrow();
  });

  it("passes with valid production config", () => {
    expect(() => validateProductionRuntime(baseProdEnv)).not.toThrow();
  });

  it("throws when PLANNING_MODE=mock in production", () => {
    expect(() =>
      validateProductionRuntime({ ...baseProdEnv, PLANNING_MODE: "mock" }),
    ).toThrow(/PLANNING_MODE=mock/);
  });

  it("allows PLANNING_MODE=mock when ALLOW_MOCK_PROVIDER_IN_PRODUCTION=true", () => {
    expect(() =>
      validateProductionRuntime({
        ...baseProdEnv,
        PLANNING_MODE: "mock",
        ALLOW_MOCK_PROVIDER_IN_PRODUCTION: true,
      }),
    ).not.toThrow();
  });

  it("throws when DATABASE_URL is default", () => {
    expect(() =>
      validateProductionRuntime({
        ...baseProdEnv,
        DATABASE_URL: "postgresql://planninggo:planninggo@localhost:5432/planninggo?schema=public",
      }),
    ).toThrow(/DATABASE_URL/);
  });

  it("throws when REDIS_URL uses localhost", () => {
    expect(() =>
      validateProductionRuntime({ ...baseProdEnv, REDIS_URL: "redis://localhost:6379/0" }),
    ).toThrow(/REDIS_URL/);
  });

  it("throws when COOKIE_SECRET is too short", () => {
    expect(() =>
      validateProductionRuntime({ ...baseProdEnv, COOKIE_SECRET: "short" }),
    ).toThrow(/COOKIE_SECRET/);
  });

  it("throws when COOKIE_SECRET is missing", () => {
    expect(() =>
      validateProductionRuntime({ ...baseProdEnv, COOKIE_SECRET: undefined }),
    ).toThrow(/COOKIE_SECRET/);
  });

  it("throws when ENABLE_DEMO_AUTH is true", () => {
    expect(() =>
      validateProductionRuntime({ ...baseProdEnv, ENABLE_DEMO_AUTH: true }),
    ).toThrow(/ENABLE_DEMO_AUTH/);
  });

  it("throws when AUTO_EXECUTION_ALLOW_PAYMENT is true", () => {
    expect(() =>
      validateProductionRuntime({ ...baseProdEnv, AUTO_EXECUTION_ALLOW_PAYMENT: true }),
    ).toThrow(/AUTO_EXECUTION_ALLOW_PAYMENT/);
  });
});
