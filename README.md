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

## 端口说明

| 服务 | 地址 |
| --- | --- |
| 前端 | http://127.0.0.1:5173 |
| 后端 | http://127.0.0.1:3001 |
| 健康检查 | http://127.0.0.1:3001/api/health |
| 就绪检查 | http://127.0.0.1:3001/api/ready |

## 接口测试

```bash
# 健康检查（存活探针）
curl http://127.0.0.1:3001/api/health

# 就绪检查（组件状态）
curl http://127.0.0.1:3001/api/ready

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

## 健康检查与就绪检查

### `GET /api/health` — 存活探针

```json
{ "ok": true, "status": "ok", "timestamp": "2026-06-01T12:00:00.000Z" }
```

仅表示进程存活，不检查依赖。适合 K8s liveness probe。

### `GET /api/ready` — 就绪探针

```json
{
  "ok": true,
  "db": "ok",
  "redis": "ok",
  "llm": {
    "configured": true,
    "provider": "mimo",
    "model": "mimo-v2.5-pro",
    "mode": "llm"
  },
  "amap": { "configured": true },
  "mockAllowed": false,
  "uptime": 12345,
  "timestamp": "2026-06-01T12:00:00.000Z"
}
```

- `db` / `redis`：`ok` = 连接正常，`error` = 连接失败，`memory` = 未配置（降级为内存模式）
- `llm.configured`：是否有任何 LLM API Key 配置
- `llm.provider` / `llm.model`：当前使用的 Provider 和模型名称
- `llm.mode`：`AGENT_CHAT_MODE` 的值（`auto` / `llm` / `rule`）
- `amap.configured`：是否配置了高德地图 Key
- `mockAllowed`：生产环境下是否允许 mock provider
- `uptime`：进程运行秒数
- **不会泄露任何 API Key**

当 `db=error` 或 `redis=error` 时返回 503。适合 K8s readiness probe。

---

## 部署指南

### 一、本地开发

```bash
npm install
cp .env.example .env          # 默认 PLANNING_MODE=mock，零配置启动
npm run dev:api                # 终端 1：后端 :3001
npm run dev                    # 终端 2：前端 :5173
```

如需数据库：

```bash
npm run docker:up              # 启动 PostgreSQL + Redis
npm run db:generate
npm run db:migrate
npm run db:seed                # 导入测试账号
npm run dev:api
```

### 二、预发 / Staging 环境

```bash
# 1. 复制生产模板
cp .env.production.template .env.staging

# 2. 修改关键值
#    NODE_ENV=production（或 staging，如果需要区分）
#    CORS_ORIGINS=https://staging.example.com
#    DATABASE_URL=指向 staging 数据库
#    PLANNING_MODE=hybrid（推荐：LLM 优先，失败 fallback 到 mock）

# 3. 构建 & 启动
npm run build
NODE_ENV=production npm run start:api
```

### 三、生产部署

#### 步骤 1：配置环境变量

```bash
cp .env.production.template .env.production

# 生成强密钥
openssl rand -hex 32   # 生成 JWT_ACCESS_SECRET
openssl rand -hex 32   # 生成 JWT_REFRESH_SECRET
openssl rand -hex 32   # 生成 COOKIE_SECRET
```

编辑 `.env.production`，填入：
- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` / `COOKIE_SECRET`
- `DATABASE_URL`（指向生产 PostgreSQL）
- `REDIS_URL`（指向生产 Redis）
- `CORS_ORIGINS` / `PUBLIC_APP_URL`（正式域名）
- `AMAP_WEB_SERVICE_KEY`（高德地图 Key）
- 至少一个 LLM Provider 的 API Key（推荐 `MIMO_API_KEY`）

#### 步骤 2：构建

```bash
npm run build
```

#### 步骤 3：启动

选择以下任一方式启动。

---

### 方案 A：PM2 + Nginx

#### PM2 启动

