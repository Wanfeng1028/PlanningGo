# 周末去哪儿智能体全面升级计划（分阶段验收版）

## Context

用户反馈当前系统存在三大核心问题：① 方案太笼统；② 按钮点击无反应；③ 缺乏主动执行能力。
本次升级拆为 **5 个 Phase**，每个 Phase 独立 PR、独立测试验收，确保每阶段稳定可用。

## 总规则

### 按钮反馈铁律

每个可点击元素**必须有反馈**（动作/弹窗/toast），不允许空响应。
新建统一工具函数 `src/lib/runPlanAction.ts`：

```ts
runPlanAction({
  actionKey: string,        // 唯一标识
  loadingText: string,      // "正在保存…"
  successText: string,      // "已保存"
  errorText: string,        // "保存失败"
  run: () => Promise<void>, // 实际逻辑
})
```

所有按钮统一走它，提供 3 种状态：loading → success / error。

### 样式复用原则

不新写弹窗/toast 样式，全部复用：
- `GlassToast` + `useGlassToast()` — 操作结果反馈
- `WorkspaceModal` — 确认类弹窗
- `ComingSoonModal` 样式 — 功能未就绪提示

### 外部服务文案规范

按钮文案必须准确，不允许误导：
- 写"查看美团""去大众点评看看""打开高德导航""复制预约信息""生成日历提醒"
- **不写**"预约成功""已买票""已锁定库存"（除非真正接入了服务 API）

---

# Phase 1: 按钮全闭环 + UI 修复 + 方案卡片增强

> 用户最直观感受：点了有没有反应？是否知道自己操作成功了？

## Task 1: 统一 Action 工具函数

**新建**: `src/lib/runPlanAction.ts`

- 导出 `runPlanAction({ actionKey, loadingText, successText, errorText, run })`
- 内部状态: idle → loading → success / error
- 自动调用 `showToast(text, type)` 显示结果
- 防止重复点击（loading 期间禁用）
- 返回 `{ status, execute }` 供组件使用

## Task 2: PlanCardView 按钮全部修复

**文件**: `src/components/features/PlanCardView.tsx`

| 按钮 | 当前问题 | 修复方案 |
|---|---|---|
| 继续调整 (L131-137) | onClick 绑定 onSelect | 新增 `onAdjustPlan` prop → 输入框聚焦 + 预填引导文字 |
| 生成日历 (L138-148) | onClick 绑定 onSelect | 新增 `onGenerateCalendar` prop → 弹窗确认 → 下载 ICS |
| 保存方案 | disabled 或空 onClick | `runPlanAction` 调用 savePlan API |
| 确认/取消 | disabled | 确认→执行，取消→关闭弹窗 + toast |
| action chips (L171) | book_restaurant/reserve_activity disabled | 加入 implemented，走 `runPlanAction` |
| 功能未就绪 | 无反馈 | 统一弹 `ComingSoonModal` 样式 |

所有新增 props callback 未传时 fallback 到 `showToast("功能开发中", "info")`。

## Task 3: FeaturesPage handler 实现

**文件**: `src/pages/FeaturesPage.tsx`

- `handleAdjustPlan`: 设置 phase + 预填输入框 + 聚焦
- `handleGenerateCalendar`: 弹窗确认 → 下载 ICS + toast
- `handleSavePlan`: 调用 `POST /api/plans/save` + toast
- `handleOpenNavigation`: 多点导航 URL（坐标兜底规则见 Phase 3 Task 11）
- `handleViewReservations`: 弹窗显示预约建议列表
- 所有 handler 统一用 `runPlanAction` 包裹

## Task 4: PlanCardView 渲染增强

**文件**: `src/components/features/PlanCardView.tsx`

- timeline 渲染增加 `description`、`estimatedCost`、`bookingHint`
- 增加 `suggestions` 气泡标签
- 每个有 poiName 的步骤添加"外部服务"展开入口

**文件**: `src/pages/FeaturesPage.module.scss`

