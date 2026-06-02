#!/usr/bin/env node
/**
 * smoke-auth-history.mjs — 认证用户历史同步冒烟测试
 *
 * Usage: node scripts/smoke-auth-history.mjs [baseUrl]
 *
 * 流程：
 * 1. 登录获取 token
 * 2. 发送消息，验证 conversationId 返回
 * 3. 拉取历史列表，验证包含该 conversation
 * 4. 拉取详情，验证消息存在
 * 5. 发送第二条消息，验证同一 conversationId 下消息增长
 * 6. 验证 conversation.userId 正确
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

console.log(`\n🔍 Smoke: Auth History Sync`);
console.log(`   目标: ${BASE}\n`);

// ── 1. 登录 ──
console.log("── 1. Login ──");
let token = null;
let userId = null;

try {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "xiaoming@example.com", password: "weekend123" }),
  });
  check("登录 HTTP 200", res.status === 200, `got ${res.status}`);

  const body = await res.json();
  const data = body.data || body;
  token = data.token || data.accessToken;
  userId = data.user?.id;

  check("获取到 token", Boolean(token));
  check("获取到 userId", Boolean(userId), `userId=${userId}`);
  console.log(`    userId: ${userId ?? "null"}`);
} catch (err) {
  console.log(`  ❌ 登录失败 — ${err.message}`);
  fail += 3;
}

if (!token) {
  console.log("\n⚠️  无法获取 token，跳过后续测试");
  console.log(`\n═══════════════════════════════════`);
  console.log(`  结果: ${pass}/${pass + fail} 通过`);
  process.exit(1);
}

const authHeaders = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${token}`,
};

// ── 2. 发送消息 ──
console.log("\n── 2. Send chat message ──");
let conversationId = null;

try {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  const res = await fetch(`${BASE}/api/agent/chat/stream`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ message: "你好", modelMode: "flash" }),
    signal: controller.signal,
  });

  check("Chat HTTP 200", res.status === 200, `got ${res.status}`);

  // Read SSE stream
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let gotFinalResult = false;
  let finalResult = null;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") continue;
        if (data.startsWith("[FINAL_RESULT]")) {
          try {
            finalResult = JSON.parse(data.slice("[FINAL_RESULT]".length));
            gotFinalResult = true;
          } catch {}
        }
      }
    }
  } finally {
    try { reader.releaseLock(); } catch {}
    try { res.body.cancel(); } catch {}
    clearTimeout(timeout);
  }

  check("收到 [FINAL_RESULT]", gotFinalResult);

  if (finalResult) {
    conversationId = finalResult.conversationId;
    check("返回 conversationId", Boolean(conversationId), `conversationId=${conversationId}`);
    console.log(`    conversationId: ${conversationId ?? "null"}`);
    console.log(`    type: ${finalResult.type}`);
  }
} catch (err) {
  console.log(`  ❌ Chat 请求失败 — ${err.message}`);
  fail += 3;
}

if (!conversationId) {
  console.log("\n⚠️  无法获取 conversationId，跳过后续测试");
  console.log(`\n═══════════════════════════════════`);
  console.log(`  结果: ${pass}/${pass + fail} 通过`);
  process.exit(1);
}

// ── 3. 拉取历史列表 ──
console.log("\n── 3. List conversations ──");
try {
  const res = await fetch(`${BASE}/api/conversations?limit=50`, {
    headers: authHeaders,
  });
  check("List HTTP 200", res.status === 200, `got ${res.status}`);

  const body = await res.json();
  const convs = body.data || body;
  const convList = Array.isArray(convs) ? convs : [];

  check("返回 conversation 列表", convList.length > 0, `count=${convList.length}`);

  const found = convList.find((c) => c.id === conversationId);
  check("列表包含刚创建的 conversation", Boolean(found), `searched for ${conversationId.slice(0, 8)}…`);

  if (found) {
    check("conversation.userId 正确", found.userId === userId, `expected=${userId}, got=${found.userId}`);
    console.log(`    title: ${found.title}`);
    console.log(`    userId: ${found.userId}`);
    console.log(`    messageCount: ${found._count?.messages ?? "N/A"}`);
  }

  // Check for null/anonymous userId conversations
  const nullUserIdConvs = convList.filter((c) => !c.userId);
  if (nullUserIdConvs.length > 0) {
    console.log(`    ⚠️  ${nullUserIdConvs.length} conversations have null userId in results`);
  }
} catch (err) {
  console.log(`  ❌ List 请求失败 — ${err.message}`);
  fail += 4;
}

// ── 4. 拉取详情 ──
console.log("\n── 4. Get conversation detail ──");
try {
  const res = await fetch(`${BASE}/api/conversations/${conversationId}`, {
    headers: authHeaders,
  });
  check("Detail HTTP 200", res.status === 200, `got ${res.status}`);

  const body = await res.json();
  const detail = body.data || body;

  check("详情包含 messages", Array.isArray(detail?.messages) && detail.messages.length > 0, `messageCount=${detail?.messages?.length ?? 0}`);

  if (detail?.messages?.length > 0) {
    const userMsg = detail.messages.find((m) => m.role === "user");
    check("messages 包含 user '你好'", Boolean(userMsg && userMsg.content.includes("你好")), `content=${userMsg?.content?.slice(0, 30) ?? "null"}`);
  }

  check("详情 userId 正确", detail?.userId === userId, `expected=${userId}, got=${detail?.userId}`);
} catch (err) {
  console.log(`  ❌ Detail 请求失败 — ${err.message}`);
  fail += 4;
}

// ── 5. 发送第二条消息 ──
console.log("\n── 5. Send second message ──");
let secondConversationId = null;
let messageCountAfter = 0;

try {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  const res = await fetch(`${BASE}/api/agent/chat/stream`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      message: "去杭州西湖",
      modelMode: "flash",
      conversationId: conversationId,
    }),
    signal: controller.signal,
  });

  check("Second chat HTTP 200", res.status === 200, `got ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalResult2 = null;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") continue;
        if (data.startsWith("[FINAL_RESULT]")) {
          try {
            finalResult2 = JSON.parse(data.slice("[FINAL_RESULT]".length));
          } catch {}
        }
      }
    }
  } finally {
    try { reader.releaseLock(); } catch {}
    try { res.body.cancel(); } catch {}
    clearTimeout(timeout);
  }

  if (finalResult2) {
    secondConversationId = finalResult2.conversationId;
    check("同一 conversationId", secondConversationId === conversationId, `expected=${conversationId}, got=${secondConversationId}`);
  }

  // Verify messages grew
  const detailRes = await fetch(`${BASE}/api/conversations/${conversationId}`, {
    headers: authHeaders,
  });
  const detailBody = await detailRes.json();
  const detail = detailBody.data || detailBody;
  messageCountAfter = detail?.messages?.length ?? 0;

  check("messages 数量增长", messageCountAfter >= 4, `messageCount=${messageCountAfter} (expected >= 4)`);
  console.log(`    messageCount after 2nd message: ${messageCountAfter}`);
} catch (err) {
  console.log(`  ❌ Second message 失败 — ${err.message}`);
  fail += 3;
}

// ── 6. 验证 conversation.userId ──
console.log("\n── 6. Verify conversation ownership ──");
try {
  const res = await fetch(`${BASE}/api/conversations/${conversationId}`, {
    headers: authHeaders,
  });
  const body = await res.json();
  const detail = body.data || body;

  check("conversation.userId 是小明 id", detail?.userId === userId, `expected=${userId}, got=${detail?.userId}`);
  check("conversation.userId 不是 null", detail?.userId !== null && detail?.userId !== undefined);
  check("conversation.userId 不是 anonymous", detail?.userId !== "anonymous");
} catch (err) {
  console.log(`  ❌ Verify 请求失败 — ${err.message}`);
  fail += 3;
}

// ── 汇总 ──
console.log(`\n═══════════════════════════════════`);
console.log(`  结果: ${pass}/${pass + fail} 通过`);
if (fail > 0) {
  console.log(`  ⚠️ ${fail} 项失败`);
  process.exit(1);
} else {
  console.log("  🎉 全部通过!");
}
