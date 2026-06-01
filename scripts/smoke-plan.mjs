#!/usr/bin/env node
/**
 * smoke-plan.mjs — 规划接口冒烟测试
 * Usage: node scripts/smoke-plan.mjs [baseUrl]
 *
 * 测试 POST /api/agent/plan，验证规划管道返回完整方案。
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
      const text = await res.text().catch(() => "");
      if (text) console.log(`     ${text.slice(0, 300)}`);
      fail++;
    }
  } catch (err) {
    console.log(`  ❌ ${name} — ${err.message}`);
    fail++;
  }
  return null;
}

console.log(`\n🔍 Smoke: Planning Pipeline`);
console.log(`   目标: ${BASE}\n`);

console.log("── Parse ──");
const parseResult = await test("POST /api/agent/parse (校验)", "POST", "/api/agent/parse", 200, {
  prompt: "明天杭州下雨，和朋友吃饭逛逛，预算300",
  city: "杭州",
  modelMode: "flash",
});

console.log("\n── Plan ──");
const planResult = await test("POST /api/agent/plan", "POST", "/api/agent/plan", 200, {
  prompt: "明天杭州下雨，和朋友吃饭逛逛，预算300",
  city: "杭州",
  startPoint: "仓前",
  budget: 300,
  companions: "friends",
  modelMode: "flash",
});

if (planResult) {
  const hasOptions = Array.isArray(planResult.options) && planResult.options.length > 0;
  const hasConversationId = typeof planResult.conversationId === "string";
  console.log(`    options: ${planResult.options?.length ?? 0}, conversationId: ${hasConversationId ? "✅" : "❌"}`);
  if (!hasOptions) {
    console.log("  ⚠️  方案列表为空");
    fail++;
  }
}

console.log("\n── Plan (校验错误) ──");
await test("POST /api/agent/plan (空 body) → 400", "POST", "/api/agent/plan", 400, {});

console.log(`\n═══════════════════════════════════`);
console.log(`  结果: ${pass}/${pass + fail} 通过`);
if (fail > 0) { console.log(`  ⚠️ ${fail} 项失败`); process.exit(1); }
else { console.log("  🎉 全部通过!"); }
