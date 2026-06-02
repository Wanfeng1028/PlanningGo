import OpenAI from "openai";
import { env } from "../../config/env.js";
import { ClaudeAdapter, GrokAdapter, type LlmAdapter, type LlmMessage, type LlmTool } from "./llmAdapter.js";

/**
 * modelClient — Multi-provider OpenAI-compatible LLM client
 *
 * Supports: OpenAI, Qwen (DashScope), DeepSeek, Moonshot, Groq, Gemini (OpenAI-compat)
 * Non-OpenAI providers (Claude, Grok) use adapters.
 * Resolves providers by priority list or auto-detects based on which keys are present.
 */

// ─── Provider Definitions ────────────────────────────────────

export interface ProviderCapability {
  streaming: boolean;
  toolCalling: boolean;
  jsonMode: boolean;
  maxToolRounds: number;
}

interface ProviderConfig {
  name: string;
  apiKey?: string;
  baseURL: string;
  flashModel: string;
  proModel: string;
  capability: ProviderCapability;
}

function buildProviderList(): ProviderConfig[] {
  const mimoToolCalling = env.MIMO_SUPPORTS_TOOL_CALLING ?? false;
  const defaultCap: ProviderCapability = { streaming: true, toolCalling: true, jsonMode: true, maxToolRounds: 5 };

  return [
    {
      name: "openai",
      apiKey: env.OPENAI_API_KEY,
      baseURL: env.OPENAI_BASE_URL,
      flashModel: env.LLM_FLASH_MODEL ?? env.LLM_MODEL,
      proModel: env.LLM_PRO_MODEL ?? env.LLM_MODEL,
      capability: defaultCap,
    },
    {
      name: "qwen",
      apiKey: env.QWEN_API_KEY,
      baseURL: env.QWEN_BASE_URL,
      flashModel: env.QWEN_FLASH_MODEL ?? "qwen-plus",
      proModel: env.QWEN_PRO_MODEL ?? "qwen-max",
      capability: defaultCap,
    },
    {
      name: "deepseek",
      apiKey: env.DEEPSEEK_API_KEY,
      baseURL: env.DEEPSEEK_BASE_URL,
      flashModel: env.DEEPSEEK_FLASH_MODEL ?? "deepseek-chat",
      proModel: env.DEEPSEEK_PRO_MODEL ?? "deepseek-chat",
      capability: defaultCap,
    },
    {
      name: "moonshot",
      apiKey: env.MOONSHOT_API_KEY,
      baseURL: env.MOONSHOT_BASE_URL,
      flashModel: env.MOONSHOT_FLASH_MODEL ?? "moonshot-v1-8k",
      proModel: env.MOONSHOT_PRO_MODEL ?? "moonshot-v1-32k",
      capability: defaultCap,
    },
    {
      name: "groq",
      apiKey: env.GROQ_API_KEY,
      baseURL: env.GROQ_BASE_URL,
      flashModel: env.GROQ_FLASH_MODEL ?? "llama-3.3-70b-versatile",
      proModel: env.GROQ_PRO_MODEL ?? "llama-3.3-70b-versatile",
      capability: defaultCap,
    },
    {
      name: "gemini",
      apiKey: env.GEMINI_API_KEY,
      baseURL: env.GEMINI_BASE_URL,
      flashModel: env.GEMINI_FLASH_MODEL ?? "gemini-2.0-flash",
      proModel: env.GEMINI_PRO_MODEL ?? "gemini-2.5-pro-preview-05-06",
      capability: defaultCap,
    },
    {
      name: "doubao",
      apiKey: env.DOUBAO_API_KEY,
      baseURL: env.DOUBAO_BASE_URL,
      flashModel: env.DOUBAO_FLASH_MODEL ?? "doubao-1.5-pro-32k",
      proModel: env.DOUBAO_PRO_MODEL ?? "doubao-1.5-pro-256k",
      capability: { streaming: true, toolCalling: false, jsonMode: true, maxToolRounds: 0 },
    },
    {
      name: "mimo",
      apiKey: env.MIMO_API_KEY,
      baseURL: env.MIMO_BASE_URL,
      flashModel: env.MIMO_FLASH_MODEL ?? "mimo-v2.5-pro",
      proModel: env.MIMO_PRO_MODEL ?? "mimo-v2.5-pro",
      capability: {
        streaming: true,
        toolCalling: mimoToolCalling,
        jsonMode: true,
        maxToolRounds: mimoToolCalling ? 5 : 0,
      },
    },
    {
      name: "longcat",
      apiKey: env.LONGCAT_API_KEY,
      baseURL: env.LONGCAT_BASE_URL,
      flashModel: env.LONGCAT_FLASH_MODEL ?? "longcat-chat",
      proModel: env.LONGCAT_PRO_MODEL ?? "longcat-chat",
      capability: { streaming: true, toolCalling: false, jsonMode: true, maxToolRounds: 0 },
    },
  ];
}

/**
 * Parse priority list from env. "auto" = try all with keys in default order.
 */
