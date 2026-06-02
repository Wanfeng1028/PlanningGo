#!/usr/bin/env node
/**
 * debug-conversations.mjs — Debug script for inspecting conversation data
 *
 * Usage:
 *   node scripts/debug-conversations.mjs [baseUrl]
 *
 * Connects directly to PostgreSQL via pg (no Prisma client needed)
 * and prints a comprehensive overview of users, conversations, and messages.
 */

import pg from "pg";
const { Client } = pg;

// ── Optional baseUrl argument (not used for DB, just for consistency) ──
const baseUrl = process.argv[2] || "http://localhost:3000";

// ── Database connection ──
const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://planninggo:planninggo@localhost:5432/planninggo?schema=public";

const client = new Client({ connectionString: DATABASE_URL });

function truncate(str, len = 60) {
  if (!str) return "";
  const oneLine = str.replace(/\n/g, " ").replace(/\s+/g, " ").trim();
  return oneLine.length > len ? oneLine.slice(0, len) + "..." : oneLine;
}

try {
  await client.connect();
  console.log("Connected to database\n");
  console.log(`  DATABASE_URL: ${DATABASE_URL.replace(/\/\/.*@/, "//<credentials>@")}`);
  console.log(`  baseUrl (unused): ${baseUrl}\n`);

  // ── 1. All users ──
  console.log("=".repeat(80));
  console.log("👥  USERS");
  console.log("=".repeat(80));
  const usersRes = await client.query(
    `SELECT id, email, display_name, mode FROM users ORDER BY created_at ASC`,
  );
  if (usersRes.rows.length === 0) {
    console.log("  (no users found)\n");
  } else {
    for (const u of usersRes.rows) {
      console.log(`  ${u.id}  |  ${u.email.padEnd(30)}  |  ${(u.display_name || "").padEnd(15)}  |  mode=${u.mode}`);
    }
    console.log(`\n  Total: ${usersRes.rows.length} user(s)\n`);
  }

  // ── 2. Conversations grouped by userId count ──
  console.log("=".repeat(80));
  console.log("📊  CONVERSATIONS GROUPED BY userId");
  console.log("=".repeat(80));
  const convByUserRes = await client.query(
    `SELECT
       u.id AS user_id,
       u.email,
       u.display_name,
       COUNT(c.id) AS conversation_count
     FROM users u
     LEFT JOIN conversations c ON c.user_id = u.id
     GROUP BY u.id, u.email, u.display_name
     ORDER BY conversation_count DESC`,
  );
  for (const row of convByUserRes.rows) {
    console.log(`  ${(row.display_name || "").padEnd(15)}  ${row.email.padEnd(30)}  =>  ${row.conversation_count} conversation(s)`);
  }

  // Also count null/guest conversations
  const nullUserRes = await client.query(
    `SELECT COUNT(*) AS cnt FROM conversations WHERE user_id IS NULL`,
  );
  const guestConvRes = await client.query(
    `SELECT COUNT(*) AS cnt FROM conversations WHERE user_id IS NULL AND guest_id IS NOT NULL`,
  );
  console.log(`\n  Conversations with NULL userId:   ${nullUserRes.rows[0].cnt}`);
  console.log(`    (of which guest-owned):         ${guestConvRes.rows[0].cnt}`);
  console.log(`    (fully anonymous):              ${parseInt(nullUserRes.rows[0].cnt, 10) - parseInt(guestConvRes.rows[0].cnt, 10)}\n`);

  // ── 3. Messages count by conversation's userId ──
  console.log("=".repeat(80));
  console.log("💬  MESSAGES COUNT BY CONVERSATION's userId");
  console.log("=".repeat(80));
  const msgByUserRes = await client.query(
    `SELECT
       c.user_id,
       u.email,
       u.display_name,
       COUNT(m.id) AS message_count
     FROM messages m
     JOIN conversations c ON c.id = m.conversation_id
     LEFT JOIN users u ON u.id = c.user_id
     GROUP BY c.user_id, u.email, u.display_name
     ORDER BY message_count DESC`,
  );
  for (const row of msgByUserRes.rows) {
    const label = row.user_id
      ? `${(row.display_name || "").padEnd(15)}  ${row.email.padEnd(30)}`
      : "(null userId)   ".padEnd(48);
    console.log(`  ${label}  =>  ${row.message_count} message(s)`);
  }
  console.log();

  // ── 4. Test account xiaoming@example.com ──
  console.log("=".repeat(80));
  console.log("🔍  TEST ACCOUNT: xiaoming@example.com");
  console.log("=".repeat(80));
  const xiaomingRes = await client.query(
    `SELECT id, email, display_name, mode FROM users WHERE email = 'xiaoming@example.com'`,
  );
  if (xiaomingRes.rows.length === 0) {
    console.log("  (user xiaoming@example.com not found)\n");
  } else {
    const xm = xiaomingRes.rows[0];
    console.log(`  userId:      ${xm.id}`);
    console.log(`  email:       ${xm.email}`);
    console.log(`  displayName: ${xm.display_name}`);
    console.log(`  mode:        ${xm.mode}\n`);

    // ── 5. Conversations owned by this user ──
    console.log("=".repeat(80));
    console.log(`📂  CONVERSATIONS OWNED BY ${xm.display_name} (${xm.email})`);
    console.log("=".repeat(80));
    const xmConvsRes = await client.query(
      `SELECT c.id, c.title, c.city, c.model_mode, c.updated_at,
              COUNT(m.id) AS message_count
       FROM conversations c
       LEFT JOIN messages m ON m.conversation_id = c.id
       WHERE c.user_id = $1
       GROUP BY c.id
       ORDER BY c.updated_at DESC`,
      [xm.id],
    );
    if (xmConvsRes.rows.length === 0) {
      console.log("  (no conversations)\n");
    } else {
      for (const row of xmConvsRes.rows) {
        console.log(
          `  ${row.id.slice(0, 8)}...  |  ${(row.title || "").padEnd(25)}  |  msgs=${String(row.message_count).padStart(3)}  |  city=${row.city.padEnd(6)}  |  updated=${row.updated_at.toISOString().slice(0, 16)}`,
        );
      }
      console.log(`\n  Total: ${xmConvsRes.rows.length} conversation(s)\n`);
    }
  }

  // ── 6. Anonymous / null userId conversation count ──
  console.log("=".repeat(80));
  console.log("👻  ANONYMOUS / NULL userId CONVERSATIONS");
  console.log("=".repeat(80));
  const anonRes = await client.query(
    `SELECT COUNT(*) AS total,
            COUNT(*) FILTER (WHERE guest_id IS NOT NULL) AS guest_owned,
            COUNT(*) FILTER (WHERE guest_id IS NULL) AS fully_anonymous
     FROM conversations
     WHERE user_id IS NULL`,
  );
  const a = anonRes.rows[0];
  console.log(`  Total null-userId conversations:  ${a.total}`);
  console.log(`  Guest-owned:                      ${a.guest_owned}`);
  console.log(`  Fully anonymous (no guest_id):    ${a.fully_anonymous}\n`);

  // ── 7. Orphan messages (messages in conversations with null userId) ──
  console.log("=".repeat(80));
  console.log("🗑️  ORPHAN MESSAGES (conversations with null userId)");
  console.log("=".repeat(80));
  const orphanRes = await client.query(
    `SELECT COUNT(m.id) AS orphan_count
     FROM messages m
     JOIN conversations c ON c.id = m.conversation_id
     WHERE c.user_id IS NULL`,
  );
  console.log(`  Messages in null-userId conversations: ${orphanRes.rows[0].orphan_count}\n`);

  // ── 8. Last 20 conversations ──
  console.log("=".repeat(80));
  console.log("🕐  LAST 20 CONVERSATIONS");
  console.log("=".repeat(80));
  const lastConvsRes = await client.query(
    `SELECT c.id, c.user_id, c.guest_id, c.title, c.updated_at,
            COUNT(m.id) AS message_count
     FROM conversations c
     LEFT JOIN messages m ON m.conversation_id = c.id
     GROUP BY c.id
     ORDER BY c.updated_at DESC
     LIMIT 20`,
  );
  if (lastConvsRes.rows.length === 0) {
    console.log("  (no conversations found)\n");
  } else {
    console.log(`  ${"ID".padEnd(12)}  ${"userId".padEnd(12)}  ${"title".padEnd(25)}  msgs  updatedAt`);
    console.log(`  ${"-".repeat(10)}  ${"-".repeat(10)}  ${"-".repeat(23)}  ----  -----------`);
    for (const row of lastConvsRes.rows) {
      const uid = row.user_id ? row.user_id.slice(0, 8) + ".." : (row.guest_id ? "guest" : "null");
      console.log(
        `  ${row.id.slice(0, 10).padEnd(12)}  ${uid.padEnd(12)}  ${(row.title || "").padEnd(25)}  ${String(row.message_count).padStart(4)}  ${row.updated_at.toISOString().slice(0, 19)}`,
      );
    }
    console.log();
  }

  // ── 9. Last 20 messages ──
  console.log("=".repeat(80));
  console.log("✉️  LAST 20 MESSAGES");
  console.log("=".repeat(80));
  const lastMsgsRes = await client.query(
    `SELECT m.id, m.conversation_id, m.role, m.content, m.created_at
     FROM messages m
     ORDER BY m.created_at DESC
     LIMIT 20`,
  );
  if (lastMsgsRes.rows.length === 0) {
    console.log("  (no messages found)\n");
  } else {
    console.log(`  ${"convId".padEnd(12)}  ${"role".padEnd(10)}  ${"content".padEnd(60)}  createdAt`);
    console.log(`  ${"-".repeat(10)}  ${"-".repeat(8)}  ${"-".repeat(58)}  -----------`);
    for (const row of lastMsgsRes.rows) {
      console.log(
        `  ${row.conversation_id.slice(0, 10).padEnd(12)}  ${row.role.padEnd(10)}  ${truncate(row.content, 58).padEnd(60)}  ${row.created_at.toISOString().slice(0, 19)}`,
      );
    }
    console.log();
  }

  console.log("=".repeat(80));
  console.log("Done.");
  console.log("=".repeat(80));
} catch (err) {
  console.error("\nError:", err.message);
  if (err.code) {
    console.error(`  PostgreSQL error code: ${err.code}`);
  }
  if (err.detail) {
    console.error(`  Detail: ${err.detail}`);
  }
  process.exit(1);
} finally {
  await client.end();
}
