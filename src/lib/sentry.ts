/**
 * Sentry Error Tracking Integration
 * 
 * 安装方法：pnpm add @sentry/react
 * 
 * 环境变量：
 *   VITE_SENTRY_DSN - Sentry DSN
 *   SENTRY_ENVIRONMENT - 环境名称（production/staging/development）
 */

async function loadSentry(): Promise<unknown> {
  const specifier = "@sentry/react";
  return new Function("s", "return import(s);")(specifier);
}

type SentryModule = {
  init?: (options: Record<string, unknown>) => void;
  browserTracingIntegration?: () => unknown;
  replayIntegration?: (options?: { maskAllText?: boolean; blockAllMedia?: boolean }) => unknown;
  replayIntegration2?: () => { maskAllText: boolean; blockAllMedia: boolean };
  withScope?: (fn: (scope: SentryScope) => void) => void;
  captureException?: (err: Error) => void;
};

type SentryEvent = {
  exception?: {
    values?: Array<{ type?: string }>;
  };
};

type SentryScope = {
  setExtra: (key: string, value: unknown) => void;
};

export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) {
    console.info("[Sentry] DSN not configured, error tracking disabled");
    return;
  }

  loadSentry().then((module: unknown) => {
    const Sentry = module as SentryModule;
    Sentry.init?.({
      dsn,
      environment: import.meta.env.SENTRY_ENVIRONMENT || import.meta.env.MODE,
      integrations: [
        (Sentry.browserTracingIntegration as (() => unknown) | undefined)?.(),
        (Sentry.replayIntegration as ((options?: { maskAllText?: boolean; blockAllMedia?: boolean }) => unknown) | undefined)?.({ maskAllText: true, blockAllMedia: true }),
      ].filter(Boolean),
      tracesSampleRate: import.meta.env.MODE === "production" ? 0.1 : 1.0,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 1.0,
      beforeSend(event: SentryEvent) {
        if (event?.exception?.values?.[0]?.type === "ChunkLoadError") return null;
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

  loadSentry().then((module: unknown) => {
    const Sentry = module as SentryModule;
    (Sentry.withScope as ((fn: (scope: SentryScope) => void) => void))((scope: SentryScope) => {
      if (context) {
        for (const [key, value] of Object.entries(context)) {
          scope.setExtra(key, value);
        }
      }
      (Sentry.captureException as ((err: Error) => void))(error);
    });
  }).catch(() => {});
}
