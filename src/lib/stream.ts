import type { PlanningRequestInput, PlanningResult } from "./api";
import { getAuthToken, setAuthToken } from "./api";
import { refreshToken } from "./retry";
import { API_BASE } from "./config";

export interface StreamOptions {
  onChunk?: (chunk: string) => void;
  onFinalResult?: (result: PlanningResult) => void;
  onAgentEvent?: (event: unknown) => void;
  onError?: (error: Error) => void;
  onComplete?: () => void;
  signal?: AbortSignal;
}

export async function streamFetch(
  url: string,
  options: RequestInit & StreamOptions
): Promise<void> {
  const { onChunk, onFinalResult, onAgentEvent, onError, onComplete, signal, ...fetchOptions } = options;

  try {
    let response = await fetch(url, {
      ...fetchOptions,
      signal,
    });

    // Handle 401: refresh token and retry once
    if (response.status === 401) {
      const newToken = await refreshToken().catch(() => null);
      if (newToken) {
        // refreshToken() already called setAuthToken() internally
        // Retry with refreshed token
        const retryHeaders: Record<string, string> = {
          ...(fetchOptions.headers as Record<string, string> ?? {}),
          authorization: `Bearer ${newToken}`,
        };
        response = await fetch(url, {
          ...fetchOptions,
          headers: retryHeaders,
          signal,
        });
      } else {
        // Refresh failed — clear stale token and signal auth error
        setAuthToken(null);
        throw new Error("登录已过期，请重新登录");
      }
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    // Proactively refresh token if optionalAuthGuard signalled expiration
    if (response.headers.get("x-token-expired") === "1") {
      refreshToken().then((t) => { if (t) setAuthToken(t); }).catch(() => {});
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("Response body is not readable");

    const decoder = new TextDecoder();
    let buffer = "";
    let completed = false;

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
              completed = true;
              onComplete?.();
              return;
            }
            if (data.startsWith("[FINAL_RESULT]")) {
              try {
                const result = JSON.parse(data.slice("[FINAL_RESULT]".length)) as PlanningResult;
                onFinalResult?.(result);
              } catch {
                // Ignore parse errors
              }
              continue;
            }
            try {
              const parsed = JSON.parse(data) as { content?: string; error?: string; done?: boolean; result?: PlanningResult; type?: string; event?: unknown };
              if (typeof parsed.error === "string") {
                throw new Error(parsed.error);
              }
              if (parsed.type === "agent_event" && parsed.event) {
                onAgentEvent?.(parsed.event);
                continue;
              }
              if (typeof parsed.content === "string") {
                onChunk?.(parsed.content);
                continue;
              }
              if (parsed.done === true && parsed.result) {
                onFinalResult?.(parsed.result as PlanningResult);
                continue;
              }
            } catch (parseError) {
              if (parseError instanceof Error && parseError.name !== "SyntaxError") {
                throw parseError;
              }
              // Ignore non-JSON chunks
            }
          }
        }
      }
      if (!completed) {
        onComplete?.();
      }
    } finally {
      reader.releaseLock();
    }
  } catch (error) {
    const streamError = error instanceof Error ? error : new Error(String(error));
    if (onError) {
      onError(streamError);
      return;
    }
    throw streamError;
  }
}

export async function streamPlanningRequest(
  input: PlanningRequestInput,
  options: StreamOptions
): Promise<void> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };

  let token = getAuthToken();
  if (!token) {
    const refreshed = await refreshToken().catch(() => null);
    if (refreshed) {
      setAuthToken(refreshed);
      token = refreshed;
    }
  }
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }

  return streamFetch(`${API_BASE}/api/agent/plan/stream`, {
    ...options,
    method: "POST",
    headers,
    body: JSON.stringify(input),
    credentials: "include",
  });
}
// ─── Agent Chat Stream (new chat router) ────────────────────

export interface AgentStreamOptions {
  onChunk?: (chunk: string) => void;
  onFinalResult?: (result: unknown) => void;
  onAgentEvent?: (event: unknown) => void;
  onError?: (error: Error) => void;
  onComplete?: () => void;
  signal?: AbortSignal;
}

export async function streamAgentMessage(
  input: {
    message: string;
    city?: string;
    modelMode?: string;
    conversationId?: string;
    selectedOptionId?: string;
  },
  options: AgentStreamOptions,
): Promise<void> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };

  let token = getAuthToken();
  // Proactive token refresh if token might be expired
  if (!token) {
    const refreshed = await refreshToken().catch(() => null);
    if (refreshed) {
      setAuthToken(refreshed);
      token = refreshed;
    }
  }
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }

  console.info("[stream] streamAgentMessage", {
    hasToken: Boolean(token),
    conversationId: input.conversationId ?? null,
    messagePreview: input.message.slice(0, 60),
  });

  // Reuse streamFetch but with generic onFinalResult
  const { onFinalResult, ...restOptions } = options;

  return streamFetch(`${API_BASE}/api/agent/chat/stream`, {
    ...restOptions,
    onFinalResult: onFinalResult as StreamOptions["onFinalResult"],
    method: "POST",
    headers,
    body: JSON.stringify(input),
    credentials: "include",
  });
}