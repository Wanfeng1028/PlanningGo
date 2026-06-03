/**
 * 日志脱敏工具
 *
 * 所有写入数据库的日志、事件、tool call 数据在落库前必须经过脱敏。
 * 防止 token、key、密码、定位等敏感数据明文存储。
 *
 * OWASP Logging Cheat Sheet: 应用日志应避免敏感数据泄漏
 */

// ============================================================================
// 敏感字段名（不区分大小写匹配）
// ============================================================================

const SENSITIVE_KEYS = new Set([
  "password",
  "passwd",
  "token",
  "accessToken",
  "access_token",
  "refreshToken",
  "refresh_token",
  "authorization",
  "apiKey",
  "api_key",
  "apikey",
  "secret",
  "cookie",
  "cookies",
  "keyHash",
  "key_hash",
  "keyHash",
  "session",
  "sessionToken",
  "session_token",
]);

// ============================================================================
// 脱敏配置
// ============================================================================

const MAX_PROMPT_LENGTH = 500;
const MAX_STACK_LENGTH = 1000;
const LNG_PRECISION = 2;

// ============================================================================
// 核心脱敏函数
// ============================================================================

/**
 * 递归脱敏对象中的敏感字段
 */
export function sanitizeForLog(obj: unknown, depth = 0): unknown {
  if (depth > 10) return "[max depth exceeded]";

  if (obj == null) return obj;

  // 基本类型
  if (typeof obj === "string") {
    return truncateString(obj, MAX_PROMPT_LENGTH);
  }

  if (typeof obj !== "object") return obj;

  // 数组
  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeForLog(item, depth + 1));
  }

  // 普通对象
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase();

    // 匹配敏感字段名
    if (SENSITIVE_KEYS.has(lowerKey)) {
      result[key] = "***REDACTED***";
      continue;
    }

    // 特殊处理：email 脱敏
    if (isEmailField(lowerKey) && typeof value === "string") {
      result[key] = maskEmail(value);
      continue;
    }

    // 特殊处理：lat/lng 降精度
    if (isLatLngField(lowerKey) && typeof value === "number") {
      result[key] = Math.round(value * Math.pow(10, LNG_PRECISION)) / Math.pow(10, LNG_PRECISION);
      continue;
    }

    // 特殊处理：stack 在生产环境截断
    if (lowerKey === "stack" && typeof value === "string") {
      result[key] = truncateString(value, MAX_STACK_LENGTH);
      continue;
    }

    // 递归处理嵌套对象
    result[key] = sanitizeForLog(value, depth + 1);
  }

  return result;
}

// ============================================================================
// 辅助函数
// ============================================================================

function isEmailField(key: string): boolean {
  return key.endsWith("email") || key === "mail" || key === "userEmail";
}

function isLatLngField(key: string): boolean {
  return key === "lat" || key === "lng" || key === "latitude" || key === "longitude"
    || key === "latitud" || key === "longitud" || key.endsWith("_lat") || key.endsWith("_lng");
}

function truncateString(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + "...[truncated]";
}

function maskEmail(email: string): string {
  const atIdx = email.lastIndexOf("@");
  if (atIdx <= 1) return email;
  const local = email.slice(0, atIdx);
  const domain = email.slice(atIdx);
  if (local.length <= 2) return local + "***" + domain;
  return local.slice(0, 2) + "***" + domain;
}

// ============================================================================
// 便捷函数
// ============================================================================

/**
 * 脱敏 tool call input/output
 */
export function sanitizeToolCallInput(input: unknown): unknown {
  return sanitizeForLog(input);
}

/**
 * 脱敏 tool call output
 */
export function sanitizeToolCallOutput(output: unknown): unknown {
  return sanitizeForLog(output);
}

/**
 * 脱敏 event payload
 */
export function sanitizeEventPayload(payload: unknown): unknown {
  return sanitizeForLog(payload);
}

/**
 * 脱敏 error log payload
 */
export function sanitizeErrorPayload(payload: unknown): unknown {
  return sanitizeForLog(payload);
}

/**
 * 脱敏 request log preview
 */
export function sanitizeRequestPreview(obj: unknown): unknown {
  return sanitizeForLog(obj);
}

/**
 * 脱敏 response log preview
 */
export function sanitizeResponsePreview(obj: unknown): unknown {
  return sanitizeForLog(obj);
}

/**
 * 脱敏 handoff code（从日志中移除）
 */
export function sanitizeHandoffCode(code: string): string {
  // 只保留前 2 位，其余用 * 替换
  if (code.length <= 2) return "***";
  return code.slice(0, 2) + "*".repeat(code.length - 2);
}

/**
 * 判断是否在生产环境（production 不保存完整 stack）
 */
export function shouldStripStack(): boolean {
  return process.env.NODE_ENV === "production";
}
