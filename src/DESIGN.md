# PlanningGo 系统设计文档

## 1. 项目概述

### 1.1 系统定位

PlanningGo 是一个基于大语言模型的本地生活智能规划系统。系统接收用户的自然语言出行意图，自动完成信息收集、行程方案生成、预订执行的全流程。核心目标是降低用户规划成本，减少多平台跳转操作。

### 1.2 核心能力

- **意图理解**：将非结构化文本转化为结构化规划需求，包括时间、地点、同行人员、预算等约束条件。
- **方案生成**：基于用户约束和实时上下文（天气、交通、商家营业状态），生成多组可执行的行程方案供用户选择。
- **动作执行**：用户选定方案后，系统自动完成餐厅预约、门票预订、打车等操作。
- **偏好记忆**：跨会话记录用户偏好，优化后续方案推荐质量。

### 1.3 典型应用场景

| 场景 | 描述 |
|------|------|
| 周末出行规划 | 用户输入"周六带家人去郊区一日游" |
| 约会安排 | 用户输入"周末和女朋友在上海过" |
| 差旅规划 | 用户输入"下周三到周五在北京见客户" |
| 多人协作 | 多用户对同一行程方案进行投票和调整 |

### 1.4 设计约束

- 系统支持 Mock、LLM、Hybrid 三种规划模式，由环境变量 `PLANNING_MODE` 控制。
- 外部服务（地图、天气、预订）通过 Provider 接口抽象，允许替换实现而不影响核心逻辑。
- 前端与后端通过 RESTful API 通信，支持流式响应以提升交互体验。

---

## 2. 系统架构

### 2.1 整体架构

系统采用分层模块化架构，自上而下分为四层：

```
┌─────────────────────────────────────┐
│          表现层 (Presentation)       │  React + Vite
├─────────────────────────────────────┤
│          服务层 (Service)            │  Fastify + Business Logic
├─────────────────────────────────────┤
│          核心层 (Core)               │  Planning Pipeline
├─────────────────────────────────────┤
│          基础设施层 (Infrastructure) │  PostgreSQL + Redis + External APIs
└─────────────────────────────────────┘
```

### 2.2 核心模块及依赖关系

```
                    ┌──────────────┐
                    │   前端 (React) │
                    └──────┬───────┘
                           │ HTTP/WebSocket
                    ┌──────▼───────┐
                    │  路由层 (Routes) │
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │  服务层 (Services) │
                    └──────┬───────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
 ┌──────▼───────┐  ┌──────▼───────┐  ┌──────▼───────┐
 │   Agent 模块   │  │ Execution 模块 │  │   外部 Provider │
 │   (Orchestrator) │  │  (动作执行)    │  │  (地图/天气/预订) │
 └──────┬───────┘  └──────┬───────┘  └──────────────┘
        │
 ┌──────▼───────┐  ┌──────▼───────┐  ┌──────▼───────┐
 │ Intent 模块   │  │ Planning 模块 │  │ Ranking 模块  │
 │  (意图解析)    │  │ (方案生成)    │  │  (排序筛选)   │
 └──────┬───────┘  └──────┬───────┘  └──────────────┘
        │                  │                  │
        └──────────────────┼──────────────────┘
                           │
                    ┌──────▼───────┐
                    │ Repository 层  │
                    │  (数据访问)    │
                    └──────┬───────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
 ┌──────▼───────┐  ┌──────▼───────┐  ┌──────────┐
 │  PostgreSQL   │  │    Redis      │  │ File System │
 └──────────────┘  └──────────────┘  └──────────┘
```

### 2.3 模块职责定义

| 模块 | 路径 | 职责 |
|------|------|------|
| **Routes** | `server/routes/` | 接收 HTTP 请求，参数校验，调用对应 Service |
| **Agent Orchestrator** | `server/modules/agent/orchestrator.ts` | 规划管道总控，协调各子模块执行顺序 |
| **Intent Extractor** | `server/modules/agent/intent.ts` | 将用户输入解析为结构化 Intent 对象 |
| **Context Builder** | `server/modules/planning/contextBuilder.ts` | 聚合用户画像、历史偏好、实时天气等上下文 |
| **Candidate Generator** | `server/modules/planning/candidateGenerator.ts` | 调用 Provider 搜索 POI，生成候选节点 |
| **Planner** | `server/modules/agent/planner.ts` | 生成具体行程方案（支持 Mock/LLM 两种实现） |
| **Ranking** | `server/modules/planning/ranking.ts` | 对候选节点打分排序 |
| **Validator** | `server/modules/planning/validator.ts` | 验证方案可行性（时间冲突、营业状态等） |
| **Action Executor** | `server/modules/execution/actionExecutor.ts` | 执行用户确认后的预订动作 |
| **Providers** | `server/providers/` | 外部服务适配器（Amap 地图/天气、Booking 预订） |
| **Repositories** | `server/repositories/` | 数据访问层，封装数据库操作 |
| **Plugins** | `server/plugins/` | Fastify 插件（认证、数据库连接等） |

### 2.4 数据流向

```
用户输入
    │
    ▼
[Intent Extractor] ──────► Intent 对象
    │                              │
    ▼                              ▼
[Context Builder] ◄──── User Profile / Weather API
    │                              │
    ▼                              │
[Candidate Generator] ──────────► Candidates[]
    │                              │
    ▼                              │
[Ranking] ──────────────────────► Ranked Candidates
    │                              │
    ▼                              │
[Planner] ───────────────────────► Plan Options (A/B/C)
    │                              │
    ▼                              │
[Validator] ──► (不通过) ──► 返回调整
    │                              │
    ▼ (通过)                       │
用户确认 ◄────────────────────────┘
    │
    ▼
[Action Executor] ──► 预订 API 调用
    │
    ▼
Reservation 记录
```

### 2.5 前端架构

前端采用 React 19 + Vite 构建，按职责分为：

- **Pages**：页面级组件，处理路由匹配和布局
- **Components/features**：功能级组件，按业务领域组织
- **lib**：工具函数和 API 客户端

主要页面包括：HomePage（首页）、FeaturesPage（规划工作区）、CasesPage（案例展示）、ProfilePage（用户设置）、DevelopersPage（开发者工具）。

### 2.6 技术选型依据

| 层级 | 技术选型 | 选型理由 |
|------|----------|----------|
| 前端框架 | React 19 | 组件化生态成熟，支持 Suspense 和 Server Components |
| 构建工具 | Vite | 冷启动快，HMR 体验好 |
| 后端框架 | Fastify 5 | 高吞吐、低延迟，内置插件系统 |
| ORM | Prisma 7 | 类型安全、自动迁移、IDE 支持好 |
| 数据库 | PostgreSQL | 关系型数据存储，支持 JSON 类型 |
| 缓存 | Redis | 会话存储、实时数据缓存 |
| LLM | OpenAI API | 成熟的 GPT 模型，支持 Function Calling |

---

## 3. 核心业务流程

本系统存在两个相互独立的核心里程：其一为智能规划管道，负责从用户意图到行程方案的生成；其二为动作执行管道，负责用户确认方案后的预订动作执行。两个管道通过用户确认这一事件节点解耦。

### 3.1 智能规划管道 (Intelligent Planning Pipeline)

#### 3.1.1 流程概述

智能规划管道是系统的主导业务流程，承担从非结构化用户输入到结构化行程方案的转换。管道采用同步串行模式，按序执行以下阶段：意图解析 → 上下文构建 → 候选生成 → 候选排序 → 方案生成 → 方案校验。

#### 3.1.2 阶段一：意图解析 (Intent Extraction)

**模块**：`modules/agent/intent.ts`

**触发条件**：HTTP 请求到达 `/api/agent/chat` 端点。

**输入数据**：`PlanningRequest`（包含 `prompt`、`city`、`departAt`、`budget`、`companions` 等字段）。

**处理逻辑**：

