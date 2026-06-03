/**
 * SSRF 防护工具
 *
 * 用于校验 webhook URL、sandbox endpoint 等用户可控的 URL，
 * 防止访问内网地址、metadata IP、localhost 等。
 *
 * OWASP SSRF Cheat Sheet: 用户可控 URL 是 SSRF 高风险场景
 */

import { lookup } from "node:dns";
import { promisify } from "node:util";

const dnsLookupAsync = promisify(lookup);

// ============================================================================
// 禁止访问的 IP 段
// ============================================================================

/**
 * 检查 IP 是否属于禁止访问的范围
 * 包括：localhost、内网 IP、link-local、metadata IP、保留地址
 */
function isForbiddenIp(ip: string): boolean {
  // localhost
  if (ip === "127.0.0.1" || ip === "::1" || ip === "localhost") return true;

  // 127.0.0.0/8
  if (ip.startsWith("127.")) return true;

  // 10.0.0.0/8
  if (ip.startsWith("10.")) return true;

  // 172.16.0.0/12
  if (/^172\.(1[6-9]|2[0-9]|3[01])\./.test(ip)) return true;

  // 192.168.0.0/16
  if (ip.startsWith("192.168.")) return true;

  // 169.254.0.0/16 (link-local)
  if (ip.startsWith("169.254.")) return true;

  // 0.0.0.0
  if (ip === "0.0.0.0" || ip === "0.0.0.0.0") return true;

  // AWS/GCP/Azure metadata IPs
  if (ip === "169.254.169.254" || ip === "100.100.100.200" || ip === "100.96.128.10") return true;

  // Docker 内网
  if (ip.startsWith("172.17.")) return true;

  // IPv6 私有地址
  if (ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe80")) return true;

  return false;
}

// ============================================================================
// URL 校验
// ============================================================================

/**
 * 校验 webhook URL 是否安全
 * 返回 { ok: true, url: URL } 或 { ok: false, reason: string }
 */
export function validateWebhookUrl(rawUrl: string): { ok: true; url: URL } | { ok: false; reason: string } {
  // 只允许 https
  if (!rawUrl.startsWith("https://")) {
    return { ok: false, reason: "Webhook URL 必须使用 https 协议" };
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "Webhook URL 格式无效" };
  }

  // 禁止非标准端口（可选，根据需求调整）
  if (parsed.port && parsed.port !== "443") {
    return { ok: false, reason: "Webhook 只允许 443 端口" };
  }

  // 禁止 file://, data://, javascript:// 等危险协议
  const protocol = parsed.protocol.toLowerCase();
  if (!["https:"].includes(protocol)) {
    return { ok: false, reason: `Webhook 协议 ${protocol} 不被允许` };
  }

  // 禁止 IP 地址（包括域名解析后的 IP）
  if (!isForbiddenIp(parsed.hostname) === false && isForbiddenIp(parsed.hostname)) {
    return { ok: false, reason: "Webhook 不允许指向内网或本地地址" };
  }

  // 禁止纯域名形式的 localhost 变体
  const hostname = parsed.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".local")) {
    return { ok: false, reason: "Webhook 不允许指向本地地址" };
  }

  return { ok: true, url: parsed };
}

/**
 * 异步校验：DNS 解析后再次检查 IP
 */
export async function validateWebhookUrlWithDns(rawUrl: string): Promise<
  { ok: true; url: URL } | { ok: false; reason: string }
> {
  const syncResult = validateWebhookUrl(rawUrl);
  if (!syncResult.ok) return syncResult;

  try {
    const lookup = await dnsLookupAsync(syncResult.url.hostname);
    if (isForbiddenIp(lookup.address)) {
      return { ok: false, reason: "Webhook 目标 IP 解析到内网或本地地址" };
    }
  } catch {
    // DNS 解析失败，允许（可能是临时问题，webhook 发送时会再次校验）
  }

  return syncResult;
}

/**
 * 校验 sandbox endpoint 是否在白名单内
 */
export function validateSandboxEndpoint(endpoint: string, allowedSet: Set<string>): {
  ok: true;
} | { ok: false; reason: string } {
  if (!allowedSet.has(endpoint)) {
    return { ok: false, reason: `不允许访问端点 ${endpoint}，仅支持白名单内的端点` };
  }

  // 额外检查：禁止路径遍历
  if (endpoint.includes("..") || endpoint.includes("//")) {
    return { ok: false, reason: "端点包含非法路径" };
  }

  return { ok: true };
}

/**
 * 校验 IP 是否禁止访问（导出供其他模块复用）
 */
export { isForbiddenIp };
