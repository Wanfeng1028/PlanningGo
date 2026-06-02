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
 * 7. Cross-user isolation: 其他用户的 token 无法访问此 conversation
 * 8. Guest isolation: 无 token 的游客不能看到认证用户的 conversations
 * 9. plan_selected dedup: 重复选择同一方案不会重复写入消息
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

// ── 7. Cross-user isolation: another user's token cannot access this conversation ──
console.log("\n── 7. Cross-user isolation ──");
try {
  // Try to register/login a second user
  let token2 = null;
  const regRes = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "test2@example.com", password: "test1234" }),
  });

  if (regRes.ok) {
    const regBody = await regRes.json();
    const regData = regBody.data || regBody;
    token2 = regData.token || regData.accessToken;

    if (token2) {
      const crossRes = await fetch(`${BASE}/api/conversations/${conversationId}`, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token2}`,
        },
      });

      // Should be 403 FORBIDDEN since this conversation belongs to the first user
      check("其他用户访问返回 403", crossRes.status === 403, `got ${crossRes.status}`);

      if (crossRes.ok) {
        const crossBody = await crossRes.json();
        const crossDetail = crossBody.data || crossBody;
        check("其他用户无法获取 conversation 详情", crossDetail?.userId !== userId, `leaked userId=${crossDetail?.userId}`);
      } else {
        check("其他用户无法获取 conversation 详情", true);
      }
    } else {
      console.log("  ⚠️  无法登录第二个用户，跳过 cross-user 测试");
    }
  } else {
    console.log("  ⚠️  第二个用户登录失败 (可能未注册)，跳过 cross-user 测试");
    // Still attempt a test: try without any auth to see if the conversation is protected
    const noAuthRes = await fetch(`${BASE}/api/conversations/${conversationId}`);
    check("无 token 访问登录用户 conversation 应被拒绝", noAuthRes.status === 403 || noAuthRes.status === 404, `got ${noAuthRes.status}`);
  }
} catch (err) {
  console.log(`  ❌ Cross-user isolation 测试失败 — ${err.message}`);
  fail += 2;
}

// ── 8. Guest cannot see authenticated user's conversations ──
console.log("\n── 8. Guest isolation ──");
try {
  // Request without any Authorization header
  const guestRes = await fetch(`${BASE}/api/conversations/${conversationId}`);
  check("Guest 无 token 不能访问认证用户 conversation", guestRes.status === 403 || guestRes.status === 404, `got ${guestRes.status}`);

  // Also try listing conversations without auth — should return empty or error
  const guestListRes = await fetch(`${BASE}/api/conversations?limit=50`);
  check("Guest 列表请求返回空或成功", true); // informational only
  if (guestListRes.ok) {
    const guestListBody = await guestListRes.json();
    const guestConvs = guestListBody.data || guestListBody;
    const guestConvList = Array.isArray(guestConvs) ? guestConvs : [];
    const foundOwned = guestConvList.find((c) => c.id === conversationId);
    check("Guest 列表不包含认证用户 conversation", !foundOwned);
  }
} catch (err) {
  console.log(`  ❌ Guest isolation 测试失败 — ${err.message}`);
  fail += 2;
}

// ── 9. plan_selected dedup — selecting same plan twice doesn't duplicate messages ──
console.log("\n── 9. plan_selected dedup ──");
try {
  // First, get the current message count
  const beforeRes = await fetch(`${BASE}/api/conversations/${conversationId}`, {
    headers: authHeaders,
  });
  const beforeBody = await beforeRes.json();
  const beforeDetail = beforeBody.data || beforeBody;
  const msgCountBefore = beforeDetail?.messages?.length ?? 0;

  // Look for an existing plan option ID from messages (if any plan was returned)
  let testOptionId = null;
  for (const m of (beforeDetail?.messages ?? [])) {
    const payload = m.payloadJson;
    if (payload?.type === "plan" && payload?.data?.options?.length > 0) {
      testOptionId = payload.data.options[0].id;
      break;
    }
    if (payload?.type === "plan_selected" && payload?.selectedOptionId) {
      testOptionId = payload.selectedOptionId;
      break;
    }
  }

  if (testOptionId) {
    // Select the same plan twice
    const select1 = await fetch(`${BASE}/api/agent/plans/select`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ conversationId, optionId: testOptionId }),
    });
    check("第一次 plan select 成功", select1.ok, `status=${select1.status}`);

    const select2 = await fetch(`${BASE}/api/agent/plans/select`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ conversationId, optionId: testOptionId }),
    });
    check("第二次 plan select 成功", select2.ok, `status=${select2.status}`);

    // Check message count didn't increase
    const afterRes = await fetch(`${BASE}/api/conversations/${conversationId}`, {
      headers: authHeaders,
    });
    const afterBody = await afterRes.json();
    const afterDetail = afterBody.data || afterBody;
    const msgCountAfter = afterDetail?.messages?.length ?? 0;

    check("重复选择方案不增加消息数", msgCountAfter === msgCountBefore, `before=${msgCountBefore}, after=${msgCountAfter}`);
  } else {
    console.log("  ⚠️  当前 conversation 中没有 plan 消息，跳过 dedup 测试");
    console.log("     (需要先生成一个 plan 类型的 conversation 才能测试)");
  }
} catch (err) {
  console.log(`  ❌ plan_selected dedup 测试失败 — ${err.message}`);
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