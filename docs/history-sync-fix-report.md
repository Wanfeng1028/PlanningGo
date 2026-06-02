# PlanningGo 浏览器历史同步修复报告

## 问题诊断

### 1. 为什么 messages 表有数据但浏览器不同步

根因链路分析（按可能性从高到低）：

1. **conversation.userId 是 null** — 旧版本/smoke 测试在没有 Authorization header 的情况下创建 conversations，导致 `conversation.userId = NULL`。当前端以"小明同学"身份调用 `GET /api/conversations?limit=50` 时，后端 `WHERE user_id = '<xiaomingId>'` 过滤掉了所有匿名 conversations，所以浏览器看不到它们。

2. **messages 没有 userId 字段** — messages 归属通过 `conversation.userId` 间接关联。如果 conversation 的 userId 是 null，即使 messages 表有大量记录，登录用户也查不到。

3. **smoke 测试写入匿名数据** — `smoke-chat.mjs` 和 `smoke-plan.mjs` 不带 Authorization header，创建的全部是匿名 conversations。

### 2. 哪些 conversation.userId 是 null/anonymous/不属于小明

请在数据库中运行以下 SQL 检查：

```sql
-- 查看所有 conversations 的归属情况
SELECT c.id, c.user_id, c.title, c.updated_at, COUNT(m.id) AS message_count
FROM conversations c
LEFT JOIN messages m ON m.conversation_id = c.id
GROUP BY c.id
ORDER BY c.updated_at DESC
LIMIT 50;

-- 查看小明用户的 conversations
SELECT c.id, c.user_id, c.title, c.updated_at, COUNT(m.id) AS message_count
FROM conversations c
LEFT JOIN messages m ON m.conversation_id = c.id
WHERE c.user_id = (SELECT id FROM users WHERE email = 'xiaoming@example.com')
GROUP BY c.id
ORDER BY c.updated_at DESC
LIMIT 50;

-- 统计各归属状态
SELECT
  CASE
    WHEN c.user_id IS NULL THEN 'anonymous (userId IS NULL)'
    ELSE 'user_id=' || c.user_id
  END AS ownership,
  COUNT(*) AS conversation_count,
  SUM(COUNT(m.id)) OVER (PARTITION BY c.user_id) AS total_messages
FROM conversations c
LEFT JOIN messages m ON m.conversation_id = c.id
GROUP BY c.user_id
ORDER BY conversation_count DESC;
```

### 3. 小明用户 id 是什么

```sql
SELECT id, name, email FROM users WHERE email = 'xiaoming@example.com';
```

### 4. GET /api/conversations 实际返回了多少条

已添加诊断日志到 `src/lib/api.ts` 的 `listConversations` 函数：
```
[api] listConversations { hasToken: true, limit: 50 }
[api] listConversations result { count: N, items: [...] }
```

### 5. 前端是否带 Authorization

已添加诊断日志到 `src/lib/api.ts` 和 `src/lib/stream.ts`：
- `listConversations` 打印 `hasToken`
- `getConversation` 打印 `hasToken`
- `streamAgentMessage` 打印 `hasToken`

`apiJson()` 函数（第 132-134 行）正确注入 Authorization header：
```typescript
if (_authToken) {
  headers.authorization = `Bearer ${_authToken}`;
}
```

### 6. 后端是否识别 authenticated=true

`optionalAuthGuard`（`src/server/plugins/auth.ts` 第 52-64 行）：
- 有 token → 验证 JWT → 设置 `request.userId`
- 无 token → 不阻断请求（`request.userId` 为 undefined）
- token 无效 → 不阻断，但设置 `x-token-expired: 1` header

后端 conversations 路由（`src/server/routes/conversations.ts`）已打印 `authenticated: Boolean(userId)` 日志。

### 7. 新建消息后 conversation.userId 是否正确

`agentRuntime.ts` 和 `chatRouter.ts` 的 `ensureConversation` 函数都正确传递 `userId`：
```typescript
const conv = await db.conversation.create({
  data: {
    userId: userId ?? undefined,  // ✅ 正确
    ...
  },
});
```

