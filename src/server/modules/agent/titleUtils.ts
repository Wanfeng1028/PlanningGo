/**
 * titleUtils.ts — Shared conversation title update logic
 *
 * Centralizes title update to avoid duplicate DB writes and ensure updatedAt is always synced.
 */

import type { PrismaClient } from "../../../generated/prisma/client.js";
import * as mem from "../../services/memoryStore.js";

interface TitleUpdateLogger {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
}

/**
 * HTML 实体转义 — 防止存储型 XSS
 * 安全修复 (#6): 将 < > & " ' 转义为 HTML 实体，防止恶意脚本注入标题
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Update conversation title, syncing updatedAt.
 * Skips DB write if title hasn't changed.
 *
 * 安全修复 (#6): 存入 DB 前对 title 进行 HTML 实体转义
 * 防止用户 prompt 中的 <script> 等恶意代码被存入 title 字段
 */
export async function updateConversationTitle(
  db: PrismaClient | null | undefined,
  conversationId: string | undefined,
  title: string | null | undefined,
  log?: TitleUpdateLogger,
): Promise<void> {
  const normalizedTitle = title?.trim();
  if (!conversationId || !normalizedTitle) return;

  // 安全修复 (#6): HTML 实体转义，防止 XSS
  const safeTitle = escapeHtml(normalizedTitle);

  // Check if title actually changed to avoid unnecessary DB writes
  if (db) {
    try {
      const existing = await db.conversation.findUnique({
        where: { id: conversationId },
        select: { title: true },
      });

      if (!existing) return;
      if (existing.title === safeTitle) return;

      await db.conversation.update({
        where: { id: conversationId },
        data: {
          title: safeTitle,
          updatedAt: new Date(),
        },
      });
      log?.info({ conversationId, oldTitle: existing.title, newTitle: safeTitle }, "[titleUtils] title updated");
    } catch (err) {
      log?.warn({ err, conversationId }, "[titleUtils] title update failed");
    }
  }

  // Always sync memory store (also escaped)
  mem.updateConversationTitle(conversationId, safeTitle);
}