- 新增: `.timelineDesc`, `.timelineCost`, `.bookingHint`, `.suggestionChip`

## Task 5: Action 幂等与状态机

**文件**: `src/server/modules/execution/actionExecutor.ts` + `actionService.ts`

- 所有 plan action 使用 `idempotencyKey`（conversationId + actionType + optionId）
- 同一个 conversationId + optionId 只能有一条 `plan_selected` 消息
- 后端查询已有记录后更新，不重复插入
- 前端按钮选中后 disabled 或显示"已选择"

**文件**: `src/pages/FeaturesPage.tsx`

- 已选中的方案按钮变为 disabled + 文案"已选择"

## Task 6: 代码组织优化

**新建**: `src/components/features/usePlanActions.ts`

- 将 FeaturesPage 中所有 handler 抽取到自定义 Hook
- 避免 FeaturesPage.tsx 继续膨胀（当前 1876 行）

### Phase 1 验收

| 场景 | 预期结果 |
|---|---|
| 点击任何按钮 | 有 loading/success/error 反馈，无"点了没反应" |
| 点击"继续调整" | 输入框聚焦，预填修改引导 |
| 点击"生成日历" | 弹窗确认 → 下载 .ics |
| 点击"保存方案" | toast "已保存" 或 "保存失败" |
| 重复点击"选这套" | 第二次无反应，按钮已显示"已选择" |
| 点击未实现功能 | 弹出"即将上线"提示 |

---

# Phase 2: 3 套方案 + timeline 细节 + schema 完整

> 方案从 2 套扩展为 3 套，每套 5-7 步详细 timeline。

## Task 7: Schema 扩展

**文件**: `src/server/modules/planning/schemas.ts`

- `timelineStepSchema` 新增: `description?`, `estimatedCost?`, `bookingHint?`, `suggestions?`
- `ActivityPlan` 新增 `suggestions?: PlanSuggestion[]`
- 新增 `PlanSuggestion` 接口

**文件**: `prisma/schema.prisma`

- `PlanStep` 新增: `description String?`, `estimatedCost String?`, `bookingHint String?`, `suggestions Json @default("[]")`
- 新增 `PlanSuggestion` 模型（关联 PlanStep）
- 执行迁移: `npx prisma migrate dev --name add_step_details_and_suggestions`

## Task 8: 方案生成改进（3 套 + 细节）

**文件**: `src/server/modules/agent/planner.ts`

- `generateMockPlans()` 返回 3 套:
  - ① 主户外路线（增强 `buildPrimaryPlan`）
  - ② 美食社交路线（新增 `buildSocialFoodiePlan`）
  - ③ 室内备选（`buildIndoorBackupPlan`）
- 每套 timeline 5-7 步，每步加 `description`、`estimatedCost`、`bookingHint`
- `SYSTEM_PROMPT` 改为要求 2-3 套方案
- `PLAN_JSON_SCHEMA_DESC` 增加新字段描述
- `llmPlanItemSchema` timeline 增加 4 个可选字段

## Task 9: 规划约束校验器增强

**文件**: `src/server/modules/planning/validator.ts`

- `validatePlans` 强校验：
  - 总预算是否超过用户预算
  - 开始时间是否正确（用户说 9 点不能变成 14:00）
  - timeline 时间是否连续（无跳跃/重叠）
  - transport 时间是否合理
  - POI 是否重复
  - 餐厅出现在 meal step，咖啡出现在 coffee/rest step
  - 步行距离是否超过 walkingTolerance
  - 是否用了用户忌口食物
  - 是否违反"少排队"偏好
- 不通过时自动修正或标记风险（不静默通过）

## Task 10: LLM Schema 兼容性

- 新增字段均为 optional，旧模型不输出时 Zod `.default()` 兜底
- 前端对新字段用 `?.` 保护，确保旧数据不报错

### Phase 2 验收