```
1. 调用 detectPlanningRequest(prompt) 判断是否为规划请求
   - 规则匹配：输入长度 < 3 字符 或 命中问候词表 → 返回 false
   - 关键词匹配：命中"去"、"景点"、"周末"等词 → 返回 true

2. 若非规划请求（闲聊/问候），直接返回 responseType="chat"，终止管道

3. 若为规划请求，调用 extractIntent() 解析结构化意图
   - inferParticipantMode()：正则匹配同行人类型（family/couple/friends/solo）
   - inferPartySize()：匹配人数，未指定时根据同行人类型推断默认值
   - inferTimeWindow()：匹配时间段关键词（上午/下午/晚上/全天）
   - inferDuration()：匹配时长，未指定时返回 [4, 6] 小时
   - inferBudget()：匹配预算数值，未指定时返回 undefined
   - inferPreferences()：根据同行人类型和显式关键词添加偏好标签
```

**输出数据**：`UserIntent` 对象（包含 `city`、`participantMode`、`partySize`、`timeWindow`、`durationHours`、`budgetMax`、`preferences`、`mustAsk` 等字段）。

**前置条件校验**：若 `intent.mustAsk` 非空（如缺少出发地），管道抛出 `MISSING_REQUIRED_SLOTS` 错误。

#### 3.1.3 阶段二：上下文构建 (Context Building)

**模块**：`modules/planning/contextBuilder.ts`

**触发条件**：意图解析阶段通过，返回有效 `UserIntent`。

**处理逻辑**：

```
1. 调用 fetchWeather(city, providers)
   - 生产环境：调用 providers.map.getWeather() 获取实时天气
   - 开发环境：天气获取失败时返回 DEFAULT_WEATHER 兜底

2. buildUserProfile() 根据 intent 构建用户画像
   - 从 intent 提取 city、startPoint、preferences、budgetRange

3. 注入系统策略 (policies)
   - paymentAutoExecute: false（禁止自动支付）
   - requireConfirmForReservation: true（预订需用户确认）
   - requireConfirmForShare: true（分享需用户确认）
   - maxAutoPayAmount: 0
```

**输出数据**：`PlanningContext` 对象（包含 `traceId`、`planId`、`intent`、`userProfile`、`environment.weather`、`policies`）。

#### 3.1.4 阶段三：候选生成 (Candidate Generation)

**模块**：`modules/planning/candidateGenerator.ts`

**触发条件**：上下文构建完成。

**处理逻辑**：

```
1. 判断环境模式
   - 生产环境：必须使用 providers.map.searchPois()
   - 开发环境：允许 fallback 到 generateMockFallback()

2. 调用 mapProvider.searchPois() 并发搜索三类 POI
   - activities: 景点、博物馆、展览、公园（关键词：景点 博物馆 展览 公园）
   - restaurants: 餐饮服务（关键词：餐厅 美食）
   - events: 体育休闲、科教文化活动（关键词：展览 演出 活动）

3. 对搜索结果按城市过滤
   - 优先通过 adcode 前缀匹配
   - 其次通过 cityname 包含匹配

4. 调用 mapAmapPoiToCandidate() 将原始 POI 转换为标准 CandidatePoi
   - 推断 category（restaurant/scenic/activity/movie/shopping）
   - 提取 rating、avgPrice、distanceMinutes
   - 判断 indoor、kidFriendly、dietFriendly、bookingRequired 等属性
```

**并发控制**：三类 POI 搜索通过 `Promise.all()` 并行执行，单类失败不影响其他类。

**输出数据**：`CandidatePool` 对象（包含 `activities[]`、`restaurants[]`、`events[]`、`movies[]`）。

#### 3.1.5 阶段四：候选排序 (Candidate Ranking)

**模块**：`modules/planning/ranking.ts`

**触发条件**：候选生成完成。

**处理逻辑**：

```
scoreCandidate(intent, item):
  1. 基础分 = 50

  2. 加分项（距离与可用性）：
     - 距离 <= 限制 → +18
     - 可预约 → +12
     - 营业中 → +10
     - 排队风险低 → +8
     - 排队风险高 → -12

  3. 人群适配加分：
     - family 模式 + kidFriendly → +18
     - 偏好包含"减脂友好" + dietFriendly → +10
     - 偏好包含"室内优先" + indoor → +10
     - friends 模式 + 标签"可锁座"/"适合多人" → +10

  4. 预算惩罚：
     - avgPrice * partySize > budgetMax → -20

  5. 最终分数 clamp 到 [0, 100]
```

**输出数据**：各 POI 数组按分数降序排列的 `CandidatePool`。

#### 3.1.6 阶段五：方案生成 (Plan Generation)

**模块**：`modules/agent/planner.ts`

**触发条件**：候选排序完成。

**处理逻辑**：

```
1. 根据 PLANNING_MODE 环境变量选择生成模式

   Mock 模式 (mode = "mock"):
   ├── detectPlanningRequest() → false → 直接返回 chat 响应
   └── detectPlanningRequest() → true → 根据 participantMode 分发
       ├── friends → buildFriendsPlan() + buildIndoorBackupPlan()
       ├── couple → buildCouplePlan() + buildIndoorBackupPlan()
       └── family/solo/unknown → buildPrimaryPlan() + buildIndoorBackupPlan()

   LLM 模式 (mode = "llm"):
   ├── 调用 providers.llm.chat() 发送结构化 prompt
   ├── 解析 LLM 返回的 JSON（支持 ```json``` 包裹格式）
   └── 校验 schema 失败时，根据 ENABLE_LLM_FALLBACK 决定是否 fallback

   Hybrid 模式 (mode = "hybrid"):
   ├── 优先尝试 LLM 生成
   └── LLM 失败时自动 fallback 到 Mock 生成

2. 方案数据结构 (ActivityPlan):
   - id, planId, title, targetGroup, score
   - summary（方案概述）
   - totalDurationMinutes, totalCostMin, totalCostMax
   - timeline[]（时间线，包含 startTime/endTime/type/poiId/transport 等）
   - backupPlan（天气不好时的备选方案）
```

**LLM Prompt 构建** (`buildLlmPrompt`)：

```
- 注入 intent 信息（城市、出发地、人数、时长、预算、偏好）
- 注入 weather 信息（天气状况、温度、建议）
- 注入候选 POI 列表（名称、类型、地址、评分、人均）
- 指定输出 JSON schema（plans 数组，最多 3 个方案）
```

**输出数据**：`ActivityPlan[]`（包含 2-3 个方案选项）。

#### 3.1.7 阶段六：方案校验 (Plan Validation)

**模块**：`modules/planning/validator.ts`

**触发条件**：方案生成完成。

**处理逻辑**：

```
validatePlans(intent, candidates, options):
  1. validateTimeline()：校验时间线
     - 检查每个 step 的 endTime > startTime
     - 检查相邻 step 之间无时间重叠
     - 警告：timeline 步骤数 < 3

  2. validatePoiSources()：校验 POI 来源
     - 活动/餐饮步骤必须包含 poiId
     - poiId 必须在 candidateMap 中存在
     - 非活动步骤（travel/buffer/return/rest）不校验

  3. validateDuration()：校验时长
     - 总时长 < 期望最小时长 * 0.75 → 警告
     - 总时长 > 期望最大时长 → 警告

  4. validateBudget()：校验预算
     - totalCostMax > budgetMax * 1.2 → 警告

  5. validateParticipantFit()：校验人群适配
     - family 模式但无 kidFriendly 地点 → 警告
     - 偏好"减脂友好"但无 dietFriendly 餐厅 → 警告

  6. validateDistance()：校验距离
     - 单个 POI 距离 > distanceLimitMinutes + 10 → 警告

  7. 计算校验结果
     - blockingErrors > 0 → status = "fail"
     - blockingErrors = 0 且 warnings > 0 → status = "warning"
     - 否则 → status = "pass"
     - score = 100 - blockingErrors * 25 - warnings * 6
```

