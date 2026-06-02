/**
 * Sentry Error Tracking Integration
 * 
 * 安装方法：pnpm add @sentry/react
 * 
 * 环境变量：
 *   VITE_SENTRY_DSN - Sentry DSN
 *   SENTRY_ENVIRONMENT - 环境名称（production/staging/development）
 */

async function loadSentry(): Promise<any> {
  const specifier = "@sentry/react";
  return new Function("s", "return import(s);")(specifier);
}

export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) {
    console.info("[Sentry] DSN not configured, error tracking disabled");
    return;
  }

  loadSentry().then((Sentry: any) => {
    Sentry.init({
      dsn,
      environment: import.meta.env.SENTRY_ENVIRONMENT || import.meta.env.MODE,
      integrations: [
        Sentry.browserTracingIntegration?.(),
        Sentry.replayIntegration?.({ maskAllText: true, blockAllMedia: true }),
      ].filter(Boolean),
      tracesSampleRate: import.meta.env.MODE === "production" ? 0.1 : 1.0,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 1.0,
      beforeSend(event: any) {
        if (event.exception?.values?.[0]?.type === "ChunkLoadError") return null;
        return event;
      },
    });
    console.info("[Sentry] Initialized");
  }).catch((err: unknown) => {
    console.warn("[Sentry] @sentry/react not installed:", err);
  });
}

export function captureError(error: Error, context?: Record<string, unknown>) {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;

  loadSentry().then((Sentry: any) => {
    Sentry.withScope((scope: any) => {
      if (context) {
        for (const [key, value] of Object.entries(context)) {
          scope.setExtra(key, value);
        }
      }
      Sentry.captureException(error);
    });
  }).catch(() => {});
}
