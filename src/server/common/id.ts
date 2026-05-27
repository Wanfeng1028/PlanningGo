import { randomBytes } from "node:crypto";

export function createTraceId() {
  return `trace_${Date.now()}_${randomBytes(8).toString("hex")}`;
}

export function createId(prefix: string) {
  return `${prefix}_${Date.now()}_${randomBytes(8).toString("hex")}`;
}

export function createIdempotencyKey(parts: Array<string | number | undefined | null>) {
  return parts.filter((item) => item !== undefined && item !== null).join(":");
}