**输出数据**：`ValidationReport`（包含 `status`、`score`、`blockingErrors[]`、`warnings[]`、`repairHints[]`）。

#### 3.1.8 管道出口

**后置处理**：

```
1. createActionsForPlans() 为每个方案创建可执行动作
   - 识别 timeline 中 bookingNeeded = true 的步骤
   - 生成 Action 对象（type/payload/idempotencyKey）
   - 绑定 userId（支持匿名用户）

2. 组装 PlanningResponse
   - traceId, planId, mode, intent
   - options[], selectedOptionId, validation
   - executableActions[], toolLogs[], nextActions[]
   - summary, selectedPlanId
```

---

### 3.2 动作执行管道 (Action Execution Pipeline)

#### 3.2.1 流程概述

动作执行管道负责用户确认方案后的实际预订操作。管道采用状态机驱动，每个动作独立维护其生命周期。执行结果持久化到 PostgreSQL，并支持幂等性保护。

#### 3.2.2 状态机定义

**模块**：`modules/execution/stateMachine.ts`

```
┌──────────────┐     ┌────────────┐     ┌────────────────────────┐
│   proposed   │ ──► │  prepared  │ ──► │ waiting_authorization  │
└──────────────┘     └────────────┘     └───────────┬────────────┘
      │                                            │
      │                                            ▼
      │                                  ┌─────────────────┐
      │                                  │   authorized    │
      │                                  └────────┬────────┘
      │                                           │
      ▼                                           ▼
┌──────────────┐                          ┌───────────┐
│  cancelled   │                          │ executing │
└──────────────┘                          └─────┬─────┘
      ▲                                   ┌─────┴─────┐
      │                                   │           │
      ▼                                   ▼           ▼
┌──────────────┐                    ┌───────────┐ ┌────────┐
│   expired    │                    │ succeeded │ │ failed │
└──────────────┘                    └───────────┘ └────────┘
                                              ▲
                                              │
                                        (可重试 → prepared)
```

**状态说明**：

| 状态 | 含义 | 性质 |
|------|------|------|
| `proposed` | 动作已创建，待处理 | 初始状态 |
| `prepared` | 动作已初始化 | 过渡状态 |
| `waiting_authorization` | 等待用户授权 | 需用户确认 |
| `authorized` | 用户已授权 | 过渡状态 |
| `executing` | 正在执行 | 过渡状态 |
| `succeeded` | 执行成功 | 终态 |
| `failed` | 执行失败 | 可重试回到 `prepared` |
| `cancelled` | 用户取消 | 终态 |
| `expired` | 超时过期 | 终态 |

#### 3.2.3 执行流程详解

**模块**：`modules/execution/actionExecutor.ts`

**触发条件**：用户选定方案并点击"确认预约"。

**处理逻辑**：

```
ActionExecutor.executeAction(userId, planId, action, permissions):

1. 幂等性校验
   ┌─────────────────────────────────────┐
   │ 查询 prisma.action.findUnique()     │
   │   where: idempotencyKey = action.key │
   └─────────────────────────────────────┘
   │
   ├─► 已存在 → 返回现有状态（不重复执行）
   │
   └─► 不存在 → 继续执行

2. 创建 Action 记录
   prisma.action.create({
     userId, planId,
     type: action.type,
     status: "proposed",
     confirmationRequired: action.confirmationRequired,
     idempotencyKey: action.idempotencyKey,
     payload: action.payload,
     quote: { price: action.priceEstimate }
   })

3. 状态转换：proposed → prepared
   transitionState("proposed", "prepared")
   prisma.action.update({ status: "prepared" })

4. 判断是否需要授权
   │
   ├─► confirmationRequired = true
   │    └── 状态转换：prepared → waiting_authorization
   │        返回 { status: "waiting_authorization" }
   │        等待用户授权
   │
   └─► confirmationRequired = false
        └── 进入执行阶段

5. 执行动作 (performExecution)
   prisma.action.update({ status: "executing" })

   根据 action.type 分发：
   ┌────────────────────────────────────────────┐
   │ navigation    → executeNavigation()        │
   │ calendar_event → executeCalendar()        │
   │ share_message  → executeShare()           │
   │ restaurant_reservation / ticket_lock       │
   │                 → executeReservation()    │
   └────────────────────────────────────────────┘

6. 状态转换：executing → succeeded/failed
   prisma.action.update({
     status: "succeeded",
     result: executionResult
   })
   prisma.actionEvent.create({
     eventType: "execution_success",
     fromStatus: "executing",
     toStatus: "succeeded",
     payload: result
   })

   或

   prisma.action.update({
     status: "failed",
     errorMessage: errorMessage
   })
   prisma.actionEvent.create({
     eventType: "execution_failed",
     fromStatus: "executing",
     toStatus: "failed",
     payload: { error: errorMessage }
   })
```

#### 3.2.4 授权流程

**模块**：`ActionExecutor.authorizeAction(actionId)`

```
触发条件：用户在 UI 点击"确认授权"

1. 查询 Action 记录
   prisma.action.findUnique({ where: { id: actionId } })

2. 校验当前状态
   若 status !== "waiting_authorization" → 抛出错误

3. 状态转换：waiting_authorization → authorized
   prisma.action.update({ status: "authorized" })
   prisma.actionEvent.create({ eventType: "authorized" })

4. 递归调用 performExecution()
```

#### 3.2.5 动作类型处理

| 类型 | 执行函数 | 返回数据 |
|------|----------|----------|
| `navigation` | `executeNavigation()` | `{ navigationUrl, points }` |
| `calendar_event` | `executeCalendar()` | `{ calendarEventId, title, startTime, endTime }` |
| `share_message` | `executeShare()` | `{ shareUrl, text }` |
| `restaurant_reservation` | `executeReservation()` | `{ reservationId, poiId, poiName, status }` |
| `ticket_lock` | `executeReservation()` | `{ reservationId, poiId, poiName, status }` |

#### 3.2.6 事件日志

每个状态转换均通过 `prisma.actionEvent.create()` 记录事件日志，包含：

- `actionId`：关联的动作 ID
- `eventType`：事件类型（`authorized`、`execution_success`、`execution_failed`）
- `fromStatus`：转换前状态
- `toStatus`：转换后状态
- `payload`：事件数据（成功时为结果，失败时为错误信息）
- `createdAt`：事件时间戳

事件日志用于审计追踪和故障排查。

---

### 3.3 数据流总图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        智能规划管道 (Pipeline)                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  用户输入 ──► Intent Extractor ──► UserIntent                               │
│                                        │                                   │
│                                        ▼                                   │
│                     Context Builder ◄─── UserProfile + Weather               │
│                                        │                                   │
│                                        ▼                                   │
│                     Candidate Generator ◄─── providers.map.searchPois()     │
│                                        │                                   │
│                                        ▼                                   │
│                     Ranking ────────────────────────────────► CandidatePool │
│                                        │                                   │
│                                        ▼                                   │
│                     Planner ◄──────────────────────────────► Intent + Pool │
│                                        │                                   │
│                                        ▼                                   │
│                     Validator ◄─────────────────────────────► Plan Options  │
│                                        │                                   │
│                                        ▼                                   │
│                     createActionsForPlans ──► executableActions[]          │
│                                        │                                   │
│                                        ▼                                   │
│                                    PlanningResponse                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        │ 用户确认
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       动作执行管道 (Execution)                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  用户授权 ──► ActionExecutor.executeAction()                                 │
│                        │                                                   │
│                        ▼                                                   │
│              ┌─────────────────┐                                          │
│              │ 幂等性校验      │                                          │
│              │ (idempotencyKey)│                                          │
│              └────────┬────────┘                                          │
│                       │                                                    │
│              ┌────────▼────────┐                                          │
│              │ 创建 Action 记录 │                                          │
│              │  status: proposed │                                         │
│              └────────┬────────┘                                          │
│                       │                                                    │
│              ┌────────▼────────┐                                          │
│              │ 状态: prepared │                                          │
│              └────────┬────────┘                                          │
│                       │                                                    │
│           ┌───────────┴───────────┐                                       │
│           ▼                       ▼                                       │
│  confirmationRequired?        confirmationRequired?                          │
│           │                       │                                        │
│           ▼                       ▼                                        │
│  ┌──────────────────┐    ┌─────────────────────┐                         │
│  │ waiting_auth     │    │ performExecution()   │                         │
│  │ (等待用户授权)    │    │  (直接执行)          │                         │
│  └────────┬─────────┘    └──────────┬──────────┘                         │
│           │                        │                                      │
│           │ 用户授权               │                                      │
│           ▼                        ▼                                      │
│  authorizeAction()           ┌──────────────────┐                          │
│                             │ executing        │                          │
│                             └────────┬─────────┘                          │
│                                      │                                    │
│                              ┌───────┴───────┐                            │
│                              ▼               ▼                            │
│                    succeeded          failed                              │
│                    (终态)            (可重试)                             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.4 智能规划管道时序图