```bash
# 安装 PM2
npm install -g pm2

# 加载 .env.production 并启动
pm2 start dist/server/index.js --name planninggo-api --env production

# 查看日志
pm2 logs planninggo-api

# 重启 / 停止
pm2 restart planninggo-api
pm2 stop planninggo-api

# 设置开机自启
pm2 startup
pm2 save
```

#### Nginx 反代配置

```nginx
server {
    listen 80;
    server_name example.com;

    # 强制 HTTPS（建议）
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name example.com;

    ssl_certificate     /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;

    # 前端静态文件
    root /path/to/planninggo/dist;
    index index.html;

    # 带 hash 的静态资源 — 长期缓存
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # API 反代到后端
    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

---

### 方案 B：Docker Compose（推荐）

```bash
# 1. 创建 .env 文件（Docker Compose 自动读取）
cat > .env << 'EOF'
POSTGRES_PASSWORD=your-strong-db-password
REDIS_PASSWORD=your-strong-redis-password
JWT_ACCESS_SECRET=$(openssl rand -hex 32)
JWT_REFRESH_SECRET=$(openssl rand -hex 32)
COOKIE_SECRET=$(openssl rand -hex 32)
AMAP_WEB_SERVICE_KEY=your-amap-key
QWEN_API_KEY=your-qwen-key
CORS_ORIGINS=https://example.com
EOF

# 2. 启动
docker compose -f docker-compose.prod.yml up -d

# 3. 查看日志
docker compose -f docker-compose.prod.yml logs -f api

# 4. 检查健康状态
curl http://localhost:3001/api/ready

# 5. 停止
docker compose -f docker-compose.prod.yml down

# 6. 更新部署（重新构建）
docker compose -f docker-compose.prod.yml up -d --build
```

---

### 方案 C：简单 Docker

```bash
# 构建镜像
docker build -t planninggo .

# 运行
docker run -d \
  --name planninggo-api \
  -p 3001:3001 \
  --env-file .env.production \
  planninggo
```

---

## 确认 MiMo 作为 LLM Provider

1. **检查 /api/ready**：

```bash
curl -s http://localhost:3001/api/ready | jq '.llm'
# 期望输出：
# { "configured": true, "provider": "mimo", "model": "mimo-v2.5-pro", "mode": "llm" }
```

2. **设置 `LLM_PROVIDER_PRIORITY=mimo`**：确保 MiMo 优先级最高。

3. **查看启动日志**：

```bash
# PM2
pm2 logs planninggo-api --lines 20

# Docker
docker compose logs api | head -30
```

4. **查看 LLM 调用日志**（需开启 `ENABLE_TOOL_LOGS=true`）：

```bash
# 查看最近的 LLM 调用记录
curl http://localhost:3001/api/developer/request-logs?path=/api/agent
```

---

## 回滚到 Hybrid / Demo 模式

如果生产环境 LLM 出现问题，可以快速回滚：

### 方式 1：切换到 Hybrid 模式（LLM 优先，失败自动 fallback）

```bash
# 修改 .env.production
PLANNING_MODE=hybrid
ENABLE_LLM_FALLBACK=true

# 重启服务
pm2 restart planninggo-api
# 或
docker compose -f docker-compose.prod.yml restart api
```

### 方式 2：临时允许 Mock（紧急回退）

```bash
# 修改 .env.production
PLANNING_MODE=mock
ALLOW_MOCK_PROVIDER_IN_PRODUCTION=true

# 重启服务
pm2 restart planninggo-api
```

⚠️ **注意**：`ALLOW_MOCK_PROVIDER_IN_PRODUCTION=true` 会使用 mock 数据，仅作为紧急回退手段。问题修复后应尽快切回 `llm` 或 `hybrid`。

### 方式 3：切换到其他 LLM Provider

```bash
# 修改 .env.production
LLM_PROVIDER_PRIORITY=deepseek   # 切换到 DeepSeek
DEEPSEEK_API_KEY=your-key

