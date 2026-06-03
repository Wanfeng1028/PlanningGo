#!/usr/bin/env node
/**
 * 清理匿名对话（userId=null 的对话）
 * 用法: node scripts/dev-clean-anonymous.mjs [--dry-run] [--confirm]
 */
import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://planningo:planningo@localhost:5432/planningo";
const adapter = new PrismaPg({ connectionString: DATABASE_URL });
const prisma = new PrismaClient({ adapter });
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run") || !args.includes("--confirm");

async function main() {
  console.log(`\n🧹 清理匿名对话${dryRun ? "（dry-run 模式）" : ""}\n`);

  const anonymousConversations = await prisma.conversation.findMany({
    where: { userId: null },
    include: { _count: { select: { messages: true } } },
  });

  console.log(`找到 ${anonymousConversations.length} 个匿名对话`);

  if (anonymousConversations.length === 0) {
    console.log("没有需要清理的对话。");
    return;
  }

  for (const conv of anonymousConversations) {
    console.log(`  - ${conv.id} (${conv._count.messages} 条消息, 创建于 ${conv.createdAt?.toISOString?.() ?? "未知"})`);
  }

  if (dryRun) {
    console.log("\n⚠️  dry-run 模式，未实际删除。使用 --confirm 执行删除。");
    return;
  }

  const ids = anonymousConversations.map((c) => c.id);

  // Delete messages first
  await prisma.message.deleteMany({ where: { conversationId: { in: ids } } });
  // Then delete conversations
  const result = await prisma.conversation.deleteMany({ where: { id: { in: ids } } });

  console.log(`\n✅ 已清理 ${result.count} 个匿名对话及其消息。`);
}

main()
  .catch((err) => {
    console.error("❌ 清理失败:", err.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
