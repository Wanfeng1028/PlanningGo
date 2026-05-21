import type { PlanningRequestInput } from "./api";

const API_BASE: string = import.meta.env.VITE_API_BASE || "http://127.0.0.1:3001";

let _authToken: string | null = localStorage.getItem("pg_token");

export function setAuthToken(token: string | null) {
  _authToken = token;
  if (token) localStorage.setItem("pg_token", token);
  else localStorage.removeItem("pg_token");
}

export interface StreamOptions {
  onChunk?: (chunk: string) => void;
  onError?: (error: Error) => void;
  onComplete?: () => void;
  signal?: AbortSignal;
}

export async function streamFetch(
  url: string,
  options: RequestInit & StreamOptions
): Promise<void> {
  const { onChunk, onError, onComplete, signal, ...fetchOptions } = options;

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("Response body is not readable");

    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE format line by line
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") {
              onComplete?.();
              return;
            }
            try {
              const parsed = JSON.parse(data);
              onChunk?.(parsed.content || "");
            } catch {
              // Ignore parse errors
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  } catch (error) {
    onError?.(error instanceof Error ? error : new Error(String(error)));
  }
}

export async function streamPlanningRequest(
  input: PlanningRequestInput,
  options: StreamOptions
): Promise<void> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };

  if (_authToken) {
    headers.authorization = `Bearer ${_authToken}`;
  }

  return streamFetch(`${API_BASE}/api/agent/plan/stream`, {
    ...options,
    method: "POST",
    headers,
    body: JSON.stringify(input),
  });
}
