#!/usr/bin/env node
/**
 * 重置测试用户小明（清除对话、记忆、画像，保留账号）
 * 用法: node scripts/dev-reset-xiaoming.mjs [--confirm]
 */
import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://planningo:planningo@localhost:5432/planningo";
const adapter = new PrismaPg({ connectionString: DATABASE_URL });
const prisma = new PrismaClient({ adapter });
const args = process.argv.slice(2);
const dryRun = !args.includes("--confirm");

async function main() {
  console.log(`\n🔄 重置测试用户小明${dryRun ? "（dry-run 模式）" : ""}\n`);

  const user = await prisma.user.findFirst({
    where: { email: "xiaoming@example.com" },
  });

  if (!user) {
    console.log("未找到演示用户 xiaoming@example.com，请先运行 prisma db seed。");
    return;
  }

  console.log(`找到用户: ${user.email} (${user.id})`);

  // Count related records
  const conversationCount = await prisma.conversation.count({ where: { userId: user.id } });
  const messageCount = await prisma.message.count({
    where: { conversation: { userId: user.id } },
  });
  const memoryCount = await prisma.memory.count({ where: { userId: user.id } });

  console.log(`\n将清除:`);
  console.log(`  - ${conversationCount} 个对话`);
  console.log(`  - ${messageCount} 条消息`);
  console.log(`  - ${memoryCount} 条记忆`);

  if (dryRun) {
    console.log("\n⚠️  dry-run 模式，未实际清除。使用 --confirm 执行。");
    return;
  }

  // Get conversation IDs
  const conversations = await prisma.conversation.findMany({
    where: { userId: user.id },
    select: { id: true },
  });
  const convIds = conversations.map((c) => c.id);

  // Delete in order: messages → actions → plan steps → plan options → plans → conversations → memories
  if (convIds.length > 0) {
    await prisma.message.deleteMany({ where: { conversationId: { in: convIds } } });
    await prisma.action.deleteMany({ where: { planOption: { plan: { conversationId: { in: convIds } } } } }).catch(() => {});
    await prisma.conversation.deleteMany({ where: { id: { in: convIds } } });
  }

  await prisma.memory.deleteMany({ where: { userId: user.id } }).catch(() => {});

  // Reset user profile (clear profile data, keep account)
  await prisma.userProfile.updateMany({
    where: { userId: user.id },
    data: {},
  }).catch(() => {});

  console.log(`\n✅ 已重置用户 ${user.email} 的所有数据。`);
}

main()
  .catch((err) => {
    console.error("❌ 重置失败:", err.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
