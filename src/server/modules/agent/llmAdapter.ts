/**
 * llmAdapter.ts — 非 OpenAI 协议 LLM Adapter
 *
 * 为不支持 OpenAI 协议的 LLM 提供统一适配层。
 * 当前支持：Claude (Anthropic)、Grok (xAI)
 *
 * 注意：Gemini 已支持 OpenAI 兼容入口，无需 adapter。
 */

import { env } from "../../config/env.js";

// ─── Types ──────────────────────────────────────────────────

export interface LlmMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
}

export interface LlmTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface LlmStreamChunk {
  content?: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: string;
  }>;
  finishReason?: string;
}

export interface LlmAdapter {
  name: string;
  isConfigured(): boolean;
  chatStream(
    messages: LlmMessage[],
    options?: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
      tools?: LlmTool[];
    }
  ): Promise<{
    stream: AsyncIterable<LlmStreamChunk>;
    model: string;
    abort: () => void;
  }>;
}

// ─── Claude (Anthropic) Adapter ─────────────────────────────

export class ClaudeAdapter implements LlmAdapter {
  name = "claude";

  isConfigured(): boolean {
    return Boolean(env.CLAUDE_API_KEY);
  }

  async chatStream(
    messages: LlmMessage[],
    options?: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
      tools?: LlmTool[];
    }
  ) {
    const apiKey = env.CLAUDE_API_KEY;
    if (!apiKey) throw new Error("Claude API key not configured");

    const model = options?.model ?? env.CLAUDE_MODEL ?? "claude-sonnet-4-20250514";
    const baseURL = env.CLAUDE_BASE_URL ?? "https://api.anthropic.com";

    // Convert OpenAI format to Anthropic format
    const systemMsg = messages.find((m) => m.role === "system")?.content ?? "";
    const conversationMessages = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "tool" ? "user" : m.role,
        content: m.role === "tool" ? `[Tool Result ${m.tool_call_id}]: ${m.content}` : m.content,
      }));

    // Convert tools to Anthropic format
    const anthropicTools = options?.tools?.map((t) => ({
      name: t.function.name,
      description: t.function.description,
      input_schema: t.function.parameters,
    }));

    const controller = new AbortController();

    const response = await fetch(`${baseURL}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: options?.maxTokens ?? 4096,
        temperature: options?.temperature ?? 0.7,
        system: systemMsg,
        messages: conversationMessages,
        stream: true,
        ...(anthropicTools && anthropicTools.length > 0 ? { tools: anthropicTools } : {}),
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Claude API error: ${response.status} - ${error}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();

    async function* streamGenerator(): AsyncIterable<LlmStreamChunk> {
      const buffer = "";
      while (true) {
        const { done, value } = await reader!.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        const lines = text.split("\n").filter((l) => l.startsWith("data: "));

        for (const line of lines) {
          const data = line.slice(6);
          if (data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data);

            if (parsed.type === "content_block_delta") {
              if (parsed.delta?.type === "text_delta") {
                yield { content: parsed.delta.text };
              } else if (parsed.delta?.type === "input_json_delta") {
                // Tool use input streaming
                yield {
                  toolCalls: [{
                    id: parsed.content_block?.id ?? "",
                    name: parsed.content_block?.name ?? "",
                    arguments: parsed.delta.partial_json ?? "",
                  }],
                };
              }
            } else if (parsed.type === "message_stop") {
              yield { finishReason: "stop" };
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }
    }

    return {
      stream: streamGenerator(),
      model,
      abort: () => controller.abort(),
    };
  }
}

// ─── Grok (xAI) Adapter ─────────────────────────────────────

export class GrokAdapter implements LlmAdapter {
  name = "grok";

  isConfigured(): boolean {
    return Boolean(env.GROK_API_KEY);
  }

  async chatStream(
    messages: LlmMessage[],
    options?: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
      tools?: LlmTool[];
    }
  ) {
    const apiKey = env.GROK_API_KEY;
    if (!apiKey) throw new Error("Grok API key not configured");

    const model = options?.model ?? env.GROK_MODEL ?? "grok-3";
    const baseURL = env.GROK_BASE_URL ?? "https://api.x.ai";

    const controller = new AbortController();

    // Grok uses OpenAI-compatible API
    const response = await fetch(`${baseURL}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: options?.maxTokens ?? 4096,
        temperature: options?.temperature ?? 0.7,
        stream: true,
        ...(options?.tools && options.tools.length > 0 ? { tools: options.tools } : {}),
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Grok API error: ${response.status} - ${error}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();

    async function* streamGenerator(): AsyncIterable<LlmStreamChunk> {
      while (true) {
        const { done, value } = await reader!.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        const lines = text.split("\n").filter((l) => l.startsWith("data: "));

        for (const line of lines) {
          const data = line.slice(6);
          if (data === "[DONE]") {
            yield { finishReason: "stop" };
            continue;
          }

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta;

            if (delta?.content) {
              yield { content: delta.content };
            }

            if (delta?.tool_calls) {
              yield {
                toolCalls: delta.tool_calls.map((tc: any) => ({
                  id: tc.id ?? "",
                  name: tc.function?.name ?? "",
                  arguments: tc.function?.arguments ?? "",
                })),
              };
            }

            if (parsed.choices?.[0]?.finish_reason) {
              yield { finishReason: parsed.choices[0].finish_reason };
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }
    }

    return {
      stream: streamGenerator(),
      model,
      abort: () => controller.abort(),
    };
  }
}

// ─── Adapter Registry ───────────────────────────────────────

const adapters: LlmAdapter[] = [new ClaudeAdapter(), new GrokAdapter()];

export function getAvailableAdapters(): LlmAdapter[] {
  return adapters.filter((a) => a.isConfigured());
}

export function getAdapterByName(name: string): LlmAdapter | undefined {
  return adapters.find((a) => a.name === name);
}
