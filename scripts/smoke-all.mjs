#!/usr/bin/env node
/**
 * smoke-all.mjs — 全量冒烟测试（health + llm + chat + plan）
 * Usage: node scripts/smoke-all.mjs [baseUrl]
 *
 * 依次运行所有 smoke 测试，汇总结果。
 */

import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.argv[2] || "http://127.0.0.1:3001";

const scripts = [
  "smoke-health.mjs",
  "smoke-llm.mjs",
  "smoke-chat.mjs",
  "smoke-plan.mjs",
];

console.log(`\n🚀 PlanningGo 全量冒烟测试`);
console.log(`   目标: ${BASE}`);
console.log(`   测试: ${scripts.length} 组\n`);

let totalPass = 0;
let totalFail = 0;

for (const script of scripts) {
  const scriptPath = path.join(__dirname, script);
  console.log(`${"═".repeat(50)}`);
  console.log(`▶ ${script}`);
  console.log(`${"═".repeat(50)}`);

  const exitCode = await new Promise((resolve) => {
    const child = execFile("node", [scriptPath, BASE], { timeout: 60000 }, (err, stdout, stderr) => {
      if (stdout) process.stdout.write(stdout);
      if (stderr) process.stderr.write(stderr);
    });
    child.on("close", (code) => resolve(code ?? 1));
  });

  if (exitCode === 0) {
    totalPass++;
  } else {
    totalFail++;
  }
  console.log("");
}

console.log(`${"═".repeat(50)}`);
console.log(`\n📊 汇总: ${totalPass}/${scripts.length} 组通过`);

if (totalFail > 0) {
  console.log(`   ❌ ${totalFail} 组失败`);
  process.exit(1);
} else {
  console.log("   🎉 全部通过!");
}
