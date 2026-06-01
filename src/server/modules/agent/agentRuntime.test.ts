import { describe, expect, it, vi } from "vitest";

// Mock all dependencies
vi.mock("../../config/env.js", () => ({
  env: {
    NODE_ENV: "test",
    AGENT_CHAT_MODE: "llm",
    LLM_PROVIDER_PRIORITY: "auto",
    OPENAI_API_KEY: "test-key",
    OPENAI_BASE_URL: "https://api.openai.com/v1",
    LLM_MODEL: "gpt-4o",
    LLM_FLASH_MODEL: "gpt-4o-mini",
    LLM_PRO_MODEL: "gpt-4o",
    LLM_TIMEOUT_MS: 30000,
    QWEN_API_KEY: undefined,
    QWEN_BASE_URL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    QWEN_FLASH_MODEL: undefined,
    QWEN_PRO_MODEL: undefined,
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
    PLANNING_MODE: "mock",
    ENABLE_LLM_FALLBACK: false,
  },
}));

vi.mock("./modelClient.js", () => ({
  hasAnyLlmKey: () => true,
  getChatModel: (mode: string) => ({
    provider: "openai",
    model: mode === "pro" ? "gpt-4o" : "gpt-4o-mini",
  }),
  chatStream: vi.fn().mockResolvedValue({
    stream: (async function* () {
      yield {
        choices: [{
          delta: { content: "你好！有什么出行计划需要帮忙吗？" },
          finish_reason: null,
        }],
      };
      yield {
        choices: [{
          delta: {},
          finish_reason: "stop",
        }],
      };
    })(),
    provider: "openai",
    model: "gpt-4o-mini",
    abort: () => {},
  }),
}));

vi.mock("../../services/memoryStore.js", () => ({
  createConversation: (data: any) => ({ id: "mem-conv-id", ...data, createdAt: new Date(), updatedAt: new Date() }),
  getConversation: () => undefined,
  addMessage: () => {},
  listMessages: () => [],
}));

vi.mock("./orchestrator.js", () => ({
  runPlanningPipeline: vi.fn().mockResolvedValue({
    traceId: "test-trace",
    planId: "test-plan",
    mode: "mock",
    options: [],
    summary: "测试方案",
    selectedPlanId: "",
    responseType: "chat",
    executableActions: [],
    nextActions: [],
    validation: { status: "pass", score: 100, blockingErrors: [], warnings: [], repairHints: [] },
  }),
}));

import { runAgentChatStream } from "./agentRuntime.js";

describe("agentRuntime", () => {
  it("handles a simple chat message", async () => {
    const collected: string[] = [];
    const result = await runAgentChatStream(
      {
        message: "你好",
        city: "杭州",
        modelMode: "flash",
      },
      {
        db: null,
        userId: "test-user",
        log: {
          info: () => {},
          warn: () => {},
          error: () => {},
        },
      },
      {
        writeText: (delta) => collected.push(delta),
      },
    );

    expect(result.type).toBe("chat");
    expect(result.content).toBeTruthy();
    expect(collected.length).toBeGreaterThan(0);
    expect(result.conversationId).toBeTruthy();
  });
});
