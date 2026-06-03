#!/usr/bin/env node
/**
 * 种入演示历史数据
 * 用法: node scripts/dev-seed-demo-history.mjs [--confirm]
 */
import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://planningo:planningo@localhost:5432/planningo";
const adapter = new PrismaPg({ connectionString: DATABASE_URL });
const prisma = new PrismaClient({ adapter });
const args = process.argv.slice(2);
const dryRun = !args.includes("--confirm");

const DEMO_CONVERSATIONS = [
  {
    title: "周末西湖咖啡火锅",
    city: "杭州",
    intent: { raw: "从杭师大仓前出发，明天上午9点，一个人，先找咖啡厅坐坐，中午吃火锅，预算200", city: "杭州" },
  },
  {
    title: "朋友雨天杭州美食",
    city: "杭州",
    intent: { raw: "明天杭州下雨，和朋友吃饭逛逛，预算300，少走路，别排队", city: "杭州" },
  },
  {
    title: "亲子半日游",
    city: "杭州",
    intent: { raw: "周末带娃半天，预算300，室内优先，别太累", city: "杭州" },
  },
  {
    title: "情侣周末约会",
    city: "杭州",
    intent: { raw: "周六晚上和对象约会，想吃饭看电影，预算500，氛围好一点", city: "杭州" },
  },
];

async function main() {
  console.log(`\n🌱 种入演示历史数据${dryRun ? "（dry-run 模式）" : ""}\n`);

  // Find demo user
  const user = await prisma.user.findFirst({
    where: { email: "xiaoming@example.com" },
  });

  if (!user) {
    console.log("未找到演示用户 xiaoming@example.com，请先运行 prisma db seed。");
    return;
  }

  console.log(`找到演示用户: ${user.email} (${user.id})`);

  for (const demo of DEMO_CONVERSATIONS) {
    console.log(`  📝 创建对话: ${demo.title}`);

    if (dryRun) continue;

    const conv = await prisma.conversation.create({
      data: {
        userId: user.id,
        title: demo.title,
        metadata: { city: demo.city, intent: demo.intent, seeded: true },
      },
    });

    // Add sample messages
    await prisma.message.create({
      data: {
        conversationId: conv.id,
        role: "user",
        content: demo.intent.raw,
        payloadJson: { type: "text" },
      },
    });

    await prisma.message.create({
      data: {
        conversationId: conv.id,
        role: "assistant",
        content: `已为您规划「${demo.title}」方案，包含 3 套路线供选择。`,
        payloadJson: { type: "text", metadata: { provider: "mock" } },
      },
    });
  }

  if (dryRun) {
    console.log(`\n⚠️  dry-run 模式，将创建 ${DEMO_CONVERSATIONS.length} 个对话。使用 --confirm 执行。`);
  } else {
    console.log(`\n✅ 已种入 ${DEMO_CONVERSATIONS.length} 个演示对话。`);
  }
}

main()
  .catch((err) => {
    console.error("❌ 种入失败:", err.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