# 或切换到 Qwen
LLM_PROVIDER_PRIORITY=qwen
QWEN_API_KEY=your-key

# 重启
pm2 restart planninggo-api
```

---

## 生产安全校验

启动时会自动校验以下规则，不满足则启动失败：

| 条件 | 要求 |
| --- | --- |
| `NODE_ENV=production` | `JWT_ACCESS_SECRET` 必须 ≥32 位且非默认值 |
| `NODE_ENV=production` | `JWT_REFRESH_SECRET` 必须 ≥32 位且非默认值 |
| `NODE_ENV=production` | `COOKIE_SECRET` 必须 ≥32 位 |
| `NODE_ENV=production` | `DATABASE_URL` 不能是默认本地地址 |
| `NODE_ENV=production` | `REDIS_URL` 不能是 localhost |
| `NODE_ENV=production` | `ENABLE_DEMO_AUTH` 必须为 false |
| `PLANNING_MODE=llm` | 必须至少配置一个 LLM API Key |
| `AGENT_CHAT_MODE=llm` | 必须至少配置一个 LLM API Key |
| `PLANNING_MODE=mock` + production | 需设置 `ALLOW_MOCK_PROVIDER_IN_PRODUCTION=true` |

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

**生产环境启动报 "弱 JWT 密钥"**
→ 使用 `openssl rand -hex 32` 生成强密钥，填入 `JWT_ACCESS_SECRET` 和 `JWT_REFRESH_SECRET`。

**生产环境启动报 "未配置任何 LLM API Key"**
→ `PLANNING_MODE=llm` 或 `AGENT_CHAT_MODE=llm` 时必须配置至少一个 LLM Provider。切换到 `hybrid` 或配置 Key。

**如何确认当前走的是哪个 LLM Provider？**
→ `curl http://localhost:3001/api/ready | jq '.llm'`，查看 `provider` 和 `model` 字段。

**/api/ready 返回 503**
→ `db` 或 `redis` 状态为 `error`。检查数据库和 Redis 连接是否正常。

## 密码重置

- `POST /api/auth/forgot-password` — 请求密码重置（发送重置链接）
- `POST /api/auth/reset-password` — 使用重置令牌设置新密码
- 前端登录页有「忘记密码？」入口

## Sentry 错误追踪

前端已集成 Sentry 骨架代码（`src/lib/sentry.ts`），安装即可启用：

```bash
npm add @sentry/react
```

环境变量：
- `VITE_SENTRY_DSN` — Sentry DSN
- `SENTRY_DSN` — 后端 Sentry DSN
- `SENTRY_ENVIRONMENT` — 环境名称（production/staging）

## 生产配置模板

```bash
cp .env.production.template .env.production
# 填入真实 API Keys 和数据库配置
```

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

## 当前执行能力边界

PlanningGo 的"可执行服务入口"采用 **AI 代选 + 下单草稿 + 第三方确认入口** 的设计模式，确保用户始终清楚当前处于"草稿"阶段而非"已下单"状态。

### 核心原则

| 原则 | 说明 |
| --- | --- |
| 不冒充已下单 | 所有文案禁止出现"预约成功""下单成功""支付成功"，只写"已生成下单草稿""请前往平台确认" |
| 状态机约束 | 所有交易类 action 状态只能是：`prepared` / `redirect_required` / `redirected_to_payment` / `waiting_external_confirm` |
| 入口必须有反馈 | 所有用户可点击入口必须有 toast、modal、跳转、复制成功或错误提示 |
| 渐进式接入 | 真实 API 后续接入时只替换 connector，不大改前端和业务流程 |

### 当前支持的服务类型

