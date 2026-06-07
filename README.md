# 🗺️ 周末去哪儿

> **AI 驱动的本地生活周末规划 Agent — 一句话生成可执行的周末计划**

<div align="center">
  <img src="https://raw.githubusercontent.com/Wanfeng1028/PlanningGo/main/public/design/01.png" alt="周末去哪儿 Screenshot" width="800" />
  <br/>
  <a href="https://github.com/Wanfeng1028/PlanningGo/blob/main/public/planninggo-demo.mp4">🎬 查看完整演示视频 (MP4)</a>
</div>

![Local Life](https://img.shields.io/badge/Local%20Life-Weekend%20Planning-ffcc33?style=for-the-badge&labelColor=111213)
![AI Agent](https://img.shields.io/badge/AI%20Agent-Plan%20%26%20Execute-111213?style=for-the-badge&labelColor=ffcc33)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-%233178C6?style=for-the-badge&logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-19-%2361DAFB?style=for-the-badge&logo=react&logoColor=black)
![Fastify](https://img.shields.io/badge/Fastify-5.8-%23000000?style=for-the-badge&logo=fastify&logoColor=white)
![Status](https://img.shields.io/badge/Status-Demo%20Ready-27ae60?style=for-the-badge)
![Tests](https://img.shields.io/badge/Tests-454%20passing-3b7f8f?style=for-the-badge)

---

## 📖 项目简介

**周末去哪儿** 是一个面向本地生活的周末活动规划 Agent。它不只是给你推荐地点，而是把「想去哪、和谁去、预算多少、天气如何、要不要排队、能不能预订、怎么分享给家人朋友」这些麻烦事串成一条**可执行的计划**。

你只需要输入一句话，它会帮你拆解需求、生成多套方案、处理约束、给出路线、提醒授权边界，并把最终计划变成可以执行和分享的周末安排。

### ✨ 核心亮点

| 能力 | 说明 |
| --- | --- |
| 💬 一句话规划 | 用自然语言描述周末需求，系统自动理解时间、预算、同行人、偏好和限制条件 |
| 📋 多方案对比 | 生成不同风格的活动方案 — 家庭低负担、朋友轻社交、雨天室内备选 |
| 🗺️ 路线与时间线 | 把地点、交通、用餐和活动串成清晰的行程顺序 |
| ✅ 可执行安排 | 支持预约、提醒、分享、投票、反馈修改等完整流程演示 |
| 🧠 记忆沉淀 | 根据反馈沉淀偏好，下次规划时减少重复确认 |
| 🔄 失败兜底 | 天气变化、排队过长、预算冲突或预约失败时，给出替代方案 |
| 🔧 智能工具调用 | 并行调用地图 API 查询 POI、路线、天气，提升规划准确度 |
| ⚡ 自动执行引擎 | 用户授权后自动生成导航、日历提醒、分享链接和预约草稿 |
| 📱 移动端接续 | 桌面端生成方案后，手机扫码继续授权、定位、导航和执行 |
| 🛡️ 城市安全约束 | 所有工具调用和输出都受城市约束，防止混入其他城市信息 |
| 💰 工具预算控制 | Flash/Pro 模式自动控制工具调用次数和延迟，保证响应速度 |
| 📊 完整可观测性 | 记录工具调用、LLM 调用、用户事件和错误日志，便于排查问题 |

---

## 🚀 快速开始

### 环境要求

| 依赖 | 版本 | 说明 |
| --- | --- | --- |
| Node.js | >= 20 | 运行时环境 |
| npm | >= 10 | 包管理器 |
| PostgreSQL | 16 | 可选，Mock 模式不需要 |
| Redis | 7 | 可选，Mock 模式不需要 |

### 方式一：零配置 Mock 模式 ⚡

不需要数据库、Redis 或任何 API Key：

```bash
# 1. 安装依赖
npm install

# 2. 复制环境变量（默认 PLANNING_MODE=mock）
cp .env.example .env

# 3. 启动（两个终端）
npm run dev:api   # 终端 1：后端 :3001
npm run dev       # 终端 2：前端 :5173
```

### 方式二：完整本地部署（含数据库）🐳

```bash
# 1. 启动 PostgreSQL 和 Redis
npm run docker:up

# 2. 数据库初始化
npm run db:generate && npm run db:migrate && npm run db:seed

# 3. 启动服务
npm run dev:api   # 终端 1
npm run dev       # 终端 2
```

> **测试账号**：`xiaoming@example.com` / `weekend123` 或 `admin@planninggo.com` / `admin123`

---

## 📸 功能预览

<details>
<summary><b>👨‍👩‍👧 家庭周末半日游</b> — 点击展开</summary>

![家庭场景](public/design/02.png)

亲子友好，轻松半日游。系统自动推荐适合带娃的地点，考虑休息时间、餐饮需求和预算控制。

</details>

<details>
<summary><b>💑 情侣约会</b> — 点击展开</summary>

![情侣场景](public/design/03.png)

浪漫约会，电影 + 咖啡 + 晚餐。系统根据偏好推荐氛围餐厅和适合散步的商圈。

</details>

<details>
<summary><b>🎉 朋友聚会</b> — 点击展开</summary>

![朋友场景](public/design/04.png)

4 人聚会，娱乐 + 火锅。系统考虑多人偏好平衡，推荐适合聚会的场所和活动时间线。

</details>

<details>
<summary><b>🌧️ 雨天备选方案</b> — 点击展开</summary>

![雨天场景](public/design/05.png)

天气突变？系统自动切换室内活动，推荐博物馆、商场、咖啡馆等室内场所。

</details>

<details>
<summary><b>🗺️ 地图路线规划</b> — 点击展开</summary>

![地图场景](public/design/06.png)

可视化展示活动地点、路线规划和交通方式，支持 OpenStreetMap 和高德地图双引擎。

</details>

---

## 🏗️ 技术栈

### 前端

| 技术 | 版本 | 用途 |
| --- | --- | --- |
| React | 19.2 | UI 框架（函数组件 + Hooks） |
| TypeScript | 5.9 | 类型安全 |
| Vite | 8.0 | 构建工具 |
| SCSS + CSS Modules | sass 1.94 | 样式系统（不使用 Tailwind） |
| Framer Motion | 12.23 | 页面过渡 + 元素动画 |
| Leaflet | 1.9 | 开源地图（OSM 瓦片） |
| 高德 JS API | @amap/amap-jsapi-loader | 可选地图引擎 |
| Lucide React | 0.555 | 图标库 |
| marked | 18.0 | Markdown 渲染（AI 回复） |
| Zod | 4.4 | 运行时 schema 校验 |
| DOMPurify | 3.4 | XSS 防护 |
| qrcode | 1.5 | QR 码生成（移动端接续） |

**15 个页面**：HomePage · FeaturesPage · FlowPage · CasesPage · DesignReviewPage · DevelopersPage · ProfilePage · ProfileGatePage · HandoffPage · AuthModal · Modal · BottomTabs · NavBar · RealMap · RouteMap

### 后端

| 技术 | 版本 | 用途 |
| --- | --- | --- |
| Fastify | 5.8 | 高性能 Node.js 框架 |
| Prisma | 7.8 | 类型安全 ORM |
| PostgreSQL | 16 | 主数据库（40+ 模型） |
| Redis | 7 | 会话/缓存（ioredis 5.10） |
| JWT | jsonwebtoken 9.0 | Access + Refresh Token |
| bcryptjs | 3.0 | 密码哈希 |
| Helmet | @fastify/helmet 13 | HTTP 安全头（CSP/X-Frame） |
| CORS | @fastify/cors 11 | 跨域 |
| Rate Limit | @fastify/rate-limit 10 | 请求限流 |
| Pino | 10.3 | 结构化日志 |

**23 个路由** · **6 个 Fastify 插件** · **16 个公共工具**

### AI / Agent 架构

#### 多 LLM Provider 路由（12 个）

| Provider | 环境变量 | Tool Calling | 说明 |
| --- | --- | --- | --- |
| OpenAI | `OPENAI_API_KEY` | ✅ | 默认首选 |
| Qwen 通义千问 | `QWEN_API_KEY` | ✅ | 阿里云 DashScope |
| DeepSeek | `DEEPSEEK_API_KEY` | ✅ | |
| Moonshot | `MOONSHOT_API_KEY` | ✅ | |
| Groq | `GROQ_API_KEY` | ✅ | |
| Gemini | `GEMINI_API_KEY` | ✅ | OpenAI 兼容端点 |
| 豆包 Doubao | `DOUBAO_API_KEY` | ❌ | Volcengine |
| MiMo 小米 | `MIMO_API_KEY` | ✅ | 推荐生产用 |
| LongCat 美团 | `LONGCAT_API_KEY` | ❌ | |
| Claude | `CLAUDE_API_KEY` | ✅ | Anthropic（adapter） |
| Grok | `GROK_API_KEY` | ✅ | xAI（adapter） |
| Custom | `CUSTOM_API_KEY` | ✅ | 自定义 OpenAI 兼容 |

**路由策略**：`LLM_PROVIDER_PRIORITY` 指定优先级，`auto` 自动检测有 Key 的 Provider；Flash/Pro 双模型模式；支持流式/非流式/Tool Calling

#### Agent Pipeline（主流程）

```
intent → context → candidates → score → plan → enrich → route → validate → repair → suggestions → actions
```

| 模块 | 职责 |
| --- | --- |
| **意图解析** | 从自然语言提取时间/预算/同行人/城市/偏好 |
| **上下文构建** | 聚合用户画像 + 天气数据 + 安全策略 |
| **候选生成** | 并行调用工具生成候选 POI 池 |
| **方案生成** | 基于候选池生成多个可执行方案 |
| **方案修复** | 时间窗/完整链路/无座/预算冲突修复 |
| **对话路由** | Agent Chat 交互（rule/llm 双模式） |

#### 中间件护栏（5 个）

| 中间件 | 职责 |
| --- | --- |
| 城市约束 | 确保所有工具调用和输出在目标城市内 |
| 工具预算 | Flash/Pro 模式控制调用次数/轮数/延迟 |
| 输出安全 | 检查输出是否混入其他城市信息 |
| 权限控制 | 自动执行前检查用户授权范围 |
| 追踪 | TraceId 注入 |

#### 工具系统

| 类别 | 工具 |
| --- | --- |
| **AMAP 工具** | POI 搜索 · 路线规划 · 天气查询 · 地理编码 · 响应缓存 |
| **内部工具** | 用户记忆管理 · 用户画像 · 预约查询 |
| **动作工具** | 导航 · 日历 · 分享 · 预约 · 咖啡下单 · 餐厅预约 · 打车深链 · 美团搜索 · 大众点评搜索 · 电话预约 |

#### 执行引擎

**状态机**：`proposed → quoted → prepared → waiting_user_confirm → redirect_required → redirected_to_payment → waiting_external_confirm → external_confirmed → executing → succeeded / ics_generated`

**5 个执行提供者**：预约 · 日历 · Mock · 导航 · 分享

#### 移动端接续

QR 码生成 · SHA256 接续令牌（TTL 可配置，默认 300s） · 桌面/手机会话同步

#### 可观测性

工具调用日志 · LLM 调用日志 · 用户事件日志 · 客户端/服务端错误日志

### 部署 & 运维

| 技术 | 说明 |
| --- | --- |
| Docker Compose | 开发/生产双配置，内部网络隔离 |
| Dockerfile | 多阶段构建（node:20-alpine），安全用户 UID 1001 |
| PM2 + Nginx | 生产进程管理 + SSL 终止 + API 反代 |
| Vitest | 单元测试（3.2） |
| Playwright | E2E 测试（1.60，Chromium） |
| autocannon | HTTP 负载测试 |

---

## 📐 架构概览

### Agent Pipeline 执行流程

```
用户输入 → 意图解析 → 上下文构建 → 候选生成 → 方案生成 → 方案修复 → 授权执行 → 分享协作
   │         │          │           │          │          │          │          │
   ▼         ▼          ▼           ▼          ▼          ▼          ▼          ▼
 "带娃半天  提取时间/   用户画像+   并行查询   多方案      无座/预算   导航/日历   生成分享
  预算300"   预算/偏好   天气+策略   POI/天气   评分排序    冲突修复    分享链接   链接 & 投票
```

### 核心模块

<details>
<summary><b>🔧 工具系统 (Tools System)</b></summary>

- **工具注册中心**：按名称注册/检索，按风险级别过滤（read/write/external_action），每个工具定义 name/description/riskLevel/budgetCost/timeoutMs/inputSchema/outputSchema/execute
- **AMAP 工具**：POI 搜索 · 路线规划 · 天气查询 · 地理编码 · 响应缓存
- **内部工具**：用户记忆管理 · 用户画像 · 预约查询
- **动作工具**：导航 · 日历 · 分享 · 预约 · 咖啡下单 · 餐厅预约 · 打车深链 · 美团搜索 · 大众点评搜索 · 电话预约

</details>

<details>
<summary><b>🛡️ 中间件护栏 (Middleware Guards)</b></summary>

- **城市约束**：确保所有工具调用和输出都在目标城市内
- **工具预算**：Flash/Pro 模式自动控制工具调用次数、轮数和延迟
- **输出安全**：检查最终方案是否混入其他城市信息
- **权限控制**：自动执行前检查用户授权范围
- **追踪**：TraceId 注入

</details>

<details>
<summary><b>🤖 Agent Runtime</b></summary>

- **意图解析**：从自然语言中提取时间、预算、同行人、城市、偏好
- **上下文构建**：聚合用户画像、环境数据（天气）和安全策略
- **候选生成**：并行调用工具生成候选 POI 池
- **方案生成**：基于候选池生成多个可执行方案
- **方案修复**：时间窗/完整链路/无座/预算冲突修复
- **对话路由**：Agent Chat 交互（rule/llm 双模式）

</details>

<details>
<summary><b>⚡ 执行引擎 (Execution Engine)</b></summary>

- **状态机**：`proposed → quoted → prepared → waiting_user_confirm → redirect_required → redirected_to_payment → waiting_external_confirm → external_confirmed → executing → succeeded / ics_generated`
- **幂等性**：每个动作都有 idempotencyKey，防止重复执行
- **5 个执行提供者**：预约 · 日历 · Mock · 导航 · 分享

</details>

<details>
<summary><b>📱 移动端接续 (Mobile Handoff)</b></summary>

- **QR 码生成**：桌面端生成方案后显示二维码
- **接续令牌**：SHA256 哈希，TTL 可配置（默认 300s）
- **会话同步**：桌面端和手机端共享同一方案和执行状态

</details>

<details>
<summary><b>📊 可观测性 (Observability)</b></summary>

- **工具调用日志**：记录所有工具调用的输入、输出、延迟
- **LLM 调用日志**：记录 LLM 调用的 token 使用、延迟、状态
- **用户事件日志**：记录用户行为和页面访问
- **错误日志**：记录客户端和服务器端错误

</details>

<details>
<summary><b>🗺️ 地图集成 (Maps Integration)</b></summary>

- **Leaflet + OSM**：开源地图，支持瓦片/搜索/逆地理/路线规划
- **高德地图**：POI 搜索 · 路线规划 · 天气查询 · 地理编码
- **地图切换器**：支持 OpenStreetMap 和高德地图双引擎切换

</details>

<details>
<summary><b>🔌 外部服务连接器 (Connectors)</b></summary>

- **AMap Connector**：高德地图服务
- **Calendar Connector**：日历事件创建
- **Meituan Connector**：美团预约/搜索（OAuth）

</details>

---

## 🎮 演示模式

周末去哪儿 支持演示模式，方便在比赛、演示或测试场景中快速展示核心功能。

### 启用演示模式

```bash
export DEMO_MODE=true
export PLANNING_MODE=mock
```

### 演示场景

| 场景 | 说明 | 示例 Prompt |
| --- | --- | --- |
| 👨‍👩‍👧 家庭周末半日游 | 亲子友好，轻松半日游 | "这周六带老婆和 6 岁儿子在杭州周边玩半天..." |
| 💑 情侣约会 | 浪漫约会，电影 + 咖啡 + 晚餐 | "这周日和女朋友在杭州约会一天，想要浪漫一点..." |
| 🎉 朋友聚会 | 4 人聚会，娱乐 + 火锅 | "这周六和三个朋友在杭州聚会，想要有趣的活动..." |

### 预约失败模拟

```bash
# 模拟餐厅/活动无座位
export MOCK_BOOKING_FAILURES=no_seat

# 模拟景点门票售罄
export MOCK_BOOKING_FAILURES=no_ticket

# 模拟时间冲突
export MOCK_BOOKING_FAILURES=time_conflict
```

### 完整演示启动

```bash
# 终端 1：启动后端
DEMO_MODE=true PLANNING_MODE=mock MOCK_BOOKING_FAILURES=no_seat npm run dev:api

# 终端 2：启动前端
npm run dev

# 浏览器访问 http://localhost:5173
```

详细演示脚本请参考 [DEMO_SCRIPT.md](./DEMO_SCRIPT.md)。

---

## 🔌 API 接口

### 健康检查

| 端点 | 方法 | 说明 |
| --- | --- | --- |
| `/api/health` | GET | 存活探针 (liveness probe) |
| `/api/ready` | GET | 就绪探针 (readiness probe) |

<details>
<summary><b>/api/ready 返回示例</b></summary>

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
  "uptime": 12345
}
```

</details>

### 认证

| 端点 | 方法 | 说明 |
| --- | --- | --- |
| `/api/auth/login` | POST | 邮箱登录 |
| `/api/auth/guest` | POST | 游客访问 |
| `/api/auth/forgot-password` | POST | 请求密码重置 |
| `/api/auth/reset-password` | POST | 使用重置令牌设置新密码 |

### Agent

| 端点 | 方法 | 说明 |
| --- | --- | --- |
| `/api/agent/plan` | POST | 生成规划方案 |
| `/api/agent/chat` | POST | 对话交互 |

### 服务入口

| 端点 | 方法 | 说明 |
| --- | --- | --- |
| `/api/service-actions/prepare` | POST | 准备服务入口，生成 deep link 或 copy text |
| `/api/actions/track` | POST | 埋点追踪用户点击行为 |

---

## 🐳 部署指南

### Docker Compose（推荐）

```bash
# 1. 创建环境变量（JWT/COOKIE 密钥自动生成）
JWT_ACCESS_SECRET=$(openssl rand -hex 32)
JWT_REFRESH_SECRET=$(openssl rand -hex 32)
COOKIE_SECRET=$(openssl rand -hex 32)
cat > .env <<EOF
POSTGRES_PASSWORD=your-strong-db-password
REDIS_PASSWORD=your-strong-redis-password
JWT_ACCESS_SECRET=$JWT_ACCESS_SECRET
JWT_REFRESH_SECRET=$JWT_REFRESH_SECRET
COOKIE_SECRET=$COOKIE_SECRET
AMAP_WEB_SERVICE_KEY=your-amap-key
QWEN_API_KEY=your-qwen-key
CORS_ORIGINS=https://example.com
EOF

# 2. 启动
docker compose -f docker-compose.prod.yml up -d

# 3. 检查健康状态
curl http://localhost:3001/api/ready

# 4. 更新部署
docker compose -f docker-compose.prod.yml up -d --build
```

### PM2 + Nginx

<details>
<summary><b>PM2 启动命令</b></summary>

```bash
npm install -g pm2
pm2 start dist/server/index.js --name planninggo-api --env production
pm2 logs planninggo-api
pm2 startup
pm2 save
```

</details>

<details>
<summary><b>Nginx 配置片段</b></summary>

```nginx
server {
    listen 443 ssl http2;
    server_name example.com;

    ssl_certificate     /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;

    # 前端静态文件
    root /path/to/planninggo/dist;
    index index.html;

    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # API 反代
    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 60s;
    }

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

</details>

---

## 🔒 生产安全校验

启动时会自动校验以下规则，不满足则启动失败：

| 条件 | 要求 |
| --- | --- |
| `NODE_ENV=production` | `JWT_ACCESS_SECRET` 必须 ≥32 位且非默认值 |
| `NODE_ENV=production` | `JWT_REFRESH_SECRET` 必须 ≥32 位且非默认值 |
| `NODE_ENV=production` | `COOKIE_SECRET` 必须 ≥32 位 |
| `NODE_ENV=production` | `DATABASE_URL` 不能是默认本地地址 |
| `NODE_ENV=production` | `REDIS_URL` 不能是 localhost |
| `PLANNING_MODE=llm` | 必须至少配置一个 LLM API Key |
| `PLANNING_MODE=mock` + production | 需设置 `ALLOW_MOCK_PROVIDER_IN_PRODUCTION=true` |

---

## 🧪 测试

```bash
# 运行所有测试
npm test

# E2E 测试
npm run test:e2e

# 冒烟测试
npm run smoke:all
```

> **454 tests passing** — 覆盖 Agent 意图解析、中间件护栏、执行引擎、AMAP 连接器、手接续、认证服务等核心模块

---

## 📁 项目结构

```
周末去哪儿/
├── src/
│   ├── components/              # React 组件
│   │   ├── features/            # 功能组件（PlanCardView/Composer/ErrorCard/ExternalServicePanel/...）
│   │   ├── AuthModal.tsx        # 认证弹窗
│   │   ├── BottomTabs.tsx       # 移动端底部导航
│   │   ├── MapSelector.tsx      # 地图切换器
│   │   ├── NavBar.tsx           # 桌面端顶部导航
│   │   ├── RealMap.tsx          # 地图组件（OSM + AMap）
│   │   ├── RouteMap.tsx         # 路线地图
│   │   └── ...
│   ├── pages/                   # 页面组件（15 个）
│   │   ├── HomePage/            # 首页
│   │   ├── FeaturesPage/        # 规划工作台
│   │   ├── FlowPage/            # 流程页
│   │   ├── CasesPage/           # 场景案例
│   │   ├── DesignReviewPage/    # 设计评审
│   │   ├── DevelopersPage/      # 开发者中心
│   │   ├── ProfilePage/         # 个人中心
│   │   ├── ProfileGatePage/     # 画像设置
│   │   └── HandoffPage/         # 移动端接续
│   ├── server/                  # Fastify 后端
│   │   ├── modules/             # 业务模块
│   │   │   ├── agent/           # Agent 核心（意图解析/编排/工具/对话）
│   │   │   │   └── middleware/  # 5 个中间件护栏
│   │   │   ├── connectors/      # 外部服务连接器（AMap/Calendar/Meituan）
│   │   │   │   ├── amap/
│   │   │   │   ├── calendar/
│   │   │   │   └── meituan/
│   │   │   ├── execution/       # 执行引擎（状态机/动作/提供者）
│   │   │   │   └── providers/   # 5 个执行提供者
│   │   │   ├── handoff/         # 移动端接续（QR/令牌/会话）
│   │   │   ├── maps/            # 地图统一接口
│   │   │   ├── observability/   # 可观测性（工具/LLM/事件日志）
│   │   │   ├── planning/        # 规划引擎（候选/评分/校验/修复）
│   │   │   ├── suggestions/     # 推荐引擎
│   │   │   └── tools/           # 工具系统
│   │   │       ├── amap/        # AMap 工具（POI/路线/天气/地理编码）
│   │   │       └── internal/    # 内部工具（记忆/画像/预约）
│   │   ├── plugins/             # Fastify 插件（6 个）
│   │   ├── providers/           # Provider 适配器（10 个）
│   │   ├── repositories/        # 数据访问层
│   │   ├── routes/              # API 路由（23 个）
│   │   ├── services/            # 业务服务
│   │   ├── common/              # 公共工具（16 个）
│   │   ├── config/              # 配置（env.ts）
│   │   ├── data/                # 数据文件
│   │   ├── app.ts               # Fastify 应用构建
│   │   ├── index.ts             # 入口
│   │   ├── routes.ts            # 路由注册
│   │   └── types.ts             # 类型定义
│   ├── shared/                  # 前后端共享
│   ├── styles/                  # 全局样式（global.scss + _glass.scss）
│   ├── lib/                     # 前端工具库（12 个）
│   ├── data/                    # 静态数据
│   ├── generated/               # Prisma 生成代码
│   ├── App.tsx
│   ├── main.tsx
│   └── types.ts
├── prisma/                      # 数据库 Schema & 迁移（40+ 模型）
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
├── public/                      # 静态资源
├── scripts/                     # 运维脚本
├── tests/                       # E2E 测试
├── DESIGN.md                    # 设计系统规范
├── DEMO_SCRIPT.md               # 演示脚本
├── FEATURES_PAGE_FIXES.md       # 功能页修复记录
├── docker-compose.yml           # 开发 Docker
├── docker-compose.prod.yml      # 生产 Docker
├── Dockerfile                   # 生产镜像
├── playwright.config.ts         # E2E 配置
├── prisma.config.ts             # Prisma 配置
├── eslint.config.js             # ESLint 配置
├── .env.example                 # 环境变量模板（80+ 配置项）
└── package.json
```

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

---

## 📄 License

本项目基于仓库内 [License](./License) 文件授权使用。

---

**Made with ❤️ for better weekends**

`本地生活` `周末规划` `AI Agent` `行程安排` `多人协作` `路线规划` `预约执行` `家庭出行` `朋友聚会` `雨天备选`
