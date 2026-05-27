---
name: duplicate-module-state
description: '多个模块各自维护同一份状态（如 auth token）会导致状态不同步 — 统一到单一来源并导出 getter'
source: auto-skill
extracted_at: '2026-05-28T00:15:00.000Z'
---

## Problem

多个前端模块各自声明同名变量来跟踪共享状态：

```ts
// api.ts
let _authToken: string | null = localStorage.getItem("pg_token");
export function setAuthToken(token) { _authToken = token; ... }

// stream.ts  ← 重复！
let _authToken: string | null = localStorage.getItem("pg_token");
export function setAuthToken(token) { _authToken = token; ... }
```

当 `api.ts` 中的 token 刷新逻辑调用 `setAuthToken(newToken)` 时，`stream.ts` 的 `_authToken` 不会更新 → 后续 SSE 请求仍用旧 token → 401 错误。

## Solution

只在一个模块中维护状态，其他模块通过 getter 函数读取：

```ts
// api.ts — 唯一的状态所有者
let _authToken: string | null = localStorage.getItem("pg_token");
export function setAuthToken(token: string | null) { ... }
export function getAuthToken() { return _authToken; }

// stream.ts — 只导入 getter
import { getAuthToken } from "./api";

export function streamPlanningRequest(input, options) {
  const token = getAuthToken(); // 每次调用时读取最新值
  if (token) headers.authorization = `Bearer ${token}`;
}
```

## Diagnosis

搜索项目中同一个变量名（如 `_authToken`, `API_BASE`, `currentUser`）在多个文件中的声明。如果多个文件都 `let _xxx` 并导出 `setXxx`，就是此模式。

## Key rules

- **单一数据源**：状态只在一个模块中声明和修改
- **Getter 而非复制**：其他模块导入 getter 函数，不要复制变量
- **删除重复的 setter**：只保留一个模块导出 `set*`，其他文件中的同名导出必须删除
- 同一模式适用于：API base URL（提取到 config.ts）、当前用户、feature flags、主题设置
- 对于 API_BASE 等配置常量，提取到独立的 `config.ts` 更清晰