| 步骤类型 | 生成的服务入口 | 提供商 |
| --- | --- | --- |
| 用餐 (meal) | 查看餐厅 / 复制下单信息 | 大众点评 / 美团 |
| 咖啡 (coffee) | 查看咖啡 / 下单草稿 | 美团 |
| 电影 (movie) | 电影票 / 导航 | 美团 / 高德 |
| 活动 (activity) | 导航 / 团购 | 高德 / 美团 |
| 通用 (generic) | 导航 / 复制 | 高德 / 复制 |

### 下单草稿弹窗

当用户点击"下单草稿"类入口时，会弹出 OrderDraftModal，展示：
- 门店名称和地址
- 推荐商品清单（含数量和预估价格）
- 预估总价
- 风险提示："当前还没有直接接入平台支付，请在第三方页面确认..."
- 操作按钮：复制下单信息、去平台确认、稍后再说

### API 端点

| 端点 | 方法 | 说明 |
| --- | --- | --- |
| `/api/service-actions/prepare` | POST | 准备服务入口，生成 deep link 或 copy text |
| `/api/actions/track` | POST | 埋点追踪用户点击行为 |

### 深度链接

系统通过 deepLinks 模块生成各平台的深度链接：
- **美团/点评**：`https://i.meituan.com/s/{poiName}`
- **饿了么**：`https://waimai.meituan.com/order/{poiName}`
- **高德地图**：`https://www.amap.com/search?query={poiName}`

## 演示模式

PlanningGo 支持演示模式，方便在比赛、演示或测试场景中快速展示核心功能。

### 启用演示模式

```bash
# 修改 .env 或启动时设置
export DEMO_MODE=true
export PLANNING_MODE=mock
```

### 演示场景按钮

启用演示模式后，首页会显示 3 个预设演示场景卡片：

| 场景 | 说明 | 示例 Prompt |
| --- | --- | --- |
| 👨‍👩‍👧 家庭周末半日游 | 亲子友好，轻松半日游 | "这周六带老婆和6岁儿子在杭州周边玩半天..." |
| 💑 情侣约会 | 浪漫约会，电影+咖啡+晚餐 | "这周日和女朋友在杭州约会一天，想要浪漫一点..." |
| 🎉 朋友聚会 | 4人聚会，娱乐+火锅 | "这周六和三个朋友在杭州聚会，想要有趣的活动..." |

点击场景卡片会自动创建会话并填入对应 prompt。

### 工具链路可视化

聊天过程中，右上角会显示"工具链路"面板，实时展示 Agent 的执行步骤：
- 意图解析（人群、时间、城市、预算）
- POI 搜索（高德地图 API）
- 候选方案生成
- 评分排序
- 时间线规划

### 预约失败模拟

通过 `MOCK_BOOKING_FAILURES` 环境变量模拟 3 种预约失败场景：

```bash
# 模拟餐厅/活动无座位
export MOCK_BOOKING_FAILURES=no_seat

# 模拟景点门票售罄
export MOCK_BOOKING_FAILURES=no_ticket

# 模拟时间冲突
export MOCK_BOOKING_FAILURES=time_conflict

# 组合模拟
export MOCK_BOOKING_FAILURES=no_seat,no_ticket
```

失败时：
- 方案卡片显示风险标签（红色）
- 工具链路面板显示降级决策
- Agent 推荐备选方案

### 延迟模拟

```bash
# 所有 POI 搜索和 booking 操作延迟 2 秒
export MOCK_LATENCY_MS=2000
```

### 完整演示启动命令

```bash
# 终端 1：启动后端
DEMO_MODE=true PLANNING_MODE=mock MOCK_BOOKING_FAILURES=no_seat npm run dev:api

# 终端 2：启动前端
npm run dev

# 浏览器访问 http://localhost:5173
```

详细演示脚本请参考 [DEMO_SCRIPT.md](./DEMO_SCRIPT.md)。

---

## 项目标签

`本地生活` `周末规划` `AI Agent` `行程安排` `多人协作` `路线规划` `预约执行` `家庭出行` `朋友聚会` `雨天备选`

## License

本项目基于仓库内 License 文件授权使用。
