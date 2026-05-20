# PlanningGo / 周末有谱

![PlanningGo](design/01.png)

![Local Life](https://img.shields.io/badge/Local%20Life-Weekend%20Planning-ffcc33?style=for-the-badge&labelColor=111213)
![Agent](https://img.shields.io/badge/AI%20Agent-Plan%20%26%20Execute-111213?style=for-the-badge&labelColor=ffcc33)
![Status](https://img.shields.io/badge/Status-Demo%20Ready-27ae60?style=for-the-badge)
![Language](https://img.shields.io/badge/Language-Chinese-3b7f8f?style=for-the-badge)

**周末有谱** 是一个面向本地生活的周末活动规划 Agent。
它不只是给你推荐地点，而是把「想去哪、和谁去、预算多少、天气如何、要不要排队、能不能预订、怎么分享给家人朋友」这些麻烦事串成一条可执行的计划。

你只需要输入一句话，它会帮你拆解需求、生成多套方案、处理约束、给出路线、提醒授权边界，并把最终计划变成可以执行和分享的周末安排。

## 核心亮点

| 能力 | 说明 |
| --- | --- |
| 一句话规划 | 用自然语言描述周末需求，系统自动理解时间、预算、同行人、偏好和限制条件。 |
| 多方案对比 | 生成不同风格的活动方案，例如家庭低负担、朋友轻社交、雨天室内备选。 |
| 路线与时间线 | 把地点、交通、用餐和活动串成清晰的行程顺序。 |
| 可执行安排 | 支持预约、提醒、分享、投票、反馈修改等完整流程演示。 |
| 记忆沉淀 | 根据反馈沉淀偏好，下次规划时减少重复确认。 |
| 失败兜底 | 天气变化、排队过长、预算冲突或预约失败时，给出替代方案。 |
| 智能工具调用 | 并行调用高德地图 API 查询 POI、路线、天气，提升规划准确度。 |
| 自动执行引擎 | 用户授权后自动生成导航、日历提醒、分享链接和预约草稿。 |
| 移动端接续 | 桌面端生成方案后，手机扫码继续授权、定位、导航和执行。 |
| 城市安全约束 | 所有工具调用和输出都受城市约束，防止混入其他城市信息。 |
| 工具预算控制 | Flash/Pro 模式自动控制工具调用次数和延迟，保证响应速度。 |
| 完整可观测性 | 记录工具调用、LLM 调用、用户事件和错误日志，便于排查问题。 |

## 快速开始

### 环境要求

- Node.js >= 20
- npm >= 10
- PostgreSQL 16（可选，mock 模式不需要）
- Redis 7（可选，mock 模式不需要）

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
```

默认配置使用 `PLANNING_MODE=mock`，无需 LLM Key、高德 Key 或数据库即可启动。

### 3. 启动后端

```bash
npm run dev:api
```

后端启动后监听 `http://127.0.0.1:3001`。

### 4. 启动前端

```bash
npm run dev
```

前端启动后访问 `http://127.0.0.1:5173`。

### 快速 Mock 模式（零配置）

不需要数据库、Redis 或任何 API Key：

```bash
npm install
cp .env.example .env
npm run dev:api   # 终端 1：启动后端
npm run dev       # 终端 2：启动前端
```

## 完整本地部署（含数据库）

```bash
# 1. 启动 PostgreSQL 和 Redis
npm run docker:up

# 2. 生成 Prisma Client
npm run db:generate

# 3. 执行数据库迁移
npm run db:migrate

# 4. 导入种子数据（demo 用户 + 管理员）
npm run db:seed

# 5. 启动后端
npm run dev:api

# 6. 启动前端
npm run dev
```

种子数据中的测试账号：
- 邮箱：`xiaoming@example.com`，密码：`weekend123`
- 邮箱：`admin@planninggo.com`，密码：`admin123`

## 生产构建

```bash
# 构建后端（TypeScript -> dist/server/）+ 前端（Vite -> dist/）
npm run build

# 启动生产后端
npm run start:api
```

构建产物：
- 后端：`dist/server/index.js`
- 前端：`dist/`（Vite 静态资源）

## Docker 部署

```bash
# 启动所有服务（PostgreSQL + Redis + API）
docker compose up -d

# 查看日志
docker compose logs -f api

# 停止
docker compose down
```

## 端口说明

| 服务 | 地址 |
| --- | --- |
| 前端 | http://127.0.0.1:5173 |
| 后端 | http://127.0.0.1:3001 |
| 健康检查 | http://127.0.0.1:3001/api/health |

## 接口测试

```bash
# 健康检查
curl http://127.0.0.1:3001/api/health

# 登录
curl -X POST http://127.0.0.1:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"xiaoming@example.com","password":"weekend123"}'

# 游客访问
curl -X POST http://127.0.0.1:3001/api/auth/guest \
  -H "Content-Type: application/json" \
  -d '{}'

# 规划（mock 模式）
curl -X POST http://127.0.0.1:3001/api/agent/plan \
  -H "Content-Type: application/json" \
  -d '{"prompt":"明天带娃半天，预算300","city":"上海","modelMode":"flash"}'

# 逆地理编码
curl "http://127.0.0.1:3001/api/location/reverse-geocode?lat=31.2304&lng=121.4737"

# 美团登录状态
curl http://127.0.0.1:3001/api/auth/meituan/start
```

## 常见问题

**后端启动报错 "ECONNREFUSED"**
→ PostgreSQL 或 Redis 未启动。运行 `npm run docker:up` 或确认本地服务已运行。

**端口不一致**
→ 项目统一使用后端 `3001`、前端 `5173`。如需修改，在 `.env` 中设置 `PORT` 和 `VITE_API_BASE`。

**高德 Key 未配置**
→ 定位功能会使用 fallback 模式，返回低可信度城市匹配，页面会提示用户确认城市。不影响核心功能。

**PLANNING_MODE=mock 不需要 LLM Key**
→ mock 模式使用本地生成的方案数据，不调用任何 LLM API。

**美团登录未配置**
→ 返回 `configured: false`，不影响其他登录方式（邮箱、游客）。

**npm run build 失败**
→ 确保 TypeScript 版本 >= 5.9。运行 `npm run typecheck` 查看具体错误。

## 服务器部署建议

### 方案一：Nginx + PM2

```bash
# 1. 构建
npm install
npm run build

# 2. 使用 PM2 启动后端
pm2 start dist/server/index.js --name planninggo-api

# 3. Nginx 配置
# 前端静态文件指向 dist/
# /api/* 反代到 http://127.0.0.1:3001
```

### 方案二：Docker Compose

```bash
# 配置 .env 中的生产变量
# JWT_ACCESS_SECRET / JWT_REFRESH_SECRET 必须替换为强密钥
# CORS_ORIGINS 设置为正式域名
docker compose up -d
```

### 生产注意事项

- JWT Secret 必须使用强随机字符串，不能使用默认值
- CORS_ORIGINS 只允许正式域名
- 数据库和 Redis 不要暴露公网
- 建议使用 Cloudflare 或 Let's Encrypt 配置 HTTPS

## 页面模块

- **首页**：产品价值、Demo 主线、方案预览、能力入口。
- **功能**：需求对话、定位约束、方案生成、路线预订、授权执行。
- **场景案例**：家庭、朋友、情侣、雨天、亲子低负担、晚出发压缩。
- **开发者**：工具日志、质量看板、接口能力和调试信息。
- **个人中心**：登录注册、画像、通知、隐私和记忆管理。

## 后端架构

PlanningGo 后端采用模块化 Agent 架构，包含以下核心模块：

### 工具层 (Tools Layer)
- **工具注册中心**：统一管理所有工具（AMap、内部工具等）
- **工具执行器**：支持并行工具调用，带预算控制和超时管理
- **AMap 集成**：POI 搜索、路线规划、天气查询、地理编码
- **内部工具**：用户画像、记忆管理、预约查询

### 中间件护栏 (Middleware Guards)
- **城市约束**：确保所有工具调用和输出都在目标城市内
- **工具预算**：Flash/Pro 模式自动控制工具调用次数和延迟
- **输出安全**：检查最终方案是否混入其他城市信息
- **权限控制**：自动执行前检查用户授权范围
- **追踪管理**：为所有操作添加 traceId 便于排查

### Agent Runtime
- **意图解析**：从自然语言中提取时间、预算、同行人、偏好
- **上下文构建**：聚合用户画像、环境数据和安全策略
- **工具编排**：并行调用工具生成候选 POI 池
- **方案生成**：基于候选池生成多个可执行方案
- **执行动作**：为方案生成预约、导航、日历、分享等可执行动作

### 自动执行引擎 (Execution Engine)
- **状态机**：proposed → prepared → waiting_authorization → authorized → executing → succeeded/failed
- **幂等性**：每个动作都有 idempotencyKey，防止重复执行
- **执行提供者**：导航、日历、分享、预约等外部服务集成
- **权限服务**：管理用户授权范围和执行权限

### 移动端接续 (Mobile Handoff)
- **QR 码生成**：桌面端生成方案后显示二维码
- **接续令牌**：安全的令牌机制，5分钟有效期
- **会话同步**：桌面端和手机端共享同一方案和执行状态
- **设备管理**：跟踪用户设备，支持跨设备继续执行

### 可观测性 (Observability)
- **工具调用日志**：记录所有工具调用的输入、输出、延迟
- **LLM 调用日志**：记录 LLM 调用的 token 使用、延迟、状态
- **用户事件日志**：记录用户行为和页面访问
- **错误日志**：记录客户端和服务器端错误

## 项目标签

`本地生活` `周末规划` `AI Agent` `行程安排` `多人协作` `路线规划` `预约执行` `家庭出行` `朋友聚会` `雨天备选`

## License

本项目基于仓库内 License 文件授权使用。
