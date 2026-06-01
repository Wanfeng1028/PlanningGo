import "dotenv/config";


import { buildApp } from "./app";
import { env, corsOrigins } from "./config/env";

async function main() {
  const app = await buildApp();

  // ── Graceful Shutdown ──
  const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];
  for (const signal of signals) {
    process.on(signal, async () => {
      app.log.info(`收到 ${signal}，开始优雅关闭...`);
      await app.close();
      process.exit(0);
    });
  }

  try {
    await app.listen({ port: env.PORT, host: env.HOST });
    console.log(`\n🚀 PlanningGo API Server`);
    console.log(`   地址: http://127.0.0.1:${env.PORT}`);
    console.log(`   规划模式: ${env.PLANNING_MODE}`);
    console.log(`   CORS: ${corsOrigins.join(", ")}`);
    console.log(`   环境: ${env.NODE_ENV}\n`);
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

main();