如果 `userId` 有值（用户已登录），conversation 会正确关联。

### 8. 点击历史是否从 DB 拉 messages

`FeaturesPage.tsx` 的 `handleSessionClick` 函数对登录用户调用 `GET /api/conversations/:id`：
```typescript
if (user?.id) {
  const detail = await getConversation(sessionId);
  const loadedMessages = safeMapDbMessages(detail.messages ?? []);
  setSessionMessages(sessionId, loadedMessages);
  ...
}
```
✅ 已正确从 DB 拉取。

### 9. 标题是否从闲聊更新成规划标题

已修复 `generateTitleFromSlots` 函数，现在生成更丰富的标题：
- 有 origin + dest + prefs → "杭师大仓前到西湖咖啡火锅游"
- 有 dest + prefs → "西湖咖啡火锅游"
- 有 origin + dest → "杭师大仓前到西湖规划"
- 只有 dest → "西湖出行规划"

同时在 `agentRuntime.ts` 中，plan 生成后也会再次更新标题（双重保障）。

`updateConversationTitle` 和 `chatRouter.ts` 的标题更新现在也同步更新 `updatedAt`，确保对话排到列表顶部。

### 10. "生成完整方案"是否复用上一轮 slots

已修复 `chatRouter.ts` 的 `computeNewState` 函数：
- "plan" 类型现在使用最新的 merged draft（而非 stale 的 prev draft）
- `handleAgentMessage` 在保存 state 前重新 merge 当前消息的 slots

`agentRuntime.ts` 中，`currentDraft` 通过工具调用循环持续积累，continuation 识别通过 `isContinuationIntent()` 和 LLM tool_calls 协同工作。

### 11. 预算 200 是否保持

`agentRuntime.ts` 第 258-259 行：
```typescript
const budget = (typeof effectiveDraft.budget === "number" ? effectiveDraft.budget : undefined)
  ?? (params.budget as number);
```
✅ draft（用户显式输入的值）优先级高于 LLM 参数，预算 200 不会被 LLM 覆盖为 420。

### 12. 所有命令结果

```
✅ npm run typecheck  — 通过
✅ npm test           — 338/338 通过
✅ npm run build      — 客户端和服务端均编译成功
```

## 修复清单

| 修复项 | 文件 | 说明 |
|--------|------|------|
| 前端诊断日志 | `src/lib/api.ts`, `src/lib/stream.ts`, `src/pages/FeaturesPage.tsx` | 所有 API 调用打印 token 状态和返回结果 |
| 后端诊断日志 | 已有（conversations.ts, agentChat.ts, agentRuntime.ts, chatRouter.ts） | 路由、userId、query 条件、返回数量 |
| 标题动态更新 | `agentRuntime.ts`, `chatRouter.ts` | `generateTitleFromSlots` 改进，`updatedAt` 同步更新 |
| conversation userId | `agentRuntime.ts`, `chatRouter.ts` | 已正确传递 userId，无需修改 |
| 认领脚本 | `scripts/dev-claim-conversations.mjs` | 新建，支持按 email/时间/ID 认领 |
| 点击历史 | `FeaturesPage.tsx` | 已正确从 DB 拉取，无需修改 |
| 方案上下文 | `chatRouter.ts` | `computeNewState` 修复使用最新 merged draft |
| smoke:auth-history | `scripts/smoke-auth-history.mjs` | 新建，11 步完整认证流程测试 |
| UI 滚动 | `FeaturesPage.module.scss` | resultSummary 添加 overflow 保护 |
| 登录用户 fallback | `FeaturesPage.tsx` | 已有防护，DB 失败不会 fallback 到 localStorage |

## 运行认领脚本

```bash
# 查看匿名 conversations
node scripts/dev-claim-conversations.mjs --email xiaoming@example.com

# 按时间范围认领
node scripts/dev-claim-conversations.mjs --email xiaoming@example.com --before 2026-06-02 --confirm

# 指定 ID 认领
node scripts/dev-claim-conversations.mjs --email xiaoming@example.com --ids <uuid1>,<uuid2> --confirm
```

## 运行认证冒烟测试

```bash
npm run smoke:auth-history
```