以下时序图展示从用户发起规划请求到获得行程方案的完整调用链路：

```mermaid
sequenceDiagram
    autonumber
    participant Client as 前端 Client
    participant Route as Fastify Route<br/>/api/agent/plan
    participant Orchestrator as Agent Orchestrator<br/>runPlanningPipeline()
    participant Intent as Intent Extractor<br/>extractIntent()
    participant Context as Context Builder<br/>buildPlanningContext()
    participant Candidate as Candidate Generator<br/>generateCandidates()
    participant Ranking as Candidate Ranking<br/>rankCandidates()
    participant Planner as Planner<br/>generateMockPlans() / generateLlmPlans()
    participant Validator as Validator<br/>validatePlans()
    participant ActionSvc as Action Service<br/>createActionsForPlans()
    participant MapProvider as Map Provider<br/>(Amap/高德)
    participant LLMProvider as LLM Provider<br/>(OpenAI/通义)
    participant DB as PostgreSQL

    Client->>+Route: POST /api/agent/plan<br/>{ prompt, city, budget, companions }

    Route->>+Orchestrator: runPlanningPipeline(input)

    Orchestrator->>+Intent: extractIntent(request)
    Intent-->>-Orchestrator: UserIntent

    alt 非规划请求（闲聊/问候）
        Orchestrator-->>-Route: Response (type: "chat")
        Route-->>-Client: 返回对话回复
    end

    Orchestrator->>+Context: buildPlanningContext({ intent })
    Context->>+MapProvider: getWeather(city)
    MapProvider-->>-Context: WeatherInfo
    Context-->>-Orchestrator: PlanningContext

    Orchestrator->>+Candidate: generateCandidates(context)
    Candidate->>+MapProvider: searchPois(keywords, types)
    par 并发搜索三类 POI
        MapProvider-->>Candidate: activities[]
        MapProvider-->>Candidate: restaurants[]
        MapProvider-->>Candidate: events[]
    end
    Candidate-->>-Orchestrator: CandidatePool

    Orchestrator->>+Ranking: rankCandidates(intent, pool)
    Ranking-->>-Orchestrator: Ranked Candidates

    alt PLANNING_MODE = "mock"
        Orchestrator->>+Planner: generateMockPlans(input)
        Planner-->>-Orchestrator: ActivityPlan[] (2-3 个方案)
    else PLANNING_MODE = "llm" or "hybrid"
        Orchestrator->>+Planner: generateLlmPlans(input)
        Planner->>+LLMProvider: chat(messages)
        LLMProvider-->>-Planner: LLM Response (JSON)
        Planner->>Planner: parseAndValidateLlmOutput()
        Planner-->>-Orchestrator: ActivityPlan[]

        opt LLM 调用失败且 ENABLE_LLM_FALLBACK=true
            Planner->>Planner: generateMockPlans() (fallback)
        end
    end

    Orchestrator->>+Validator: validatePlans({ intent, candidates, options })
    Validator->>Validator: validateTimeline()
    Validator->>Validator: validatePoiSources()
    Validator->>Validator: validateDuration()
    Validator->>Validator: validateBudget()
    Validator->>Validator: validateParticipantFit()
    Validator-->>-Orchestrator: ValidationReport

    Orchestrator->>+ActionSvc: createActionsForPlans({ options })
    ActionSvc-->>-Orchestrator: ExecutionAction[]

    Orchestrator-->>-Route: PlanningResponse

    Route->>+DB: message.create()<br/>conversation.update()
    DB-->>-Route: 消息记录

    Route-->>-Client: { traceId, planId, options, validation, actions }
```

### 3.5 动作执行管道时序图

以下时序图展示用户确认方案后执行预订动作的完整调用链路：

```mermaid
sequenceDiagram
    autonumber
    participant Client as 前端 Client
    participant Route as Fastify Route<br/>/api/actions/:id/confirm
    participant Executor as Action Executor<br/>executeAction()
    participant SM as State Machine<br/>transitionState()
    participant Auth as Auth Guard<br/>(权限校验)
    participant DB as PostgreSQL
    participant ExtAPI as External API<br/>(餐厅/门票/导航)

    Client->>+Route: POST /api/actions/:id/confirm<br/>{ userConfirmed: true }

    Route->>+Executor: executeAction({ action, userId, permissions })

    Executor->>+DB: action.findUnique(idempotencyKey)
    DB-->>Executor: existing? (幂等性校验)

    alt 动作已存在（幂等）
        Executor-->>-Route: 返回现有状态
        Route-->>-Client: ActionResult
    end

    Executor->>+DB: action.create()
    DB-->>Executor: actionRecord (status: "proposed")

    Executor->>+SM: transitionState("proposed", "prepared")
    SM-->>Executor: "prepared"
    Executor->>DB: action.update(status: "prepared")

    alt confirmationRequired = true
        Executor->>+SM: transitionState("prepared", "waiting_authorization")
        SM-->>Executor: "waiting_authorization"
        Executor->>DB: action.update(status: "waiting_authorization")
        Executor-->>-Route: { status: "waiting_authorization" }
        Route-->>-Client: 等待用户授权

        Note over Client,Executor: [用户点击授权按钮]

        Client->>+Route: POST /api/actions/:id/authorize
        Route->>+Executor: authorizeAction(actionId)
        Executor->>+SM: transitionState("waiting_authorization", "authorized")
        SM-->>Executor: "authorized"
        Executor->>DB: action.update(status: "authorized")
    end

    Executor->>+SM: transitionState("prepared"|"authorized", "executing")
    SM-->>Executor: "executing"
    Executor->>DB: action.update(status: "executing")

    Executor->>+DB: actionEvent.create()<br/>(execution_start)

    alt action.type = "restaurant_reservation"
        Executor->>+ExtAPI: reserveRestaurant(payload)
        ExtAPI-->>Executor: ReservationResult
    else action.type = "navigation"
        Executor->>+ExtAPI: generateNavigationUrl(payload)
        ExtAPI-->>Executor: NavigationUrl
    else action.type = "calendar_event"
        Executor->>+ExtAPI: createCalendarEvent(payload)
        ExtAPI-->>Executor: CalendarEventResult
    end

    alt 执行成功
        Executor->>+DB: action.update(status: "succeeded", result)
        Executor->>DB: actionEvent.create()<br/>(execution_success)
        Executor-->>Route: ActionResult { status: "succeeded", result }
    else 执行失败
        Executor->>+DB: action.update(status: "failed", errorMessage)
        Executor->>DB: actionEvent.create()<br/>(execution_failed)
        Executor-->>Route: ActionResult { status: "failed", error }
        Note over Executor: 失败状态可重试回到 "prepared"
    end

    Route-->>-Client: ActionResult
```

