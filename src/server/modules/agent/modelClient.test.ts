import { describe, expect, it, vi } from "vitest";

vi.mock("../../config/env.js", () => ({
  env: {
    OPENAI_API_KEY: "test-openai-key",
    OPENAI_BASE_URL: "https://api.openai.com/v1",
    LLM_MODEL: "gpt-4o",
    LLM_FLASH_MODEL: "gpt-4o-mini",
    LLM_PRO_MODEL: "gpt-4o",
    LLM_TIMEOUT_MS: 30000,
    LLM_PROVIDER_PRIORITY: "auto",
    AGENT_CHAT_MODE: "auto",
    QWEN_API_KEY: "test-qwen-key",
    QWEN_BASE_URL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    QWEN_FLASH_MODEL: "qwen-plus",
    QWEN_PRO_MODEL: "qwen-max",
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
