export interface RetryOptions {
  maxRetries?: number;
  delayMs?: number;
  backoffMultiplier?: number;
  shouldRetry?: (error: Error, attempt: number) => boolean;
}

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

const API_BASE: string = import.meta.env.VITE_API_BASE || "http://127.0.0.1:3001";

export async function refreshToken(): Promise<string | null> {
  try {
    const refreshToken = localStorage.getItem("pg_refresh_token");
    if (!refreshToken) return null;

    const response = await fetch(`${API_BASE}/api/auth/refresh`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });

    if (response.ok) {
      const data = (await response.json()) as { accessToken: string };
      localStorage.setItem("pg_token", data.accessToken);
      return data.accessToken;
    }
  } catch {
    // Refresh failed, user needs to re-login
  }
  return null;
}