---

## 4. 关键接口与数据结构设计

### 4.1 API 设计概述

系统采用 RESTful 风格设计，所有接口前缀为 `/api`。认证方式支持 JWT Bearer Token（正式用户）和 Guest Token（匿名用户）。部分端点支持 SSE（Server-Sent Events）流式响应。

**基础 URL**：`/api`

**认证 Header**：`Authorization: Bearer <token>`

**通用响应格式**：

```json
// 成功
{ "data": { ... } }

// 错误
{ "error": "ERROR_CODE", "message": "错误描述", "issues": [...] }
```

---

### 4.2 核心 API 端点

#### 4.2.1 认证接口 (Auth)

| 方法 | 路径 | 认证 | 描述 |
|------|------|------|------|
| POST | `/api/auth/register` | 否 | 用户注册 |
| POST | `/api/auth/login` | 否 | 用户登录 |
| POST | `/api/auth/guest` | 否 | 匿名访客登录 |
| POST | `/api/auth/demo` | 否 | 演示模式登录 |
| POST | `/api/auth/refresh` | 否 | 刷新 Token |
| POST | `/api/auth/logout` | 可选 | 登出 |
| POST | `/api/auth/change-password` | 是 | 修改密码 |
| POST | `/api/auth/forgot-password` | 否 | 请求密码重置 |
| POST | `/api/auth/reset-password` | 否 | 重置密码 |

**POST /api/auth/register**

Request:
```json
{
  "email": "string (email)",
  "password": "string (min 6 chars)",
  "displayName": "string (max 50, optional)",
  "name": "string (max 50, optional)",
  "city": "string (optional)",
  "startPoint": "string (optional)",
  "companions": "string (optional)",
  "budgetMin": "integer (optional)",
  "budgetMax": "integer (optional)"
}
```

Response `201 Created`:
```json
{
  "user": {
    "id": "uuid",
    "email": "string",
    "displayName": "string",
    "role": "string",
    "mode": "string",
    "createdAt": "ISO8601 datetime"
  },
  "tokens": {
    "accessToken": "string",
    "refreshToken": "string",
    "expiresIn": 3600
  }
}
```

**POST /api/auth/login**

Request:
```json
{
  "email": "string (email)",
  "password": "string"
}
```

**POST /api/auth/guest**

Request (optional):
```json
{
  "city": "string (optional)",
  "startPoint": "string (optional)",
  "companions": "family|friends|couple|solo (optional)",
  "budgetMin": "integer (optional)",
  "budgetMax": "integer (optional)",
  "homeLat": "number (optional)",
  "homeLng": "number (optional)"
}
```

---

#### 4.2.2 规划接口 (Agent/Planning)

| 方法 | 路径 | 认证 | 描述 |
|------|------|------|------|
| POST | `/api/agent/plan` | 可选 | 执行规划管道（同步） |
| POST | `/api/agent/plan/stream` | 可选 | 执行规划管道（SSE 流式） |
| POST | `/api/agent/parse` | 可选 | 解析用户意图 |
| POST | `/api/agent/plan/legacy` | 可选 | 旧版规划接口 |
| POST | `/api/agent/what-if` | 可选 | What-If 场景模拟 |
| POST | `/api/agent/chat` | 可选 | 对话聊天（同步） |
| POST | `/api/agent/chat/stream` | 可选 | 对话聊天（SSE 流式） |
| POST | `/api/agent/plans/select` | 可选 | 选择方案 |

**POST /api/agent/plan**

Request:
```json
{
  "prompt": "string (min 1, max 10000)",
  "city": "string (optional, default: 北京)",
  "startPoint": "string (optional)",
  "departAt": "string (optional, HH:mm format)",
  "date": "string (optional, YYYY-MM-DD)",
  "budget": "integer (optional)",
  "companions": "family|friends|couple|solo (optional)",
  "modelMode": "flash|pro (optional, default: flash)",
  "conversationId": "uuid (optional)",
  "guestId": "string (max 128, optional)"
}
```

Response:
```json
{
  "traceId": "string",
  "planId": "string",
  "mode": "mock|llm|hybrid",
  "intent": {
    "raw": "string",
    "city": "string",
    "origin": { "label": "string", "lat": "number (optional)", "lng": "number (optional)" },
    "date": "string (optional)",
    "departAt": "string (optional)",
    "timeWindow": "morning|afternoon|evening|full_day|unknown",
    "durationHours": ["number", "number"],
    "participantMode": "family|friends|couple|solo|unknown",
    "partySize": "integer",
    "budgetMax": "number (optional)",
    "distanceLimitMinutes": "number",
    "preferences": ["string"],
    "mustAsk": ["string"],
    "isPlanningRequest": "boolean"
  },
  "options": [
    {
      "id": "string",
      "planId": "string",
      "title": "string",
      "targetGroup": "family|friends|couple|solo|unknown",
      "score": "number (0-100)",
      "summary": "string",
      "totalDurationMinutes": "integer",
      "totalCostMin": "number",
      "totalCostMax": "number",
      "walkingKm": "number (optional)",
      "assumptions": ["string"],
      "highlights": ["string"],
      "risks": ["string"],
      "timeline": [
        {
          "id": "string",
          "startTime": "string (HH:mm)",
          "endTime": "string (HH:mm)",
          "type": "travel|activity|meal|movie|event|buffer|return|rest",
          "title": "string",
          "poiId": "string|null",
          "poiName": "string|null",
          "durationMinutes": "integer",
          "transport": "driving|taxi|subway|walk|mixed|none",
          "reasoning": "string",
          "bookingNeeded": "boolean",
          "actionId": "string|null"
        }
      ],
      "backupPlan": "string (optional)"
    }
  ],
  "selectedOptionId": "string (optional)",
  "validation": {
    "status": "pass|warning|fail",
    "score": "number (0-100)",
    "blockingErrors": ["string"],
    "warnings": ["string"],
    "repairHints": ["string"]
  },
  "executableActions": [
    {
      "id": "string",
      "planId": "string",
      "optionId": "string",
      "userId": "string",
      "type": "restaurant_reservation|ticket_lock|calendar_event|share_message|navigation|memory_save",
      "status": "draft|quoted|waiting_confirm|executing|success|failed|expired|cancelled",
      "title": "string",
      "description": "string",
      "confirmationRequired": "boolean",
      "idempotencyKey": "string",
      "priceEstimate": "string (optional)",
      "expiresAt": "string (optional)",
      "payload": "Record<string, unknown>"
    }
  ],
  "toolLogs": [
    {
      "id": "string",
      "time": "string",
      "tool": "string",
      "status": "success|retry|mock|warning|failed",
      "detail": "string"
    }
  ],
  "nextActions": ["string"],
  "summary": "string",
  "selectedPlanId": "string",
  "conversationId": "string"
}
```

---

#### 4.2.3 动作执行接口 (Actions)

| 方法 | 路径 | 认证 | 描述 |
|------|------|------|------|
| GET | `/api/actions` | 是 | 列出用户动作 |
| POST | `/api/actions/:id/quote` | 是 | 获取动作报价 |
| POST | `/api/actions/:id/confirm` | 是 | 确认执行动作 |
| POST | `/api/actions/:id/cancel` | 是 | 取消动作 |

**POST /api/actions/:id/confirm**

Request:
```json
{
  "userConfirmed": "boolean (default: true)"
}
```

Response:
```json
{
  "actionId": "string",
  "status": "proposed|prepared|waiting_authorization|authorized|executing|succeeded|failed|cancelled|expired",
  "result": "unknown (optional)",
  "error": "string (optional)"
}
```

---

#### 4.2.4 预订接口 (Reservations)

| 方法 | 路径 | 认证 | 描述 |
|------|------|------|------|
| GET | `/api/reservations` | 可选 | 列出预订记录 |
| POST | `/api/reservations` | 可选 | 创建预订 |
| PATCH | `/api/reservations/:id/status` | 可选 | 更新预订状态 |