| 场景 | 预期结果 |
|---|---|
| 输入"明天10点从杭师大仓前…" | 返回 3 套方案，每套 5-7 步 |
| 方案中餐厅步骤 | 有 description、estimatedCost、bookingHint |
| 预算 200 | 方案总预算不超过 200 |
| 用户说上午 9 点 | 第一步时间正确，不会变成 14:00 |
| 用户说咖啡+火锅 | 方案包含咖啡和火锅步骤，不是泛泛景点游览 |

---

# Phase 3: 保存方案 / 日历 / 导航 / 预约建议

> 让方案真正可执行——持久化到数据库、写入日历、打开导航、查看预约。

## Task 11: 修复"保存方案" + 持久化

**新增 API**: `POST /api/plans/save`

- 入参: `{ conversationId, planId, optionId }`（不用 lastPlanResult）
- 后端从 DB messages 的 `payloadJson` 根据 planId + optionId **精确查找**方案，再保存
- 写入 `Plan` + `PlanOption` + `PlanStep` 表
- 幂等: 同一 optionId 重复保存不重复插入

**文件**: `src/lib/api.ts` — 新增 `savePlanToDb(input)`

## Task 12: 修复"生成日历" + ICS 改进

**后端 ICS 改进**:

- 接受完整 timeline `steps[]`
- 为每个 step 生成 `VEVENT`:
  - `UID`（唯一标识）
  - `DTSTAMP`
  - `DTSTART;TZID=Asia/Shanghai`
  - `DTEND;TZID=Asia/Shanghai`
  - `SUMMARY`（步骤标题）
  - `LOCATION`（POI 地址）
  - `DESCRIPTION`（步骤描述 + 费用）
  - `VALARM`（出发前 30 分钟提醒）
- **"明天"日期解析**: 后端把"明天上午9点"解析成真实日期（如 2026-06-04T09:00），不能只写 09:00
- 时区固定 `TZID: Asia/Shanghai`

## Task 13: 修复"打开导航" + 坐标兜底

**文件**: `src/pages/FeaturesPage.tsx`

- 导航 URL 坐标兜底规则:
  1. 有 lat/lng → 优先坐标
  2. 无坐标但有 poiName → keyword 搜索 URL
  3. 无 poiName → 不加入 via
  4. 只有 origin/destination → 普通导航
  5. 完全没有有效点 → toast "当前方案缺少可导航地点"
- **不生成** `from=杭师大仓前&via=null|null&to=undefined` 这种无效路线

## Task 14: 修复"查看预约建议"

**文件**: `src/pages/FeaturesPage.tsx`

- 从选中方案 timeline 提取 `bookingNeeded === true` 的步骤
- 弹窗（`WorkspaceModal`）显示: POI 名称、地址、建议预约时间
- 按钮: "在高德查看"、"查看美团"（deep link）、"稍后再说"
- 文案规范: 只写"查看""去预约"，不写"预约成功"

### Phase 3 验收

| 场景 | 预期结果 |
|---|---|
| 点击"保存方案" | Toast "已保存"，DB Plan 表有记录，刷新后可恢复 |
| 重复保存同一方案 | 幂等，不重复插入 |
| 点击"生成日历" | 下载 .ics，TZID=Asia/Shanghai，每步有完整 VEVENT |
| ICS 中"明天" | 解析为真实日期（如 2026-06-04），非占位符 |
| 点击"打开导航" | 有效坐标/名称打开高德，无 null/undefined 参数 |
| 方案无可导航点 | toast "当前方案缺少可导航地点" |
| 点击"查看预约建议" | 弹窗显示需预约的步骤列表 |

---

# Phase 4: 高德 POI + 路线计算 + 建议引擎 + 缓存降级

> 方案从"泛泛推荐"升级为"真实 POI + 真实路线 + 智能建议"。

## Task 15: Amap 调用缓存与降级

**新建**: `src/server/modules/tools/amap/amapCache.ts`

