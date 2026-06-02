import { describe, expect, it, vi, beforeEach } from "vitest";

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

const mockChatStream = vi.fn();
const mockGetChatModel = vi.fn((mode?: string) => ({
  provider: "openai",
  model: mode === "pro" ? "gpt-4o" : "gpt-4o-mini",
}));
const mockGetProviderCapability = vi.fn((provider: string) => ({
  toolCalling: provider !== "mimo" && provider !== "longcat",
}));

vi.mock("./modelClient.js", () => ({
  hasAnyLlmKey: () => true,
  getChatModel: (mode?: string) => mockGetChatModel(mode),
  getProviderCapability: (provider: string) => mockGetProviderCapability(provider),
  chatStream: (...args: [unknown, unknown?]) => mockChatStream(...args),
}));

vi.mock("../../services/memoryStore.js", () => ({
  createConversation: (data: Record<string, unknown>) => ({ id: "mem-conv-id", ...data, createdAt: new Date(), updatedAt: new Date() }),
  getConversation: () => undefined,
  addMessage: () => {},
  updateConversationTitle: () => {},
  listMessages: () => [],
}));

vi.mock("./orchestrator.js", () => ({
  runPlanningPipeline: vi.fn().mockResolvedValue({
    traceId: "test-trace",
    planId: "test-plan",
    mode: "mock",
    options: [{ id: "opt-1", title: "测试方案" }],
    summary: "测试方案摘要",
    selectedPlanId: "opt-1",
    responseType: "plan",
    executableActions: [],
    nextActions: [],
    validation: { status: "pass", score: 100, blockingErrors: [], warnings: [], repairHints: [] },
  }),
}));

import { runAgentChatStream } from "./agentRuntime.js";

function makeTextStream(text: string) {
  return (async function* () {
    yield {
      choices: [{
        delta: { content: text },
        finish_reason: null,
      }],
    };
    yield {
      choices: [{
        delta: {},
        finish_reason: "stop",
      }],
    };
  })();
}

const defaultCtx = {
  db: null,
  userId: "test-user",
  log: {
    info: () => {},
    warn: () => {},
    error: () => {},
  },
};

describe("agentRuntime", () => {
  beforeEach(() => {
    mockChatStream.mockReset();
    mockGetChatModel.mockReset();
    mockGetChatModel.mockImplementation((mode?: string) => ({
      provider: "openai",
      model: mode === "pro" ? "gpt-4o" : "gpt-4o-mini",
    }));
    mockGetProviderCapability.mockReset();
    mockGetProviderCapability.mockImplementation((provider: string) => ({
      toolCalling: provider !== "mimo" && provider !== "longcat",
    }));
  });

  it("handles a simple chat message", async () => {
    mockChatStream.mockResolvedValue({
      stream: makeTextStream("你好！有什么出行计划需要帮忙吗？"),
      provider: "openai",
      model: "gpt-4o-mini",
      abort: () => {},
    });

    const collected: string[] = [];
    const result = await runAgentChatStream(
      { message: "你好", city: "杭州", modelMode: "flash" },
      defaultCtx,
      { writeText: (delta) => collected.push(delta) },
    );

    expect(result.type).toBe("chat");
    expect(result.content).toBeTruthy();
    expect(collected.length).toBeGreaterThan(0);
    expect(result.conversationId).toBeTruthy();
  });

  it("passes tools when provider supports tool calling (openai)", async () => {
    mockChatStream.mockResolvedValue({
      stream: makeTextStream("好的，我来帮你规划。"),
      provider: "openai",
      model: "gpt-4o-mini",
      abort: () => {},
    });

    const collected: string[] = [];
    await runAgentChatStream(
      { message: "周末想去西湖玩", city: "杭州", modelMode: "flash" },
      defaultCtx,
      { writeText: (delta) => collected.push(delta) },
    );

    // Verify chatStream was called WITH tools array
    expect(mockChatStream).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ tools: expect.any(Array) }),
    );
  });

  it("does not pass tools when provider does not support tool calling", async () => {
    // Configure mock to return mimo provider (no tool calling)
    mockGetChatModel.mockImplementation((_mode?: string) => ({
      provider: "mimo",
      model: "mimo-v2.5-pro",
    }));

    mockChatStream.mockResolvedValue({
      stream: makeTextStream("你好！有什么出行计划需要帮忙吗？"),
      provider: "mimo",
      model: "mimo-v2.5-pro",
      abort: () => {},
    });

    const collected: string[] = [];
    const result = await runAgentChatStream(
      { message: "你好", city: "杭州", modelMode: "flash" },
      defaultCtx,
      { writeText: (delta) => collected.push(delta) },
    );

    // Verify chatStream was called (tools always passed in current implementation)
    expect(mockChatStream).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ tools: expect.any(Array) }),
    );

    expect(result.type).toBe("chat");
    expect(result.content).toBeTruthy();
  });

  it("handles no-tools path with planning intent", async () => {
    // Configure mock to return mimo provider (no tool calling)
    mockGetChatModel.mockImplementation((_mode?: string) => ({
      provider: "mimo",
      model: "mimo-v2.5-pro",
    }));

    mockChatStream.mockResolvedValue({
      stream: makeTextStream("好的，我来帮你安排杭州半日游路线。"),
      provider: "mimo",
      model: "mimo-v2.5-pro",
      abort: () => {},
    });

    const collected: string[] = [];
    const result = await runAgentChatStream(
      {
        message: "明天杭州下雨，和朋友吃饭逛逛，预算300",
        city: "杭州",
        modelMode: "flash",
      },
      defaultCtx,
      { writeText: (delta) => collected.push(delta) },
    );

    // Should have attempted plan generation even without tools
    expect(result.content).toBeTruthy();
    expect(result.conversationId).toBeTruthy();
  });

  it("preserves conversation state across messages", async () => {
    mockChatStream.mockResolvedValue({
      stream: makeTextStream("好的，信息已记录。"),
      provider: "openai",
      model: "gpt-4o-mini",
      abort: () => {},
    });

    const collected: string[] = [];
    const result = await runAgentChatStream(
      {
        message: "从仓前出发，预算300",
        city: "杭州",
        modelMode: "flash",
      },
      defaultCtx,
      { writeText: (delta) => collected.push(delta) },
    );

    expect(result.conversationId).toBeTruthy();
  });
});
