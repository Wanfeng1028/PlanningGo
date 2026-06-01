#!/usr/bin/env node
/**
 * smoke-llm.mjs — LLM provider 可用性冒烟测试
 * Usage: node scripts/smoke-llm.mjs [baseUrl]
 *
 * 测试 POST /api/agent/chat（非流式），验证 LLM 调用链路。
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
      if (text) console.log(`     ${text.slice(0, 200)}`);
      fail++;
    }
  } catch (err) {
    console.log(`  ❌ ${name} — ${err.message}`);
    fail++;
  }
  return null;
}

console.log(`\n🔍 Smoke: LLM Provider`);
console.log(`   目标: ${BASE}\n`);

console.log("── Chat (非流式) ──");
const chat = await test("POST /api/agent/chat (你好)", "POST", "/api/agent/chat", 200, {
  message: "你好",
});
if (chat) {
  const hasContent = typeof chat.content === "string" && chat.content.length > 0;
  const hasType = typeof chat.type === "string";
  console.log(`    type: ${chat.type}, content长度: ${chat.content?.length ?? 0}`);
  if (!hasContent) {
    console.log("  ⚠️  响应 content 为空");
    fail++;
  }
  if (!hasType) {
    console.log("  ⚠️  响应缺少 type 字段");
    fail++;
  }
}

console.log(`\n═══════════════════════════════════`);
console.log(`  结果: ${pass}/${pass + fail} 通过`);
if (fail > 0) { console.log(`  ⚠️ ${fail} 项失败`); process.exit(1); }
else { console.log("  🎉 全部通过!"); }
