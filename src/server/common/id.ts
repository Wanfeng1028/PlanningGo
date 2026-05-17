export function createTraceId() {
  return `trace_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createIdempotencyKey(parts: Array<string | number | undefined | null>) {
  return parts.filter((item) => item !== undefined && item !== null).join(":");
}
