/**
 * OpenAICompatibleLlmProvider — 通用 OpenAI 兼容 LLM Provider
 *
 * 适用于所有提供 OpenAI 兼容 /chat/completions 接口的服务：
 * MiMo、Qwen、DeepSeek、Moonshot、Groq、Gemini、Doubao、LongCat 等。
 */

import type { LlmProvider, LlmQuery, LlmResult } from "./types.js";

export interface OpenAICompatibleProviderOptions {
  provider: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
}

export class OpenAICompatibleLlmProvider implements LlmProvider {
  private readonly provider: string;

  constructor(private readonly options: OpenAICompatibleProviderOptions) {
    this.provider = options.provider;
  }

  async chat(query: LlmQuery): Promise<LlmResult> {
    const model = query.model ?? this.options.model;
    const maxTokens = query.maxTokens ?? 2048;
    const temperature = query.temperature ?? 0.7;
    const start = Date.now();

    const res = await fetch(
      this.options.baseUrl.replace(/\/+$/, '') + '/chat/completions',
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + this.options.apiKey,
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
      const latencyMs = Date.now() - start;
      throw new Error(
        "LLM_CHAT_FAILED_" + res.status +
        " provider=" + this.provider +
        " model=" + model +
        " (latency=" + latencyMs + "ms)",
      );
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      model?: string;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    };

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("LLM_CHAT_EMPTY_RESPONSE provider=" + this.provider + " model=" + model);
    }

    return {
      content,
      model: data.model ?? model,
      usage: {
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
        totalTokens: data.usage?.total_tokens ?? 0,
      },
      latencyMs: Date.now() - start,
    };
  }
}
