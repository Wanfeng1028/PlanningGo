/**
 * Qwen LLM Provider — 使用 OpenAI 兼容 API
 */

import type { LlmProvider, LlmQuery, LlmResult } from "./types.js";

interface QwenProviderOptions {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
}

export class QwenLlmProvider implements LlmProvider {
  constructor(private readonly options: QwenProviderOptions) {}

  async chat(query: LlmQuery): Promise<LlmResult> {
    const model = query.model ?? this.options.model;
    const maxTokens = query.maxTokens ?? 2048;
    const temperature = query.temperature ?? 0.7;

    const res = await fetch(
      `${this.options.baseUrl}/chat/completions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.options.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: query.messages,
          temperature,
          max_tokens: maxTokens,
        }),
        signal: AbortSignal.timeout(this.options.timeoutMs),
      },
    );

    if (!res.ok) {
      throw new Error(`LLM_CHAT_FAILED_${res.status}`);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      model?: string;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    };

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("LLM_CHAT_EMPTY_RESPONSE");
    }

    return {
      content,
      model: data.model ?? model,
      usage: {
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
        totalTokens: data.usage?.total_tokens ?? 0,
      },
      latencyMs: 0,
    };
  }
}
