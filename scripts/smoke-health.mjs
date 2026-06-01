#!/usr/bin/env node
/**
 * smoke-health.mjs — Health & Ready 端点冒烟测试
 * Usage: node scripts/smoke-health.mjs [baseUrl]
 */

const BASE = process.argv[2] || "http://127.0.0.1:3001";
let pass = 0, fail = 0;

async function test(name, method, path, expectedStatus, body) {
  const url = `${BASE}${path}`;
  try {
    const opts = { method, headers: { "Content-Type": "application/json" } };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    if (res.status === expectedStatus) {
      console.log(`  ✅ ${name} (${res.status})`);
      pass++;
      try { return await res.json(); } catch { return null; }
    } else {
      console.log(`  ❌ ${name} — expected ${expectedStatus}, got ${res.status}`);
      fail++;
    }
  } catch (err) {
    console.log(`  ❌ ${name} — ${err.message}`);
    fail++;
  }
  return null;
}

console.log(`\n🔍 Smoke: Health & Ready`);
console.log(`   目标: ${BASE}\n`);

console.log("── Health ──");
const health = await test("GET /api/health", "GET", "/api/health", 200);
if (health && health.ok !== true) {
  console.log("  ⚠️  health.ok !== true");
}

console.log("\n── Ready ──");
const ready = await test("GET /api/ready", "GET", "/api/ready", 200);
if (ready) {
  console.log(`    db: ${ready.db}, redis: ${ready.redis}`);
}

console.log("\n── Root ──");
await test("GET /", "GET", "/", 200);

console.log(`\n═══════════════════════════════════`);
console.log(`  结果: ${pass}/${pass + fail} 通过`);
if (fail > 0) { console.log(`  ⚠️ ${fail} 项失败`); process.exit(1); }
else { console.log("  🎉 全部通过!"); }
