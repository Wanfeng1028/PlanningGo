#!/usr/bin/env node
/**
 * smoke-chat.mjs — SSE 流式聊天冒烟测试
 * Usage: node scripts/smoke-chat.mjs [baseUrl]
 *
 * 测试 POST /api/agent/chat/stream，验证 SSE 流式响应和 [DONE] 信号。
 */

const BASE = process.argv[2] || "http://127.0.0.1:3001";
let pass = 0, fail = 0;

function check(name, condition, detail) {
  if (condition) {
    console.log(`  ✅ ${name}`);
    pass++;
  } else {
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`);
    fail++;
  }
}

console.log(`\n🔍 Smoke: SSE Chat Stream`);
console.log(`   目标: ${BASE}\n`);

console.log("── SSE /api/agent/chat/stream ──");

try {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  const res = await fetch(`${BASE}/api/agent/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "你好", modelMode: "flash" }),
    signal: controller.signal,
  });

  check("HTTP 状态 200", res.status === 200, `got ${res.status}`);
  const contentType = res.headers.get("content-type") ?? "";
  check("Content-Type 是 text/event-stream",
    contentType.toLowerCase().includes("text/event-stream"),
    contentType);

  // 读取 SSE 流
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let gotData = false;
  let gotDone = false;
  let gotFinalResult = false;
  let chunks = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // 解析 SSE 行
      const lines = buffer.split("\n");
      buffer = lines.pop(); // 保留不完整的行

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") {
          gotDone = true;
        } else if (data.includes("[FINAL_RESULT]") || data.includes("FINAL_RESULT")) {
          gotFinalResult = true;
        } else if (data.startsWith(":heartbeat")) {
          // heartbeat, ignore
        } else {
          try {
            const parsed = JSON.parse(data);
            if (parsed.content) chunks++;
            gotData = true;
          } catch { /* not JSON, might be heartbeat */ }
        }
      }
    }
  } finally {
    try { reader.releaseLock(); } catch { /* ignore */ }
    try { res.body.cancel(); } catch { /* ignore */ }
    clearTimeout(timeout);
  }

  check("收到数据帧", gotData, `chunks: ${chunks}`);
  check("收到 [DONE] 信号", gotDone);
  check("收到 [FINAL_RESULT]", gotFinalResult);

} catch (err) {
  console.log(`  ❌ SSE 请求失败 — ${err.message}`);
  fail += 3;
}

console.log(`\n═══════════════════════════════════`);
console.log(`  结果: ${pass}/${pass + fail} 通过`);
if (fail > 0) { console.log(`  ⚠️ ${fail} 项失败`); process.exit(1); }
else { console.log("  🎉 全部通过!"); }