- POI 搜索缓存: 相同 keyword + city + around 坐标，缓存 30 分钟
- 路线计算缓存: 相同 origin/destination，缓存 30 分钟
- 调用预算管理: flash 最多 12 次，pro 最多 30 次
- 降级策略:
  - 高德失败 → 不整个规划失败，降级为"区域级推荐"
  - Agent Trace 显示"地图服务暂不可用，已切换为本地规划"
  - 降级后的方案标注"POI 数据为参考，建议在高德确认"

## Task 16: 高德 POI 深度集成

**文件**: `src/server/modules/planning/candidateGenerator.ts`

- 扩展 `CandidatePool`，新增 `cafes`、`cinemas` 类别
- `generateFromProvider()` 增加搜索

**新建**: `src/server/modules/planning/poiEnricher.ts`

- `enrichPlanWithPoiDetails(plans, amapClient)`: 补全 address、rating、avgPrice
- 在 POI 附近搜索周边服务（根据场景智能搜索）

## Task 17: POI 评分与去重系统

**新建**: `src/server/modules/planning/poiScorer.ts`

- 评分维度:
  - 距离（近 → 高分）
  - 评分（高 → 高分）
  - 人均价是否匹配预算
  - 是否适合当前同行人
  - 是否可能排队（queueTolerance 联动）
  - 是否室内/户外（indoorPreference 联动）
  - 是否靠近下一个行程点（路线顺路程度）
  - 是否符合用户画像（activityTags、dietPreference）
- 去重: 同坐标同名称 POI 去重
- 过滤: 人均远超预算、距离过远、高峰排队店、下午才营业的店
- planner 使用 scored POI，不直接拿搜索结果拼方案

## Task 18: 交通路线计算

**新建**: `src/server/modules/planning/routeCalculator.ts`

- `calculateRouteTimes(plan, amapClient)`: 对连续 POI 对调用路线 API
- 更新 step 的 `transport`、`durationMinutes`，重算后续步骤时间

**文件**: `src/server/modules/agent/planner.ts` — 导出 `timeToMinutes()` 和 `minutesToTime()`

## Task 19: 上下文感知周边服务推荐系统

**新建**: `src/server/modules/suggestions/suggestionEngine.ts`

- 场景推理引擎: 步骤类型 + 时间段 + 同行人 + 位置 → 推荐类别
  | 场景 | 推荐类别 |
  |---|---|
  | 饭后 | 饮品、甜品、散步公园、桌游 |
  | 游览后 | 拍照打卡点、纪念品店、休息区 |
  | 带娃 | 母婴室、儿童乐园、冰淇淋、绘本馆 |
  | 情侣 | 花店、甜品店、私人影院、手工DIY |
  | 朋友 | 桌游吧、密室逃脱、电玩城、酒吧 |
  | 等待/休息 | 便利店、咖啡店、书店、按摩 |
  | 晚间 | 夜市、酒吧街、灯光秀、演出 |
- 调用 `amapClient.searchPoiAround()` 获取真实门店
- 每个建议附带可执行动作: 跳转导航、团购、加入行程

**新建**: `src/components/features/SuggestionChips.tsx`

- 横向滚动建议条
- 行为: "加进行程" / "去看看" / "团购" / "点外卖"

## Task 20: 外部服务深度链接

**新建**: `src/server/modules/tools/deepLinks.ts`

- `generateDeepLink({ provider, poiName, lat, lng, action })`:
  - 美团: `https://i.meituan.com/s/{poiName}`
  - 大众点评: `https://m.dianping.com/search?keyword={poiName}`
  - 饿了么: `https://h5.ele.me/search/?keyword={poiName}`
  - 高德: 现有逻辑

**新建**: `src/components/features/ExternalServicePanel.tsx`

- 折叠面板，列出每个 POI 可用的外部服务链接

## Task 21: 编排器管线集成

**文件**: `src/server/modules/agent/orchestrator.ts`