**POST /api/reservations**

Request:
```json
{
  "type": "restaurant|ticket|activity|delivery",
  "title": "string",
  "status": "draft|holding|confirmed|failed (default: draft)",
  "price": "string (optional)",
  "detail": "string"
}
```

---

#### 4.2.5 分享协作接口 (Share)

| 方法 | 路径 | 认证 | 描述 |
|------|------|------|------|
| GET | `/api/share/rooms` | 可选 | 列出分享房间 |
| POST | `/api/share/rooms` | 可选 | 创建分享房间 |
| POST | `/api/share/rooms/:id/vote` | 可选 | 对方案投票 |

**POST /api/share/rooms**

Request:
```json
{
  "planId": "string",
  "title": "string",
  "members": [
    {
      "name": "string",
      "vote": "yes|no|pending (default: pending)",
      "comment": "string (optional)"
    }
  ]
}
```

**POST /api/share/rooms/:id/vote**

Request:
```json
{
  "memberName": "string",
  "vote": "yes|no",
  "comment": "string (optional)"
}
```

---

#### 4.2.6 记忆接口 (Memories)

| 方法 | 路径 | 认证 | 描述 |
|------|------|------|------|
| GET | `/api/memories` | 是 | 列出记忆 |
| POST | `/api/memories` | 是 | 创建记忆 |
| PATCH | `/api/memories/:id` | 是 | 更新记忆 |
| DELETE | `/api/memories/:id` | 是 | 删除记忆（软删除） |

**POST /api/memories**

Request:
```json
{
  "category": "family|food|route|collaboration",
  "title": "string (min 1)",
  "detail": "string",
  "weight": "number (0-1, default: 0.5)"
}
```

**PATCH /api/memories/:id**

Request (所有字段可选):
```json
{
  "category": "family|food|route|collaboration (optional)",
  "title": "string (optional)",
  "detail": "string (optional)",
  "weight": "number (0-1, optional)"
}
```

---

#### 4.2.7 用户画像接口 (Profile)

| 方法 | 路径 | 认证 | 描述 |
|------|------|------|------|
| GET | `/api/profile/me` | 是 | 获取完整画像 |
| PATCH | `/api/profile/me` | 是 | 更新基本信息 |
| GET | `/api/profile/me/persona` | 是 | 获取画像数据 |
| PATCH | `/api/profile/me/persona` | 是 | 更新画像偏好 |
| GET | `/api/profile/me/companions` | 是 | 列出同行人 |
| POST | `/api/profile/me/companions` | 是 | 添加同行人 |
| PATCH | `/api/profile/me/companions/:id` | 是 | 更新同行人 |
| DELETE | `/api/profile/me/companions/:id` | 是 | 删除同行人 |
| GET | `/api/profile/me/permissions` | 是 | 获取权限设置 |
| PATCH | `/api/profile/me/permissions` | 是 | 更新权限设置 |

**PATCH /api/profile/me/persona**

Request:
```json
{
  "city": "string (optional)",
  "startPoint": "string (optional)",
  "secondaryStartPoints": ["string"] (optional),
  "favoriteAreas": ["string"] (optional),
  "defaultTimeWindow": "string (optional)",
  "transportMode": "string (optional)",
  "distanceLimitKm": "number (optional)",
  "walkingTolerance": "string (optional)",
  "queueTolerance": "string (optional)",
  "pace": "string (optional)",
  "indoorPreference": "string (optional)",
  "budgetMin": "integer (optional)",
  "budgetMax": "integer (optional)",
  "dietPreference": ["string"] (optional),
  "avoidFoods": ["string"] (optional),
  "healthGoal": "string (optional)",
  "dinnerTimePreference": "string (optional)",
  "activityTags": ["string"] (optional),
  "avoidActivityTags": ["string"] (optional),
  "riskPreference": "string (optional)"
}
```

---

### 4.3 核心数据结构

#### 4.3.1 UserIntent（用户意图）

定义位置：`server/modules/planning/schemas.ts`

```typescript
interface UserIntent {
  raw: string;                              // 原始用户输入
  city: string;                             // 目标城市，默认"杭州"
  origin: {                                  // 出发地
    label: string;
    lat?: number;
    lng?: number;
  };
  date?: string;                            // 日期 YYYY-MM-DD
  departAt?: string;                         // 出发时间 HH:mm
  timeWindow: "morning"|"afternoon"|"evening"|"full_day"|"unknown";
  durationHours: [number, number];           // [最短, 最长] 小时数
  participantMode: "family"|"friends"|"couple"|"solo"|"unknown";
  partySize: number;                         // 参与人数
  budgetMax?: number;                        // 预算上限
  distanceLimitMinutes: number;              // 距离限制（分钟）
  preferences: string[];                     // 用户偏好标签
  mustAsk: string[];                        // 缺失的必要字段
  isPlanningRequest: boolean;               // 是否为规划请求
}
```

#### 4.3.2 CandidatePoi（候选兴趣点）

```typescript
interface CandidatePoi {
  id: string;
  source: "mock"|"amap"|"manual"|"partner";
  name: string;
  category: "activity"|"restaurant"|"movie"|"event"|"shopping"|"scenic"|"transport"|"other";
  address: string;
  lat?: number;
  lng?: number;
  rating?: number;                          // 0-5
  avgPrice?: number;                         // 人均价格
  tags: string[];
  indoor: boolean;                          // 是否室内
  kidFriendly: boolean;                     // 是否亲子友好
  dietFriendly: boolean;                    // 是否减脂友好
  openingHours?: string;                    // 营业时间
  todayOpenStatus: "open"|"closed"|"unknown";
  distanceMinutes?: number;                 // 预估交通时间
  bookingRequired: boolean;                 // 是否需要预约
  bookingAvailable: boolean;                // 是否可预约
  queueRisk: "low"|"medium"|"high"|"unknown";
  riskFlags: string[];
  city?: string;
  adcode?: string;
}
```

#### 4.3.3 ActivityPlan（活动方案）

```typescript
interface ActivityPlan {
  id: string;
  planId: string;
  title: string;
  targetGroup: "family"|"friends"|"couple"|"solo"|"unknown";
  score: number;                            // 0-100
  summary: string;                          // 一句话方案说明
  totalDurationMinutes: number;              // 总时长（分钟）
  totalCostMin: number;                     // 最低总花费
  totalCostMax: number;                     // 最高总花费
  walkingKm?: number;                       // 步行公里数
  assumptions: string[];                   // 方案假设
  highlights: string[];                     // 方案亮点
  risks: string[];                          // 潜在风险
  timeline: TimelineStep[];                 // 时间线步骤（至少2个）
  backupPlan?: string;                      // 备选方案说明
}

interface TimelineStep {
  id: string;
  startTime: string;                       // HH:mm
  endTime: string;                         // HH:mm
  type: "travel"|"activity"|"meal"|"movie"|"event"|"buffer"|"return"|"rest";
  title: string;
  poiId: string | null;
  poiName: string | null;
  durationMinutes: number;
  transport: "driving"|"taxi"|"subway"|"walk"|"mixed"|"none";
  reasoning: string;                        // 为什么安排这个步骤
  bookingNeeded: boolean;                   // 是否需要预约
  actionId: string | null;
}
```

#### 4.3.4 ExecutionAction（可执行动作）

```typescript
interface ExecutionAction {
  id: string;
  planId: string;
  optionId: string;
  userId: string;
  type: "restaurant_reservation"|"ticket_lock"|"calendar_event"|
        "share_message"|"navigation"|"memory_save";
  status: "draft"|"quoted"|"waiting_confirm"|"executing"|
           "success"|"failed"|"expired"|"cancelled";
  title: string;
  description: string;
  confirmationRequired: boolean;            // 是否需要用户确认
  idempotencyKey: string;                  // 幂等键
  priceEstimate?: string;                   // 价格估算
  expiresAt?: string;                      // 过期时间
  payload: Record<string, unknown>;         // 动作参数
}
```

