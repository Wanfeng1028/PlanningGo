/**
 * Add trace ID to tool call context
 */
export function addTraceToContext<T extends { traceId?: string }>(
  ctx: T,
  traceId: string,
): T & { traceId: string } {
  return {
    ...ctx,
    traceId,
  };
}

/**
 * Extract trace ID from context
 */
export function extractTraceId<T extends { traceId?: string }>(ctx: T): string {
  return ctx.traceId || "unknown";
}

/**
 * Create a trace ID
 */
export function createTraceId(): string {
  return `trace_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
