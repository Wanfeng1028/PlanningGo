#!/usr/bin/env node
/**
 * dev-claim-conversations.mjs — 开发期对话归属修复脚本
 *
 * 用法：
 *   node scripts/dev-claim-conversations.mjs --email xiaoming@example.com [--before 2026-06-01] [--after 2026-05-01] [--ids uuid1,uuid2] [--confirm]
 *
 * 功能：
 *   1. 按 email 查找用户
 *   2. 按 updatedAt 范围或指定 ID 筛选 conversations
 *   3. 打印将要修改的对话列表
 *   4. 只有带 --confirm 才真正执行 UPDATE
 *
 * ⚠️ 仅供本地开发使用，切勿在生产环境运行
 */

import pg from "pg";
const { Client } = pg;

// ── 解析命令行参数 ──
const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return null;
  return args[idx + 1] ?? null;
}
function hasFlag(name) {
  return args.includes(`--${name}`);
}

const email = getArg("email");
const before = getArg("before");
const after = getArg("after");
const idsRaw = getArg("ids");
const confirm = hasFlag("confirm");

if (!email) {
  console.error("❌ 缺少 --email 参数");
  console.error("   用法: node scripts/dev-claim-conversations.mjs --email xiaoming@example.com [--before 2026-06-01] [--after 2026-05-01] [--ids uuid1,uuid2] [--confirm]");
  process.exit(1);
}

// ── 连接数据库 ──
const DATABASE_URL = process.env.DATABASE_URL || "postgresql://planningo:planningo@localhost:5432/planningo";
const client = new Client({ connectionString: DATABASE_URL });

try {
  await client.connect();
  console.log("✅ 数据库连接成功\n");

  // 1. 查找用户
  const userRes = await client.query("SELECT id, name, email FROM users WHERE email = $1", [email]);
  if (userRes.rows.length === 0) {
    console.error(`❌ 找不到 email=${email} 的用户`);
    process.exit(1);
  }
  const user = userRes.rows[0];
  console.log(`📌 用户: ${user.name} (${user.email})`);
  console.log(`   ID: ${user.id}\n`);

  // 2. 查询当前用户的 conversations
  const myRes = await client.query(
    `SELECT c.id, c.user_id, c.title, c.updated_at, COUNT(m.id) AS message_count
     FROM conversations c
     LEFT JOIN messages m ON m.conversation_id = c.id
     WHERE c.user_id = $1
     GROUP BY c.id
     ORDER BY c.updated_at DESC
     LIMIT 50`,
    [user.id],
  );
  console.log(`📊 当前归属于该用户的 conversations: ${myRes.rows.length}`);
  for (const row of myRes.rows) {
    console.log(`   ${row.id.slice(0, 8)}… | ${row.title.padEnd(25)} | msgs=${row.message_count} | updated=${row.updated_at.toISOString().slice(0, 16)}`);
  }

  // 3. 查询所有 conversations（含匿名）
  console.log("\n📋 全部 conversations（最近 100 条）:");
  const allRes = await client.query(
    `SELECT c.id, c.user_id, c.guest_id, c.title, c.updated_at, COUNT(m.id) AS message_count
     FROM conversations c
     LEFT JOIN messages m ON m.conversation_id = c.id
     GROUP BY c.id
     ORDER BY c.updated_at DESC
     LIMIT 100`,
  );
  for (const row of allRes.rows) {
    const owner = row.user_id ? (row.user_id === user.id ? "👤 本人" : `🔒 ${row.user_id.slice(0, 8)}…`) : (row.guest_id ? `👻 guest:${row.guest_id.slice(0, 8)}…` : "❓ anonymous");
    console.log(`   ${row.id.slice(0, 8)}… | ${owner.padEnd(18)} | ${row.title.padEnd(25)} | msgs=${row.message_count} | updated=${row.updated_at.toISOString().slice(0, 16)}`);
  }

  // 4. 筛选要认领的 conversations
  let targetIds = [];

  if (idsRaw) {
    targetIds = idsRaw.split(",").map((s) => s.trim());
    console.log(`\n🎯 指定认领 ${targetIds.length} 个 conversation ID`);
  } else {
    // 按时间范围筛选 user_id IS NULL 的 conversations
    let whereClause = "c.user_id IS NULL";
    const params = [];
    let paramIdx = 1;

    if (before) {
      whereClause += ` AND c.updated_at < $${paramIdx++}`;
      params.push(before);
    }
    if (after) {
      whereClause += ` AND c.updated_at > $${paramIdx++}`;
      params.push(after);
    }

    const candidatesRes = await client.query(
      `SELECT c.id, c.user_id, c.guest_id, c.title, c.updated_at, COUNT(m.id) AS message_count
       FROM conversations c
       LEFT JOIN messages m ON m.conversation_id = c.id
       WHERE ${whereClause}
       GROUP BY c.id
       ORDER BY c.updated_at DESC
       LIMIT 50`,
      params,
    );

    if (candidatesRes.rows.length === 0) {
      console.log("\n⚠️  没有找到符合条件的匿名 conversations");
      process.exit(0);
    }

    console.log(`\n🔍 找到 ${candidatesRes.rows.length} 个匿名 conversations 符合条件:`);
    for (const row of candidatesRes.rows) {
      console.log(`   ${row.id.slice(0, 8)}… | ${row.title.padEnd(25)} | msgs=${row.message_count} | updated=${row.updated_at.toISOString().slice(0, 16)}`);
      targetIds.push(row.id);
    }
  }

  if (targetIds.length === 0) {
    console.log("\n⚠️  没有需要认领的 conversations");
    process.exit(0);
  }

  // 5. 执行认领
  if (!confirm) {
    console.log(`\n⚠️  将要认领 ${targetIds.length} 个 conversations 给 ${user.name} (${user.id})`);
    console.log("   添加 --confirm 参数来执行更新");
    process.exit(0);
  }

  console.log(`\n🔄 正在认领 ${targetIds.length} 个 conversations...`);
  const updateRes = await client.query(
    `UPDATE conversations SET user_id = $1, updated_at = NOW() WHERE id = ANY($2) AND user_id IS NULL`,
    [user.id, targetIds],
  );
  console.log(`✅ 已认领 ${updateRes.rowCount} 个 conversations`);

  // 6. 验证
  const verifyRes = await client.query(
    `SELECT c.id, c.title, COUNT(m.id) AS message_count
     FROM conversations c
     LEFT JOIN messages m ON m.conversation_id = c.id
     WHERE c.user_id = $1
     GROUP BY c.id
     ORDER BY c.updated_at DESC
     LIMIT 50`,
    [user.id],
  );
  console.log(`\n📊 认领后该用户共有 ${verifyRes.rows.length} 个 conversations:`);
  for (const row of verifyRes.rows) {
    console.log(`   ${row.id.slice(0, 8)}… | ${row.title.padEnd(25)} | msgs=${row.message_count}`);
  }

} catch (err) {
  console.error("❌ 错误:", err.message);
  process.exit(1);
} finally {
  await client.end();
}
