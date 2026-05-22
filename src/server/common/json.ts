/**
 * JSON parsing utilities for handling Prisma JsonValue and other unknown data
 */

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function toRecordOrEmpty(value: unknown): Record<string, unknown> {
  return isPlainObject(value) ? value : {};
}

export function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  if (typeof value === "string") {
    return [value];
  }
  return [];
}

export function nullToUndefined<T>(value: T | null): T | undefined {
  return value === null ? undefined : value;
}