- 完整管线:
  1. `loadUserProfile` (从 DB 加载画像)
  2. `candidateGenerator` (POI 搜索，画像过滤)
  3. `contextBuilder` (天气 + 画像融合)
  4. `planner` (3 套方案，画像驱动)
  5. `poiEnricher` (POI 详情补全)
  6. `poiScorer` (POI 评分 + 过滤)
  7. `routeCalculator` (交通时间计算)
  8. `suggestionEngine` (周边建议生成)
  9. `validator` (强校验)
  10. `actionService` (动作生成)
  11. `syncProfileFromPlan` (画像沉淀)

### Phase 4 验收

| 场景 | 预期结果 |
|---|---|
| meal 步骤后 | 显示多种周边服务推荐，可加进行程或跳转第三方 |
| POI 评分 | 人均 300 的店不出现在预算 200 的方案中 |
| POI 去重 | 同名称同坐标的店不重复出现 |
| 高德失败 | 方案仍可生成，标注"POI 数据为参考" |
| 路线时间 | 连续步骤间有真实交通耗时 |
| 外部服务 | 美团/点评/饿了么链接可正常跳转 |

---

# Phase 5: 画像加载 + 画像沉淀 + Agent Trace + E2E

> 让系统"记住"用户，过程可观测，端到端可验收。

## Task 22: 人物画像深度融入规划管线

**文件**: `src/server/modules/planning/contextBuilder.ts`

- `UserProfileInfo` 接口扩展，加入所有 DB 画像字段
- `buildPlanningContext()` 新增 DB 查询:
  - 有 userId 时 `db.userProfile.findUnique()` 加载完整画像
  - intent 优先，DB 作为默认值，无 userId 用默认值兜底

**文件**: `src/server/modules/agent/planner.ts`

- 画像驱动方案生成:
  - `transportMode` → step.transport
  - `distanceLimitKm` → 过滤 POI
  - `walkingTolerance` → 步行距离
  - `queueTolerance` → 排队风险提示
  - `dietPreference` / `avoidFoods` → 餐厅过滤
  - `activityTags` / `avoidActivityTags` → 活动匹配/过滤
  - `indoorPreference` → 室内/室外倾向
  - `pace` → buffer 时间
  - `favoriteAreas` → POI 优先

**文件**: `src/server/modules/agent/prompts.ts`

- `SystemPromptContext` 新增 `userProfile`，LLM 能看到画像段落

**文件**: `src/server/modules/agent/agentRuntime.ts`

- `runAgentChatStream()` 构建 systemPrompt 时加载 UserProfile

## Task 23: 规划后记忆沉淀与画像更新

**文件**: `src/server/modules/agent/memoryExtractor.ts`

- 新增 `extractMemoryFromPlanSelection()`:
  - 记录选中/拒绝方案、活动偏好、餐厅偏好、预算实际值、出行模式

- 新增 `syncProfileFromPlan()`:
  - 更新 `planCount`、`personaCompleteness`、`activityTags`、`dietPreference`、`budgetMin/budgetMax`

- **画像置信度（防过度学习）**:
  - 画像字段加权重: `{ tag, weight, source, lastSeenAt, count }`
  - 一次选择不永久改变，多次选择才提升权重
  - 维护: 出现次数、最近一次出现时间、来源

**集成点**:
- `agentRuntime.ts`: 方案生成后调用 `syncProfileFromPlan()`
- `chatRouter.ts`: 用户选择方案后调用 `extractMemoryFromPlanSelection()`
- `FeaturesPage.tsx`: `handleSelectPlan()` 调用 `POST /api/agent/plan-feedback`

## Task 24: 用户画像可见与可编辑

> 如果只在后台默默更新，用户会觉得奇怪。

**新增页面或弹窗**: "我的偏好"入口

- 显示简单版画像:
  - 常用出发地、预算偏好、交通偏好、排队容忍度
  - 饮食偏好、喜欢的活动
- 允许: 修改、删除、关闭个性化
- 复用 `WorkspaceModal` 样式

## Task 25: Agent Trace 真实执行旁栏

> 旁栏展示的不是假动画，而是真实 pipeline 事件。