#### 4.3.5 AgentResponse（对话响应）

定义位置：`shared/agentResponse.ts`

```typescript
// 8 种响应类型，通过 type 字段区分

type AgentResponse =
  | { type: "chat"; content: string; conversationId: string; }
  | { type: "identity"; content: string; conversationId: string; }
  | { type: "travel_advice"; content: string; suggestions: string[]; conversationId: string; }
  | { type: "slot_question"; content: string; missingSlots: PlanningSlotKey[]; knownSlots: PlanningSlots; conversationId: string; }
  | { type: "plan"; content: string; data: { planId: string; options: unknown[]; summary: string; }; conversationId: string; }
  | { type: "plan_selected"; content: string; selectedOptionId: string; selectedPlanTitle: string; nextActions: NextAction[]; conversationId: string; }
  | { type: "action_confirm"; content: string; action: PendingAction; conversationId: string; }
  | { type: "error"; content: string; code?: string; conversationId?: string; };

interface NextAction {
  key: string;
  label: string;
}

interface PendingAction {
  id: string;
  title: string;
  description: string;
}

type PlanningSlotKey = "origin"|"budget"|"partySize"|"date"|"timeWindow"|"preference"|"companions";
type PlanningSlots = Partial<Record<PlanningSlotKey, string | number | string[]>>;
```

---

### 4.4 数据库 Schema

#### 4.4.1 核心业务表

**users** — 用户表

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | UUID | PK, default uuid() | 用户 ID |
| email | String | Unique | 邮箱 |
| passwordHash | String | nullable | 密码哈希 |
| displayName | String | default "周末用户" | 显示名称 |
| role | String | default "user" | 角色 |
| mode | String | default "registered" | 账户模式 |
| status | String | default "active" | 账户状态 |
| emailVerifiedAt | DateTime | nullable | 邮箱验证时间 |
| createdAt | DateTime | default now() | 创建时间 |
| updatedAt | DateTime | auto | 更新时间 |
| deletedAt | DateTime | nullable | 软删除时间 |

**plans** — 行程方案表

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | UUID | PK | 方案 ID |
| userId | UUID | FK → users.id | 所属用户 |
| conversationId | UUID | FK → conversations.id, nullable | 关联会话 |
| status | String | default "draft" | 方案状态 |
| title | String | | 方案标题 |
| summary | String | default "" | 方案摘要 |
| intent | JSON | default "{}" | 意图快照 |
| contextSnapshot | JSON | default "{}" | 上下文快照 |
| selectedOptionId | String | nullable | 选中的方案选项 ID |
| favorite | Boolean | default false | 是否收藏 |
| traceId | String | default "" | 追踪 ID |
| createdAt | DateTime | default now() | 创建时间 |
| updatedAt | DateTime | auto | 更新时间 |

**plan_options** — 方案选项表

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | UUID | PK | 选项 ID |
| planId | UUID | FK → plans.id | 所属方案 |
| title | String | | 选项标题 |
| targetGroup | String | default "unknown" | 目标人群 |
| score | Int | default 0 | 评分 0-100 |
| totalDurationMin | Int | default 0 | 总时长（分钟） |
| costMin | Int | default 0 | 最低花费 |
| costMax | Int | default 0 | 最高花费 |
| currency | String | default "CNY" | 货币 |
| assumptions | JSON | default "[]" | 假设条件 |
| risks | JSON | default "[]" | 风险列表 |
| backupPlan | JSON | | 备选方案 |
| validationStatus | String | default "pending" | 校验状态 |
| validationReport | JSON | | 校验报告 |
| summary | String | default "" | 摘要 |
| createdAt | DateTime | default now() | 创建时间 |

**plan_steps** — 时间线步骤表

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | UUID | PK | 步骤 ID |
| planOptionId | UUID | FK → plan_options.id | 所属选项 |
| orderIndex | Int | | 顺序索引 |
| startTime | String | | 开始时间 HH:mm |
| endTime | String | | 结束时间 HH:mm |
| type | String | | 步骤类型 |
| placeId | String | nullable | 地点 ID |
| placeName | String | nullable | 地点名称 |
| action | String | default "" | 执行动作 |
| durationMin | Int | default 0 | 时长（分钟） |
| transport | String | default "none" | 交通方式 |
| bookingNeeded | Boolean | default false | 是否需要预约 |
| metadata | JSON | default "{}" | 附加元数据 |

**actions** — 动作表

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | UUID | PK | 动作 ID |
| userId | UUID | FK → users.id | 所属用户 |
| planId | UUID | FK → plans.id, nullable | 关联方案 |
| planOptionId | UUID | nullable | 关联方案选项 |
| type | String | | 动作类型 |
| status | String | default "proposed" | 动作状态 |
| confirmationRequired | Boolean | default true | 是否需要确认 |
| idempotencyKey | String | Unique | 幂等键 |
| payload | JSON | default "{}" | 动作参数 |
| quote | JSON | nullable | 报价信息 |
| result | JSON | nullable | 执行结果 |
| errorCode | String | nullable | 错误码 |
| errorMessage | String | nullable | 错误信息 |
| expiresAt | DateTime | nullable | 过期时间 |
| createdAt | DateTime | default now() | 创建时间 |
| updatedAt | DateTime | auto | 更新时间 |

**action_events** — 动作事件日志表

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | UUID | PK | 事件 ID |
| actionId | UUID | FK → actions.id | 关联动作 |
| eventType | String | | 事件类型 |
| fromStatus | String | nullable | 转换前状态 |
| toStatus | String | nullable | 转换后状态 |
| payload | JSON | default "{}" | 事件数据 |
| traceId | String | default "" | 追踪 ID |
| createdAt | DateTime | default now() | 创建时间 |

**reservations** — 预订记录表

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | UUID | PK | 预订 ID |
| userId | UUID | FK → users.id | 所属用户 |
| actionId | UUID | Unique, nullable | 关联动作 |
| type | String | | 预订类型 |
| title | String | | 预订标题 |
| status | String | default "draft" | 预订状态 |
| price | String | nullable | 价格 |
| detail | String | default "" | 详情 |
| provider | String | default "mock" | 提供商 |
| providerRef | String | nullable | 提供商引用 |
| metadata | JSON | default "{}" | 附加数据 |
| createdAt | DateTime | default now() | 创建时间 |
| updatedAt | DateTime | auto | 更新时间 |

**conversations** — 会话表

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | UUID | PK | 会话 ID |
| userId | UUID | nullable, FK → users.id | 所属用户 |
| guestId | String | nullable | 访客 ID |
| title | String | default "新规划" | 会话标题 |
| city | String | default "北京" | 目标城市 |
| modelMode | String | default "flash" | 模型模式 |
| agentStateJson | JSON | nullable | Agent 状态快照 |
| selectedOptionId | String | nullable | 选中的方案 ID |
| createdAt | DateTime | default now() | 创建时间 |
| updatedAt | DateTime | auto | 更新时间 |

**messages** — 消息表

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | UUID | PK | 消息 ID |
| conversationId | UUID | FK → conversations.id | 所属会话 |
| role | String | | 角色 (user/assistant) |
| content | String | | 消息内容 |
| payloadJson | JSON | nullable | 附加数据 |
| createdAt | DateTime | default now() | 创建时间 |

**memories** — 记忆表

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | UUID | PK | 记忆 ID |
| userId | UUID | FK → users.id | 所属用户 |
| category | String | | 记忆类别 |
| title | String | | 记忆标题 |
| detail | String | | 记忆详情 |
| weight | Float | default 0.5 | 权重 |
| source | String | default "user" | 来源 |
| createdAt | DateTime | default now() | 创建时间 |
| updatedAt | DateTime | auto | 更新时间 |
| deletedAt | DateTime | nullable | 软删除时间 |