function resolveProviders(): ProviderConfig[] {
  const all = buildProviderList();
  const withKeys = all.filter((p) => Boolean(p.apiKey));

  const priority = env.LLM_PROVIDER_PRIORITY.trim().toLowerCase();
  if (priority === "auto" || priority === "") {
    return withKeys;
  }

  const names = priority.split(",").map((s) => s.trim()).filter(Boolean);
  const ordered: ProviderConfig[] = [];
  for (const name of names) {
    const found = all.find((p) => p.name === name);
    if (found && found.apiKey) ordered.push(found);
  }
  // Append any remaining providers with keys not explicitly listed
  for (const p of withKeys) {
    if (!ordered.find((o) => o.name === p.name)) ordered.push(p);
  }
  return ordered;
}

// ─── Non-OpenAI Adapters ─────────────────────────────────────

const claudeAdapter = new ClaudeAdapter();
const grokAdapter = new GrokAdapter();

function getAdapterProviders(): Array<{ name: string; adapter: LlmAdapter; flashModel: string; proModel: string }> {
  const result: Array<{ name: string; adapter: LlmAdapter; flashModel: string; proModel: string }> = [];

  if (claudeAdapter.isConfigured()) {
    result.push({
      name: "claude",
      adapter: claudeAdapter,
      flashModel: env.CLAUDE_MODEL ?? "claude-sonnet-4-20250514",
      proModel: env.CLAUDE_MODEL ?? "claude-sonnet-4-20250514",
    });
  }

  if (grokAdapter.isConfigured()) {
    result.push({
      name: "grok",
      adapter: grokAdapter,
      flashModel: env.GROK_MODEL ?? "grok-3",
      proModel: env.GROK_MODEL ?? "grok-3",
    });
  }

  return result;
}

// ─── Provider Capability ─────────────────────────────────────

/**
 * Providers known to support OpenAI-compatible function/tool calling.
 * MiMo respects MIMO_SUPPORTS_TOOL_CALLING env var.
 * Others (longcat, doubao) are treated as text-only to be safe.
 */
const TOOL_CALLING_PROVIDERS = new Set([
  "openai", "qwen", "deepseek", "moonshot", "groq", "gemini", "claude", "grok",
]);

export function getProviderCapability(providerName: string): ProviderCapability {
  const name = providerName.toLowerCase();
  let hasToolCalling = TOOL_CALLING_PROVIDERS.has(name);

  // MiMo: 根据环境变量决定是否支持 tool calling
  if (name === "mimo") {
    hasToolCalling = env.MIMO_SUPPORTS_TOOL_CALLING ?? false;
  }

  return {
    streaming: true,
    toolCalling: hasToolCalling,
    jsonMode: hasToolCalling,
    maxToolRounds: hasToolCalling ? 5 : 0,
  };
}

// ─── Public API ──────────────────────────────────────────────

export function hasAnyLlmKey(): boolean {
  return buildProviderList().some((p) => Boolean(p.apiKey)) ||
    claudeAdapter.isConfigured() ||
    grokAdapter.isConfigured();
}

export type ChatMode = "flash" | "pro";

/**
 * Get model name for the given mode (flash/pro) using the first available provider.
 */
export function getChatModel(mode: ChatMode = "flash"): { provider: string; model: string } {
  const providers = resolveProviders();
  if (providers.length === 0) {
    return { provider: "none", model: "gpt-4o" };
  }
  const p = providers[0];
  return {
    provider: p.name,
    model: mode === "pro" ? p.proModel : p.flashModel,
  };
}

/**
 * Create an OpenAI client for the first available provider.
 */
function createClient(provider: ProviderConfig): OpenAI {
  return new OpenAI({
    apiKey: provider.apiKey ?? "missing-key",
    baseURL: provider.baseURL,
    timeout: env.LLM_TIMEOUT_MS,
  });
}

/**
 * Non-streaming chat completion (used as fallback / utility).
 */
