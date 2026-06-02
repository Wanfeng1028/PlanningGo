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
 * Update conversation title, syncing updatedAt.
 * Skips DB write if title hasn't changed.
 */
export async function updateConversationTitle(
  db: PrismaClient | null | undefined,
  conversationId: string | undefined,
  title: string | null | undefined,
  log?: TitleUpdateLogger,
): Promise<void> {
  const normalizedTitle = title?.trim();
  if (!conversationId || !normalizedTitle) return;

  // Check if title actually changed to avoid unnecessary DB writes
  if (db) {
    try {
      const existing = await db.conversation.findUnique({
        where: { id: conversationId },
        select: { title: true },
      });

      if (!existing) return;
      if (existing.title === normalizedTitle) return;

      await db.conversation.update({
        where: { id: conversationId },
        data: {
          title: normalizedTitle,
          updatedAt: new Date(),
        },
      });
      log?.info({ conversationId, oldTitle: existing.title, newTitle: normalizedTitle }, "[titleUtils] title updated");
    } catch (err) {
      log?.warn({ err, conversationId }, "[titleUtils] title update failed");
    }
  }

  // Always sync memory store
  mem.updateConversationTitle(conversationId, normalizedTitle);
}
