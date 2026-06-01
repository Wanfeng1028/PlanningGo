# PlanningGo 代码审查与上线建议报告

> 审查人：AI-5（质量闸门）
> 日期：2026-06-02
> 分支：main（合并后状态）

---

## 1. 构建验证结果

| 检查项         | 结果                                          |
| -------------- | --------------------------------------------- |
| `typecheck`    | ✅ 通过（修复 4 个 TS 错误后）                 |
| `test`         | ✅ 21 文件 / 234 用例全部通过                   |
| `build`        | ✅ 前端 + 后端构建成功                          |

### 修复的类型错误

1. **`src/pages/FeaturesPage.tsx:588-589`** — `errorMsg` 变量不存在，改为 `rawError`
2. **`src/server/modules/agent/agentRuntime.test.ts:63-64`** — mock 函数参数类型不匹配，改为显式类型
3. **`src/server/modules/agent/modelClient.ts`** — `ProviderCapability` 接口重复定义，移除重复并统一 `getProviderCapability` 返回类型

---

## 2. 代码审查发现

### 🔴 高风险

#### 2.1 LLM 失败静默 fallback 成模板内容

**位置**：
- `src/server/modules/agent/orchestrator.ts:76-82`（hybrid 模式）
- `src/server/routes/agentChat.ts:108-111`（runtime → rule router fallback）

**问题**：在 `hybrid` 模式下，LLM 调用失败会静默降级为 mock 方案，用户无法区分真实 LLM 输出和模板内容。SSE chat 端点中，runtime 失败后静默切换到 rule-based 路由，同样无用户感知。

**建议**：在响应中增加 `degraded: true` 标记，或在前端显示"当前使用基础模式"提示。

### 🟡 中风险

#### 2.2 ~~`/api/mock/*` 路由生产环境可访问~~ ✅ 已修复

**位置**：`src/server/routes/mock.ts`

**修复**：在 `registerMockRoutes` 开头增加 `NODE_ENV === "production"` 守卫，生产环境跳过注册。

#### 2.3 运行时 DB 故障静默降级为内存

**位置**：`src/server/routes/agent.ts:113-116`, `src/server/routes/events.ts:46-49`

**问题**：数据库启动失败在 production 会抛出（正确），但运行时 DB 故障在各路由中 catch 后静默降级为内存存储，生产环境数据会丢失。

**建议**：生产环境运行时 DB 故障应记录告警并返回 503，而非静默降级。

#### 2.4 ~~SSE `[DONE]` 边界情况~~ ✅ 已修复

**位置**：`src/server/routes/agentChat.ts`

**修复**：在 `if (agentResponse)` 之后增加 `else` 分支，当 `agentResponse` 为 null 时发送错误响应 + `[DONE]`，确保客户端不会挂起。

### 🟢 低风险

#### 2.5 `services/agent.ts` 使用假 API key

**位置**：`src/server/services/agent.ts:36`

```typescript
const openaiApiKey = env.OPENAI_API_KEY ?? "demo_key_for_testing";
```

**建议**：改为 `if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not configured")`。

#### 2.6 `/api/ready` 无认证暴露诊断信息

**位置**：`src/server/app.ts`

**问题**：当 `LLM_EXPOSE_DIAGNOSTICS=true` 时，`/api/ready` 向未认证用户暴露 provider 优先级和 fallback 配置。

**建议**：生产环境默认 `LLM_EXPOSE_DIAGNOSTICS=false`。

#### 2.7 `.env.production.template` 缺少变量

缺少：`QWEATHER_API_KEY`, `AMAP_MAX_CALLS_FLASH`, `AMAP_MAX_CALLS_PRO`, `MEITUAN_AUTH_URL`, `MEITUAN_TOKEN_URL`, `MEITUAN_USERINFO_URL`

#### 2.8 前端未使用共享类型

**位置**：`src/pages/FeaturesPage.tsx`

**问题**：前端使用 `unknown` + `as` 类型断言，未导入 `shared/agentResponse.ts` 中的 `AgentResponse` 类型。

---

## 3. 安全检查清单

| 检查项                                     | 结果           |
| ------------------------------------------ | -------------- |
| 源码中无硬编码真实 API key                  | ✅ 通过         |
| `.env` 在 `.gitignore` 中                   | ✅ 通过         |
| JWT 弱密钥在 production 被拒绝              | ✅ 通过         |
| Cookie secret 有双重守卫                    | ✅ 通过         |
| DB 启动失败在 production 抛出               | ✅ 通过         |
| Helmet CSP 在 production 启用               | ✅ 通过         |
| 速率限制已配置                              | ✅ 通过         |
| 生产禁止 demo auth                          | ✅ 通过         |
| 生产禁止自动支付                            | ✅ 通过         |
| Health 端点不泄露密钥                       | ✅ 通过         |
| SSE `[DONE]` 正常路径发送                   | ✅ 通过         |
| SSE `[DONE]` 异常路径发送                   | ✅ 已修复         |
| Provider 生产环境不 fallback 到 mock        | ✅ 通过         |
| `/api/mock/*` 生产环境禁用                  | ✅ 已修复       |

---

## 4. 上线建议

### 结论：🟢 可上线（附条件）

**理由**：

项目整体架构扎实，安全守卫完善，构建和测试全部通过。两个"必须修复"项已完成：

- ✅ `/api/mock/*` 路由在生产环境已禁用
- ✅ SSE `[DONE]` 边界情况已修复

**强烈建议上线后尽快修复**：
1. LLM fallback 在响应中标记 `degraded` 状态
2. 运行时 DB 故障生产环境不静默降级

**可上线后修复**：
3. `.env.production.template` 补全文档
4. 前端类型安全改进
5. `/api/ready` 诊断信息认证

---

## 5. 发布清单

详见 `docs/RELEASE_CHECKLIST.md`

## 6. QA 用例

详见 `docs/QA_CASES.md`

## 7. Smoke 测试

```bash
npm run smoke:health   # Health & Ready 端点
npm run smoke:llm      # LLM provider 可用性
npm run smoke:chat     # SSE 流式聊天
npm run smoke:plan     # 规划管道
npm run smoke:all      # 全量测试
```