export async function chat(
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  options?: { mode?: ChatMode; temperature?: number; maxTokens?: number; model?: string },
): Promise<{ content: string; provider: string; model: string; usage: OpenAI.CompletionUsage | undefined }> {
  const providers = resolveProviders();
  if (providers.length === 0) throw new Error("No LLM API key configured");

  const mode = options?.mode ?? "flash";
  const allowFallback = env.LLM_PROVIDER_FALLBACK;
  let lastError: Error | null = null;

  for (const p of providers) {
    const client = createClient(p);
    const model = options?.model ?? (mode === "pro" ? p.proModel : p.flashModel);
    try {
      const result = await client.chat.completions.create({
        model,
        messages,
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens ?? 4096,
      });
      const choice = result.choices[0];
      return {
        content: choice?.message?.content ?? "",
        provider: p.name,
        model,
        usage: result.usage,
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (!allowFallback) {
        throw lastError;
      }
      // Try next provider
    }
  }
  throw lastError ?? new Error("All LLM providers failed");
}

/**
 * Streaming chat completion. Returns an async iterable of text deltas.
 * Falls back across providers on connection errors.
 *
 * Supports both OpenAI-compatible providers and non-OpenAI adapters (Claude, Grok).
 */
export async function chatStream(
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  options?: { mode?: ChatMode; temperature?: number; maxTokens?: number; model?: string; tools?: OpenAI.Chat.Completions.ChatCompletionTool[] },
): Promise<{
  stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>;
  provider: string;
  model: string;
  abort: () => void;
}> {
  const mode = options?.mode ?? "flash";
  const allowFallback = env.LLM_PROVIDER_FALLBACK;

  // Try OpenAI-compatible providers first
  const providers = resolveProviders();
  let lastError: Error | null = null;

  for (const p of providers) {
    const client = createClient(p);
    const model = options?.model ?? (mode === "pro" ? p.proModel : p.flashModel);
    const controller = new AbortController();
    try {
      const stream = await client.chat.completions.create(
        {
          model,
          messages,
          temperature: options?.temperature ?? 0.7,
          max_tokens: options?.maxTokens ?? 4096,
          stream: true,
          ...(options?.tools && options.tools.length > 0 ? { tools: options.tools } : {}),
        },
        { signal: controller.signal },
      );
      return {
        stream,
        provider: p.name,
        model,
        abort: () => controller.abort(),
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (!allowFallback) {
        throw lastError;
      }
    }
  }

  // Try non-OpenAI adapters (Claude, Grok)
  const adapterProviders = getAdapterProviders();
  for (const ap of adapterProviders) {
    const model = options?.model ?? (mode === "pro" ? ap.proModel : ap.flashModel);

    // Convert OpenAI message format to adapter format
    const adapterMessages: LlmMessage[] = messages.map((m) => ({
      role: m.role as LlmMessage["role"],
      content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
    }));

    // Convert OpenAI tool format to adapter format
    const adapterTools: LlmTool[] | undefined = options?.tools?.map((t) => {
      if ("function" in t) {
        return {
          type: "function" as const,
          function: {
            name: t.function.name,
            description: t.function.description ?? "",
            parameters: t.function.parameters as Record<string, unknown>,
          },
        };
      }
      // ChatCompletionCustomTool – skip
      return undefined;
    }).filter(Boolean) as LlmTool[] | undefined;

    try {
      const result = await ap.adapter.chatStream(adapterMessages, {
        model,
        temperature: options?.temperature,
        maxTokens: options?.maxTokens,
        tools: adapterTools,
      });

      // Wrap adapter stream to match OpenAI chunk format
      const wrappedStream = wrapAdapterStream(result.stream);

      return {
        stream: wrappedStream,
        provider: ap.name,
        model: result.model,
        abort: result.abort,
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (!allowFallback) {
        throw lastError;
      }
    }
  }

  throw lastError ?? new Error("No LLM API key configured");
}

/**
 * Wrap adapter stream chunks to match OpenAI ChatCompletionChunk format.
 */
async function* wrapAdapterStream(
  stream: AsyncIterable<{ content?: string; toolCalls?: Array<{ id: string; name: string; arguments: string }>; finishReason?: string }>,
): AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk> {
  for await (const chunk of stream) {
    const delta: Record<string, unknown> = {};

    if (chunk.content) {
      delta.content = chunk.content;
    }

    if (chunk.toolCalls) {
      delta.tool_calls = chunk.toolCalls.map((tc, index) => ({
        index,
        id: tc.id,
        type: "function",
        function: {
          name: tc.name,
          arguments: tc.arguments,
        },
      }));
    }

    yield {
      id: `chatcmpl-${Date.now()}`,
      object: "chat.completion.chunk",
      created: Math.floor(Date.now() / 1000),
      model: "adapter",
      choices: [{
        index: 0,
        delta,
        finish_reason: chunk.finishReason as any ?? null,
      }],
    } as unknown as OpenAI.Chat.Completions.ChatCompletionChunk;
  }
}

/**
 * Get diagnostics for the current LLM provider configuration.
 * Used by the smoke test endpoint.
 */
export async function getProviderDiagnostics(): Promise<{
  ok: boolean;
  provider: string;
  model: string;
  streaming: boolean;
  toolCalling: boolean;
  latencyMs: number;
  error?: string;
}> {
  const { provider, model } = getChatModel("flash");
  const providers = resolveProviders();
  const current = providers[0];

  if (!current) {
    return {
      ok: false,
      provider: "none",
      model: "none",
      streaming: false,
      toolCalling: false,
      latencyMs: 0,
      error: "No LLM API key configured",
    };
  }

  const start = Date.now();
  try {
    await chat(
      [{ role: "user", content: "ping" }],
      { mode: "flash", maxTokens: 16 },
    );
    return {
      ok: true,
      provider,
      model,
      streaming: current.capability.streaming,
      toolCalling: current.capability.toolCalling,
      latencyMs: Date.now() - start,
    };
  } catch (err) {
    return {
      ok: false,
      provider,
      model,
      streaming: current.capability.streaming,
      toolCalling: current.capability.toolCalling,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

