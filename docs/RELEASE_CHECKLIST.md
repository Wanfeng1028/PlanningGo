# PlanningGo 发布清单

> 最后更新：2026-06-02
> 负责人：AI-5（质量闸门）

## 1. 配置

- [ ] `NODE_ENV=production`
- [ ] `CORS_ORIGINS` 为正式域名（非 localhost）
- [ ] `JWT_ACCESS_SECRET` 已替换为 ≥32 位随机强密钥
- [ ] `JWT_REFRESH_SECRET` 已替换为 ≥32 位随机强密钥
- [ ] `COOKIE_SECRET` 已替换为 ≥32 位随机强密钥
- [ ] `DATABASE_URL` 指向生产 PostgreSQL（非默认 localhost）
- [ ] `REDIS_URL` 指向生产 Redis（非 localhost/127.0.0.1）
- [ ] `MIMO_API_KEY`（或至少一个 LLM provider key）已配置
- [ ] `MIMO_BASE_URL` 已确认可达
- [ ] `MIMO_FLASH_MODEL` / `MIMO_PRO_MODEL` 已确认可用
- [ ] `AMAP_WEB_SERVICE_KEY` 已配置，或确认允许无地图降级
- [ ] `ENABLE_DEMO_AUTH=false`（生产禁止演示登录）
- [ ] `ENABLE_DEV_SANDBOX=false`（生产禁止开发者沙盒）
- [ ] `ALLOW_MOCK_PROVIDER_IN_PRODUCTION=false`（除非明确需要）
- [ ] `AUTO_EXECUTION_ALLOW_PAYMENT=false`（第一版禁止自动支付）
- [ ] `.env` 文件未提交到 git（确认 `.gitignore` 包含）

## 2. 构建

- [ ] `npm ci`（干净安装依赖）
- [ ] `npm run typecheck`（TypeScript 类型检查通过）
- [ ] `npm test`（所有单元测试通过）
- [ ] `npm run build`（前后端构建成功）

## 3. 接口验证

- [ ] `GET /api/health` → 200 `{ ok: true }`
- [ ] `GET /api/ready` → 200 `{ status: "ready" }` 或 503（DB/Redis 不可用时）
- [ ] `POST /api/agent/chat/stream` → SSE 流式响应 + `[DONE]`
- [ ] `POST /api/agent/plan` → 返回方案 JSON
- [ ] `POST /api/auth/register` → 注册成功或合理错误
- [ ] `POST /api/auth/login` → 登录成功返回 token
- [ ] 未认证访问受保护接口 → 401

## 4. 体验检查

- [ ] 桌面端首页可用（1920x1080）
- [ ] 移动端输入栏不遮挡（375px iPhone SE）
- [ ] LLM 错误返回可理解的中文提示（非 raw error）
- [ ] 方案卡片展示正常（标题、预算、行程）
- [ ] 历史记录正常加载
- [ ] SSE 连接断开后 loading 状态正确清除
- [ ] 无 F12 控制台报错（除预期的 dev warning）

## 5. 安全检查

- [ ] 无真实 API key 硬编码在源码中
- [ ] 无 production 环境使用 mock provider（除非显式允许）
- [ ] 无 LLM 失败静默 fallback 成模板内容
- [ ] SSE `[DONE]` 在正常和异常路径均发送
- [ ] 所有新增 env 变量已写入 `.env.example` 和 `.env.production.template`
- [ ] 生产 JWT 密钥不在已知弱密钥列表中
- [ ] Helmet CSP 已启用
- [ ] 速率限制已配置

## 6. 回滚方案

- [ ] 已备份上一版构建产物（`dist/` 目录）
- [ ] 可通过 `PLANNING_MODE=hybrid` 切换为混合模式
- [ ] 数据库迁移可回滚或无破坏性（检查 `prisma/migrations/`）
- [ ] Docker 镜像已打 tag，可快速回退
- [ ] 环境变量变更已记录

## 7. 上线后监控

- [ ] `/api/health` 持续返回 200
- [ ] `/api/ready` 持续返回 200
- [ ] LLM 调用成功率 > 95%
- [ ] SSE 连接无异常断开
- [ ] 错误日志无异常激增