**后端**: orchestrator 每一步输出 trace event

- 事件顺序:
  1. 理解需求
  2. 读取用户画像
  3. 查询天气
  4. 搜索 POI
  5. 筛选餐厅/咖啡/活动
  6. 计算路线
  7. 生成 3 套方案
  8. 校验预算和时间
  9. 生成可执行动作
  10. 保存上下文

- 通过 SSE 实时推送给前端
- **只显示安全的执行摘要**，不暴露 chain-of-thought:
  - "正在搜索西湖附近咖啡馆"
  - "找到 12 个候选地点，筛选评分 4.5+ 的店"
  - "正在计算杭师大仓前到西湖的交通时间"
  - "已生成 3 套路线"

**前端**: 旁栏实时显示 trace 列表（不复用思维链，显示用户友好的进度文字）

## Task 26: 开发数据清理/认领命令

- `npm run dev:claim-conversations` — 将 userId=null 的对话认领到当前用户
- `npm run dev:clean-anonymous` — 清理匿名对话
- `npm run dev:seed-demo-history` — 种入演示历史数据
- `npm run dev:reset-xiaoming` — 重置测试用户

确保每次测试不被历史脏数据干扰。

## Task 27: E2E 浏览器验收

**新增**: Playwright E2E 测试

- 测试流程:
  1. 注册 + 登录
  2. 输入测试语料（见下方验收数据样例）
  3. 等待 3 套方案出现
  4. 点击"继续调整"
  5. 点击"生成日历"
  6. 点击"保存方案"
  7. 点击"打开导航"
  8. 点击"预约建议"
  9. 刷新页面
  10. 确认方案恢复
  11. 点击左侧历史，确认消息同步

## Task 28: 验收数据样例（固定测试语料）

| 场景 | 输入 | 验收要点 |
|---|---|---|
| A: 单人西湖咖啡火锅 | "从杭师大仓前出发，明天上午9点，一个人，先找咖啡厅坐坐，中午吃火锅，预算200" | 3 套方案、具体 POI、预算不乱、按钮有反馈 |
| B: 朋友雨天杭州 | "明天杭州下雨，和朋友吃饭逛逛，预算300，少走路，别排队" | 室内为主、不推荐排队店 |
| C: 亲子半日 | "周末带娃半天，预算300，室内优先，别太累" | 亲子活动、步行少、有母婴相关 |
| D: 情侣约会 | "周六晚上和对象约会，想吃饭看电影，预算500，氛围好一点" | 氛围餐厅、影院、情侣推荐 |

每个场景验收: 3 套方案、具体 POI、预算不乱、按钮有反馈、历史可恢复、画像可沉淀。

---

## Phase 执行顺序总结

```
Phase 1 (按钮全闭环)     → PR → 测试 → 合入
Phase 2 (3套方案+schema) → PR → 测试 → 合入
Phase 3 (保存/日历/导航)  → PR → 测试 → 合入
Phase 4 (高德+POI+建议)  → PR → 测试 → 合入
Phase 5 (画像+Trace+E2E) → PR → 测试 → 合入
```

## 风险注意

1. **高德 API 配额**: Phase 4 引入缓存 + 调用预算（flash 12次 / pro 30次），失败降级为区域级推荐
2. **LLM 兼容性**: 新增字段均为 optional，Zod `.default()` 兜底
3. **数据库迁移**: Phase 2 有一次迁移，生产走 `prisma migrate deploy`
4. **向后兼容**: 前端对新字段用 `?.` 保护
5. **画像加载性能**: 确保 UserProfile 索引正确，考虑缓存
6. **画像隐私**: 不在日志中打印完整画像，前端不暴露原始数据
7. **幂等性**: 所有写操作带 idempotencyKey
8. **ICS 时区**: 固定 `TZID: Asia/Shanghai`，日期解析真实值
9. **导航链接**: 坐标兜底，不生成 null/undefined 参数
10. **外部服务文案**: 不写"预约成功""已买票"等误导性文案
