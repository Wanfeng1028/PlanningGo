---
name: in-memory-store-capacity
description: 'Node.js 进程内的 Map store 需要容量限制 — 使用 enforceCapacity 防止内存溢出'
source: auto-skill
extracted_at: '2026-05-28T00:15:00.000Z'
---

## Problem

服务端使用 `new Map()` 作为内存缓存/fallback store（如会话、token、对话记录），但没有容量限制。攻击者或正常使用可不断插入条目，最终耗尽进程内存导致 OOM。

常见无限制 store：`permissionStore`, `executionStore`, `apiKeyStore`, `webhookStore`, `conversations`, `messages`, `plans`, `users`, `tokens`。

## Solution

定义通用的 `enforceCapacity` 函数，在每次 `.set()` 后调用：

```ts
const MAX_ENTRIES = 5000;
const CLEANUP_BATCH = 500;

function enforceCapacity<T>(store: Map<string, T>, maxEntries = MAX_ENTRIES): void {
  if (store.size <= maxEntries) return;
  // 删除最早的 CLEANUP_BATCH 条目（FIFO）
  const it = store.keys();
  for (let i = 0; i < CLEANUP_BATCH; i++) {
    const k = it.next().value;
    if (k !== undefined) store.delete(k);
  }
}
```

在每个写入点后调用：

```ts
export function createConversation(data) {
  const conv = { ... };
  conversations.set(conv.id, conv);
  enforceCapacity(conversations);  // ← 必须
  return conv;
}
```

## Diagnosis

搜索项目中所有 `new Map()` 声明，检查：
1. 是否有对应的 `.set()` 调用后缺少 `enforceCapacity`
2. 对于数组形式的 store（如 `const logs: Log[] = []`），检查是否有 `.push()` 后的 `length > MAX` 截断
3. 特别关注 fallback/内存模式的 store（Prisma 不可用时使用的替代方案）

## Key rules

- **每个 `Map.set()` 调用点**都必须跟 `enforceCapacity` — 不能只在创建函数中加，更新函数（upsert、replay）也要加
- `MAX_ENTRIES` 根据场景调整：用户级 store（keyed by userId）可以小一些（5000），数据级 store（keyed by dataId）可能需要更大
- 批量清理（`CLEANUP_BATCH`）比逐条删除高效 — 避免在每次 set 时都检查
- `Map.keys()` 迭代器按插入顺序返回 → 删除的是最早的条目（FIFO 淘汰）
- 对于 `Array` 形式的 store，使用 `splice(0, arr.length - MAX)` 截断头部
- 这是进程内 store 特有的问题 — Prisma/数据库 store 由数据库管理容量
