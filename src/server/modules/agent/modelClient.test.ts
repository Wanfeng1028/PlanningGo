import { describe, expect, it, vi } from "vitest";

vi.mock("../../config/env.js", () => ({
  env: {
    NODE_ENV: "test",
    PORT: 3001,
    HOST: "0.0.0.0",
    CORS_ORIGINS: "http://localhost:5173",
    DATABASE_URL: "postgresql://test:test@localhost:5432/test",
    REDIS_URL: "redis://localhost:6379/0",
    JWT_ACCESS_SECRET: "test-access-secret-32-chars-long-ok",
    JWT_REFRESH_SECRET: "test-refresh-secret-32-chars-long-ok",
    JWT_ACCESS_EXPIRES_IN: "15m",
    JWT_REFRESH_EXPIRES_IN: "7d",
    BCRYPT_ROUNDS: 10,
    OPENAI_API_KEY: "test-openai-key",
    OPENAI_BASE_URL: "https://api.openai.com/v1",
    LLM_MODEL: "gpt-4o",
    LLM_FLASH_MODEL: "gpt-4o-mini",
    LLM_PRO_MODEL: "gpt-4o",
    LLM_TIMEOUT_MS: 30000,
    LLM_PROVIDER_PRIORITY: "auto",
    LLM_PROVIDER_FALLBACK: false,
    LLM_EXPOSE_DIAGNOSTICS: false,
    AGENT_CHAT_MODE: "auto",
    PLANNING_MODE: "mock",
    ENABLE_LLM_FALLBACK: false,
    QWEN_API_KEY: "test-qwen-key",
    QWEN_BASE_URL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    QWEN_FLASH_MODEL: "qwen-plus",
    QWEN_PRO_MODEL: "qwen-max",
    QWEN_ENABLE_THINKING: false,
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
    MIMO_SUPPORTS_TOOL_CALLING: false,
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
    AMAP_WEB_SERVICE_KEY: undefined,
    AMAP_BASE_URL: "https://restapi.amap.com",
    AMAP_TIMEOUT_MS: 5000,
    AMAP_MAX_CALLS_FLASH: 8,
    AMAP_MAX_CALLS_PRO: 16,
    QWEATHER_API_KEY: undefined,
    PUBLIC_APP_URL: "http://localhost:5173",
    AUTO_EXECUTION_ENABLED: false,
    AUTO_EXECUTION_MAX_ACTIONS: 6,
    AUTO_EXECUTION_ALLOW_PAYMENT: false,
    ACTION_TOKEN_TTL_MINUTES: 15,
    HANDOFF_TOKEN_TTL_SECONDS: 300,
    HANDOFF_QR_ENABLED: true,
    ENABLE_TOOL_LOGS: true,
    ENABLE_USER_EVENTS: true,
    ENABLE_CLIENT_ERRORS: true,
    ENABLE_DEMO_AUTH: false,
    ENABLE_DEV_SANDBOX: false,
    ALLOW_MOCK_PROVIDER_IN_PRODUCTION: false,
    REQUIRE_DB_IN_PRODUCTION: true,
    REQUIRE_REDIS_IN_PRODUCTION: true,
    COOKIE_SECRET: "test-cookie-secret-32-chars-long-ok",
  },
}));

import { hasAnyLlmKey, getChatModel } from "./modelClient.js";

describe("modelClient", () => {
  it("hasAnyLlmKey returns true when keys are configured", () => {
    expect(hasAnyLlmKey()).toBe(true);
  });

  it("getChatModel returns first available provider flash model", () => {
    const result = getChatModel("flash");
    expect(result.provider).toBe("openai");
    expect(result.model).toBe("gpt-4o-mini");
  });

  it("getChatModel returns pro model", () => {
    const result = getChatModel("pro");
    expect(result.provider).toBe("openai");
    expect(result.model).toBe("gpt-4o");
  });
});