**share_rooms** — 分享房间表

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | UUID | PK | 房间 ID |
| userId | UUID | FK → users.id | 创建者 |
| planId | UUID | nullable | 关联方案 |
| title | String | | 房间标题 |
| status | String | default "active" | 房间状态 |
| inviteCode | String | Unique | 邀请码 |
| metadata | JSON | default "{}" | 附加数据 |
| createdAt | DateTime | default now() | 创建时间 |
| updatedAt | DateTime | auto | 更新时间 |

**share_votes** — 投票记录表

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | UUID | PK | 投票 ID |
| roomId | UUID | FK → share_rooms.id | 所属房间 |
| memberName | String | | 投票人名称 |
| vote | String | | 投票结果 |
| comment | String | nullable | 投票评论 |
| createdAt | DateTime | default now() | 创建时间 |

**companions** — 同行人表

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | UUID | PK | 同行人 ID |
| userId | UUID | FK → users.id | 所属用户 |
| type | String | default "family" | 关系类型 |
| name | String | | 姓名 |
| relation | String | default "" | 关系描述 |
| ageGroup | String | default "adult" | 年龄段 |
| preferences | JSON | default "[]" | 偏好 |
| avoid | JSON | default "[]" | 禁忌 |
| mobility | String | default "normal" | 行动能力 |
| diet | String | default "" | 饮食偏好 |
| notes | String | default "" | 备注 |
| isDefault | Boolean | default false | 是否默认 |
| createdAt | DateTime | default now() | 创建时间 |
| updatedAt | DateTime | auto | 更新时间 |

#### 4.4.2 用户画像表

**user_profiles** — 用户画像表

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | UUID | PK | 画像 ID |
| userId | UUID | Unique, FK → users.id | 所属用户 |
| city | String | default "北京" | 常住城市 |
| startPoint | String | default "家附近" | 常用出发地 |
| homeLat | Float | nullable | 家庭位置纬度 |
| homeLng | Float | nullable | 家庭位置经度 |
| companions | String | default "family" | 默认同行人类型 |
| budgetMin | Int | default 200 | 最低预算 |
| budgetMax | Int | default 300 | 最高预算 |
| preferences | JSON | default "[]" | 偏好列表 |
| familyInfo | JSON | default "[]" | 家庭信息 |
| secondaryStartPoints | JSON | default "[]" | 备选出发地 |
| favoriteAreas | JSON | default "[]" | 偏好区域 |
| defaultTimeWindow | String | default "周末半天" | 默认时间窗口 |
| transportMode | String | default "混合" | 交通方式 |
| distanceLimitKm | Int | default 5 | 距离限制（公里） |
| walkingTolerance | String | default "中" | 步行承受度 |
| queueTolerance | String | default "中" | 排队承受度 |
| pace | String | default "适中" | 行程节奏 |
| indoorPreference | String | default "都可以" | 室内偏好 |
| dietPreference | JSON | default "[]" | 饮食偏好 |
| avoidFoods | JSON | default "[]" | 禁忌食物 |
| healthGoal | String | default "无特殊" | 健康目标 |
| dinnerTimePreference | String | default "18:00-19:00" | 晚餐时间偏好 |
| activityTags | JSON | default "[]" | 活动标签 |
| avoidActivityTags | JSON | default "[]" | 回避的活动标签 |
| riskPreference | String | default "稳妥" | 风险偏好 |
| personaCompleteness | Int | default 0 | 画像完成度 |
| planCount | Int | default 0 | 规划次数 |

**user_permissions** — 用户权限表

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | UUID | PK | 权限 ID |
| userId | UUID | Unique, FK → users.id | 所属用户 |
| locationEnabled | Boolean | default true | 位置权限 |
| memoryEnabled | Boolean | default true | 记忆权限 |
| calendarEnabled | Boolean | default false | 日历权限 |
| shareEnabled | Boolean | default true | 分享权限 |
| developerEnabled | Boolean | default false | 开发者权限 |

#### 4.4.3 开发者 API 表

**developer_apps** — 开发者应用表

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | UUID | PK | 应用 ID |
| userId | UUID | FK → users.id | 所属用户 |
| name | String | | 应用名称 |
| description | String | default "" | 应用描述 |
| environment | String | default "sandbox" | 环境 |
| callbackDomain | String | default "" | 回调域名 |
| status | String | default "active" | 应用状态 |

**api_keys** — API 密钥表

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | UUID | PK | 密钥 ID |
| userId | UUID | FK → users.id | 所属用户 |
| appId | UUID | nullable, FK → developer_apps.id | 关联应用 |
| name | String | | 密钥名称 |
| keyHash | String | | 密钥哈希 |
| prefix | String | | 密钥前缀 |
| scopes | JSON | default "[]" | 权限范围 |
| status | String | default "active" | 密钥状态 |
| environment | String | default "sandbox" | 环境 |
| expiresAt | DateTime | nullable | 过期时间 |
| lastUsedAt | DateTime | nullable | 最后使用时间 |
| revokedAt | DateTime | nullable | 撤销时间 |

**webhooks** — Webhook 表

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | UUID | PK | Webhook ID |
| userId | UUID | FK → users.id | 所属用户 |
| appId | UUID | nullable | 关联应用 |
| url | String | | 回调 URL |
| events | JSON | default "[]" | 订阅事件 |
| secretHash | String | default "" | 密钥哈希 |
| enabled | Boolean | default true | 是否启用 |

**webhook_deliveries** — Webhook 投递记录表

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | UUID | PK | 投递 ID |
| webhookId | UUID | FK → webhooks.id | 关联 Webhook |
| event | String | | 事件类型 |
| payload | JSON | default "{}" | 投递数据 |
| status | String | default "pending" | 投递状态 |
| responseStatus | Int | nullable | 响应状态码 |
| latencyMs | Int | nullable | 延迟（毫秒） |
| errorMessage | String | nullable | 错误信息 |
| attemptCount | Int | default 0 | 重试次数 |
| nextRetryAt | DateTime | nullable | 下次重试时间 |

#### 4.4.4 审计与日志表

**audit_logs** — 审计日志表

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | UUID | PK | 日志 ID |
| userId | UUID | nullable | 操作用户 |
| actorType | String | default "user" | 操作者类型 |
| action | String | | 操作类型 |
| resourceType | String | default "" | 资源类型 |
| resourceId | String | default "" | 资源 ID |
| ipAddress | String | nullable | IP 地址 |
| userAgent | String | nullable | User Agent |
| traceId | String | default "" | 追踪 ID |
| metadata | JSON | default "{}" | 附加数据 |

**llm_call_logs** — LLM 调用日志表

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | UUID | PK | 日志 ID |
| userId | UUID | nullable | 用户 ID |
| traceId | String | default "" | 追踪 ID |
| provider | String | default "openai" | 提供商 |
| model | String | | 模型名称 |
| mode | String | default "mock" | 调用模式 |
| promptTokens | Int | default 0 | 提示 Token 数 |
| completionTokens | Int | default 0 | 完成 Token 数 |
| latencyMs | Int | default 0 | 延迟（毫秒） |
| status | String | default "success" | 调用状态 |
| errorCode | String | nullable | 错误码 |

**tool_call_logs** — 工具调用日志表

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | UUID | PK | 日志 ID |
| userId | UUID | nullable | 用户 ID |
| traceId | String | default "" | 追踪 ID |
| toolName | String | | 工具名称 |
| input | JSON | default "{}" | 输入数据 |
| output | JSON | default "{}" | 输出数据 |
| latencyMs | Int | default 0 | 延迟（毫秒） |
| status | String | default "success" | 调用状态 |
| errorCode | String | nullable | 错误码 |

---

*文档持续更新中...*
