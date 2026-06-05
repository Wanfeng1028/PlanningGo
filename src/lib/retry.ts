import { API_BASE } from "./config";
import { setAuthToken, setRefreshToken as storeRefreshToken } from "./api";

export interface RetryOptions {
  maxRetries?: number;
  delayMs?: number;
  backoffMultiplier?: number;
  shouldRetry?: (error: Error, attempt: number) => boolean;
}

let refreshInFlight: Promise<string | null> | null = null;

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    delayMs = 1000,
    backoffMultiplier = 2,
    shouldRetry = (error) => {
      const msg = error.message;
      return (
        msg.includes("429") || // Rate limit
        msg.includes("503") || // Service unavailable
        msg.includes("Failed to fetch") || // Network error
        msg.includes("NetworkError") // Network error
      );
    },
  } = options;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === maxRetries || !shouldRetry(lastError, attempt)) {
        throw lastError;
      }

      const delay = delayMs * Math.pow(backoffMultiplier, attempt);
      console.log(`[Retry] Attempt ${attempt + 1}/${maxRetries + 1}, waiting ${delay}ms`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

interface RefreshApiResponse {
  ok: boolean;
  data?: {
    accessToken?: string;
    refreshToken?: string;
  };
  accessToken?: string;
  refreshToken?: string;
}

export async function refreshToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = refreshTokenOnce().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

async function refreshTokenOnce(): Promise<string | null> {
  try {
    const currentRefreshToken = localStorage.getItem("pg_refresh_token");
    if (!currentRefreshToken) return null;

    const response = await fetch(`${API_BASE}/api/auth/refresh`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken: currentRefreshToken }),
    });

    if (response.ok) {
      const body = (await response.json()) as RefreshApiResponse;
      // 服务端统一响应格式: { ok: true, data: { accessToken, refreshToken } }
      const accessToken = body.data?.accessToken ?? body.accessToken;
      const newRefreshToken = body.data?.refreshToken ?? body.refreshToken;
      if (!accessToken) return null;
      // Update both module-level _authToken in api.ts AND localStorage
      setAuthToken(accessToken);
      if (newRefreshToken) {
        storeRefreshToken(newRefreshToken);
      }
      return accessToken;
    }
  } catch {
    // Refresh failed, user needs to re-login
  }
  return null;
}
