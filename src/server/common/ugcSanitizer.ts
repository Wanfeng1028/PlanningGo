/**
 * UGC (User-Generated Content) 内容安全与质量校验
 *
 * 用于 share room title/member 等用户输入内容的校验：
 * - 长度限制
 * - XSS 模式检测（基础）
 * - HTML 标签清理（使用内置白名单，不依赖外部库）
 *
 * OWASP API Security 2023: Server-Side Template Injection, XSS
 */

// ============================================================================
// XSS 基础模式检测
// ============================================================================

/** 基础 XSS 模式检测 — 不依赖外部库 */
const XSS_PATTERNS = [
  /<\s*script[\s>]/i,
  /<\s*img[^>]+on\w+\s*=/i,
  /<\s*svg[^>]+on\w+\s*=/i,
  /javascript\s*:/i,
  /on\w+\s*=\s*["']?[^"'>]*\(/i,
  /<\s*iframe/i,
  /<\s*object/i,
  /<\s*embed/i,
];

function hasXssPattern(text: string): boolean {
  return XSS_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * 简易 HTML 清理 — 只保留安全的文本内容
 * 不使用 jsdom，仅做基础清理
 */
function sanitizeHtml(input: string): string {
  // 移除 script/style 标签内容
  let cleaned = input.replace(/<\s*script[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi, "");
  cleaned = cleaned.replace(/<\s*style[^>]*>[\s\S]*?<\s*\/\s*style\s*>/gi, "");
  // 移除 on* 事件属性
  cleaned = cleaned.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, "");
  cleaned = cleaned.replace(/\s+on\w+\s*=\s*\S+/gi, "");
  // 移除危险标签
  cleaned = cleaned.replace(/<\s*(script|iframe|object|embed|form|input|textarea|button)[\s>]/gi, "<!-- removed -->");
  // 移除 javascript: 等危险协议
  cleaned = cleaned.replace(/javascript:/gi, "");
  // 返回纯文本（如果包含 HTML 标签则只保留文本）
  return cleaned.replace(/<[^>]*>/g, "");
}

// ============================================================================
// 长度校验
// ============================================================================

const MAX_TITLE_LENGTH = 100;
const MAX_MEMBER_NAME_LENGTH = 50;
const MAX_COMMENT_LENGTH = 500;

function validateLength(value: string, maxLength: number, fieldName: string): string | null {
  if (value.length > maxLength) {
    return `${fieldName} 不能超过 ${maxLength} 个字符`;
  }
  return null;
}

// ============================================================================
// 公开 API
// ============================================================================

/**
 * 校验 share room 输入
 */
export function validateShareInput(input: { title: string; members?: Array<{ name?: string; comment?: string }> }): {
  ok: true;
} | { ok: false; error: string } {
  // 标题校验
  const titleError = validateLength(input.title, MAX_TITLE_LENGTH, "标题");
  if (titleError) return { ok: false, error: titleError };
  if (hasXssPattern(input.title)) return { ok: false, error: "标题包含不允许的内容" };

  // 成员校验
  if (input.members) {
    const memberError = validateMembers(input.members);
    if (memberError) return { ok: false, error: memberError };
  }

  return { ok: true };
}

/**
 * 校验 vote 输入
 */
export function validateVoteInput(input: { comment?: string }): { ok: true } | { ok: false; error: string } {
  if (input.comment !== undefined) {
    const commentError = validateLength(input.comment, MAX_COMMENT_LENGTH, "评论");
    if (commentError) return { ok: false, error: commentError };
    if (hasXssPattern(input.comment)) return { ok: false, error: "评论包含不允许的内容" };
  }
  return { ok: true };
}

/**
 * 校验成员数组
 */
function validateMembers(members?: Array<{ name?: string; comment?: string }>): string | null {
  if (!members) return null;
  for (const member of members) {
    if (member.name) {
      const nameError = validateLength(member.name, MAX_MEMBER_NAME_LENGTH, "成员名称");
      if (nameError) return nameError;
      if (hasXssPattern(member.name)) return "成员名称包含不允许的内容";
    }
    if (member.comment) {
      const commentError = validateLength(member.comment, MAX_COMMENT_LENGTH, "评论");
      if (commentError) return commentError;
      if (hasXssPattern(member.comment)) return "评论包含不允许的内容";
    }
  }
  return null;
}

/**
 * 清理 share room 输出中的 HTML（返回给前端时）
 */
export function cleanShareOutput(title: string, members?: Array<{ name?: string; comment?: string }>): {
  title: string;
  members?: Array<{ name: string; comment: string }>;
} {
  return {
    title: sanitizeHtml(title),
    members: members?.map((m) => ({
      name: sanitizeHtml(m.name ?? ""),
      comment: sanitizeHtml(m.comment ?? ""),
    })),
  };
}

// ============================================================================
// Sanitize helpers for route handlers
// ============================================================================

export function sanitizeShareTitle(title: string): string {
  return title.slice(0, MAX_TITLE_LENGTH);
}

export function sanitizeMemberName(name: string): string {
  return name.slice(0, MAX_MEMBER_NAME_LENGTH);
}

export function sanitizeComment(comment: string): string {
  return comment.slice(0, MAX_COMMENT_LENGTH);
}

export function sanitizeHtmlForRender(value: string): string {
  return value.replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
