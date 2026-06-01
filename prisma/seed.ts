/**
 * 数据库种子脚本
 * 创建 demo 用户和初始数据
 */

if (process.env.NODE_ENV === "production") {
  console.error("❌ Refusing to run seed in production");
  process.exit(1);
}

async function main() {
  const { PrismaClient } = await import("../src/generated/prisma/client.js");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const bcrypt = await import("bcryptjs");

  const connectionString = process.env.DATABASE_URL ?? "postgresql://planninggo:planninggo@localhost:5432/planninggo?schema=public";
  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  console.log("🌱 开始 seed...");

  // ── Demo 用户 ──
  const passwordHash = await bcrypt.hash("weekend123", 10);

  const demoUser = await prisma.user.upsert({
    where: { email: "xiaoming@example.com" },
    update: {
      passwordHash,
      displayName: "小明同学",
      role: "user",
      mode: "registered",
      status: "active",
      emailVerifiedAt: new Date(),
    },
    create: {
      email: "xiaoming@example.com",
      passwordHash,
      displayName: "小明同学",
      role: "user",
      mode: "registered",
      status: "active",
      emailVerifiedAt: new Date(),
      profile: {
        create: {
          city: "北京",
          startPoint: "家附近",
          homeLat: 39.9042,
          homeLng: 116.4074,
          companions: "family",
          budgetMin: 200,
          budgetMax: 300,
          preferences: ["美食", "遛娃", "户外"],
          familyInfo: [
            { name: "我", age: 35, health: [] },
            { name: "宝贝", age: 6, health: [] },
          ],
        },
      },
      permissions: {
        create: {
          locationEnabled: true,
          memoryEnabled: true,
          calendarEnabled: false,
          shareEnabled: true,
          developerEnabled: false,
        },
      },
    },
  });

  console.log(`  ✅ Demo 用户: ${demoUser.email} (${demoUser.id})`);

  // ── Admin 用户 ──
  const adminHash = await bcrypt.hash("admin123", 10);
  const adminUser = await prisma.user.upsert({
    where: { email: "admin@planninggo.com" },
    update: {
      passwordHash: adminHash,
      displayName: "管理员",
      role: "admin",
      mode: "registered",
      status: "active",
      emailVerifiedAt: new Date(),
    },
    create: {
      email: "admin@planninggo.com",
      passwordHash: adminHash,
      displayName: "管理员",
      role: "admin",
      mode: "registered",
      status: "active",
      emailVerifiedAt: new Date(),
      profile: {
        create: {
          city: "北京",
          startPoint: "公司",
          companions: "solo",
          budgetMin: 0,
          budgetMax: 999,
        },
      },
      permissions: {
        create: {
          locationEnabled: true,
          memoryEnabled: true,
          calendarEnabled: true,
          shareEnabled: true,
          developerEnabled: true,
        },
      },
    },
  });

  console.log(`  ✅ Admin 用户: ${adminUser.email} (${adminUser.id})`);

  console.log("🎉 Seed 完成!");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("❌ Seed 失败:", e);
  process.exit(1);
});
