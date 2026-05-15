# 周末有谱 Web Design System

> Phase A 结论：本规范基于 `desktop_svg-43`、`individual_svg-28`、整合增强版 `weekend_agent_integrated_design`、最终重绘版 `weekend_agent_final_rich_design_v2` 的 100 张桌面端 SVG、60 张移动端 SVG、设计包 README 与 `周末有谱_开发技术栈.md` 提取。最终实现以 React + Vite + TypeScript + SCSS/CSS Modules 为前端基线，明确不使用 Tailwind CSS；优先前端可上线体验，后续再接 Fastify / Agent 服务。

## 1. Visual Theme & Atmosphere

### 设计哲学

周末有谱是一个「本地生活规划 Agent」，不是普通搜索或攻略站。视觉应传达三件事：可信、会做事、有周末生活温度。页面要像一张已经被整理好的周末行动桌面：信息密度足够、路径清楚、操作按钮明确，但整体仍然温暖、轻松、有人味。

### 氛围关键词

- 暖色城市生活：米白底、黄主色、浅灰绿地图块，贴近美团本地生活语境。
- 强执行感：粗体标题、清晰卡片、工具调用栈、状态清单和授权边界。
- 家庭友好：留白柔和，圆角偏大，弱化冷冰冰的 SaaS 感。
- Agent 可信：每一步展示「为什么这么规划」「调用了什么工具」「哪里需要用户确认」。
- 演示可讲：页面流程需要能支撑黑客松答辩，从首页一句话到授权、执行、分享、记忆沉淀闭环。

### 一句话定调

暖黄、粗体、白色胶囊导航、几何底图、卡片化执行流：让用户觉得「周末这件麻烦事真的被安排好了」。

### 信息架构

桌面端主导航固定为：

```text
首页 / 功能 / 场景案例 / 设计亮点 / 开发者 / 个人中心
```

右侧固定为：

```text
注册 / 登录
```

已登录后可替换为用户昵称 + 退出，但未登录态必须保留注册和登录入口。

完整产品流程按设计稿整理为：

1. 首页：价值表达、问题定义、Demo 故事、小明已登录演示入口。
2. 功能：一句话需求、定位授权、起点确认、同行人选择、约束收集、画像合并、Agent 工作台、工具调用、三方案、方案对比、路线地图、餐厅/票务/活动/配送、授权、支付交接、执行队列、分享协作、What-if、风险重规划、评分、记忆沉淀。
3. 场景案例：家庭西湖下午、朋友展览 Citywalk、情侣减脂晚餐、雨天室内兜底、亲子低负担、晚出发压缩、答辩故事板。
4. 设计亮点：颜色字体、底图规范、组件库、弹窗库、状态页、导航一致性、数据需求矩阵。
5. 开发者：API Key、工具调用日志、Webhook、质量看板、测试数据集。
6. 个人中心：画像、登录注册、通知账号、隐私安全、记忆导出。

### 设计稿归并原则

必须同时吸收 43 页、28 页和 100 页设计稿，而不是只实现最终 100 页的表层顺序。

- `desktop_svg-43`：作为原始导航、核心产品闭环和基础页面职责来源，决定「必须有的业务页面」。
- `individual_svg-28`：作为差异布局和补充页面来源，保留它与 43 页不同的页面主体，不重复建路由时转为组件变体、弹窗或状态面板。
- `weekend_agent_integrated_design/desktop_pages_100`：作为 43 + 28 + 新增页的首次整合地图，用来判断重复页面如何合并。
- `weekend_agent_final_rich_design_v2/desktop_pages_100`：作为最终视觉和 Demo 主线来源，用来确定最终页面顺序、颜色、字体、底图、卡片密度和移动端补齐。
- `mobile_pages_60`：作为移动端信息架构和底部导航来源，移动端不逐页照搬桌面，按任务流归并为首页、规划、地图、消息、我的。

### 路由与弹窗归并表

最终站点只保留六个主导航入口，内部用子视图、步骤、Tab、弹窗、Drawer、Bottom Sheet 承载。

### 弹窗化规则

以下设计稿主题不单独占主导航页面，优先做成 Modal / Drawer / Bottom Sheet：

- 身份选择、游客默认画像、登录、注册、首次画像设置。
- 定位授权、手动起点确认、孩子偏好、预算冲突、天气提醒。
- 餐厅预约表单、票务锁单授权、活动票务预约、支付交接。
- 细粒度授权、日历通知授权、协作邀请权限、多人投票。
- 空状态、加载状态、错误状态、执行失败兜底提示。
- 隐私确认、数据导出、删除记忆、API Key 创建/撤销。

弹窗不等于删页面：每个弹窗主题都需要在对应主流程中可触达，并在移动端转换为底部 Sheet。

### 技术路线硬约束

- 不使用 Tailwind CSS（这句话不需要写在网页端）。
- 样式使用 SCSS + CSS Modules，公共 token 放在 `src/styles/tokens.scss` 或等价全局样式文件中。
- 组件库可用 shadcn/ui 的设计思想，但不引入 Tailwind 依赖；如需基础组件，优先手写语义化 React 组件或选 Mantine。
- 图标使用 `lucide-react`。
- 动效使用 Framer Motion + CSS transition。

## 2. Color Palette & Roles

所有颜色必须通过 CSS 变量引用。禁止在业务组件里直接写 hex。

```css
:root {
  /* Brand */
  --color-brand: #ffcc33;
  --color-brand-rgb: 255 204 51;
  --color-brand-hover: #ffd84d;
  --color-brand-hover-rgb: 255 216 77;
  --color-brand-pressed: #eeb81f;
  --color-brand-pressed-rgb: 238 184 31;

  /* Text */
  --color-text-primary: #111213;
  --color-text-primary-rgb: 17 18 19;
  --color-text-strong: #151515;
  --color-text-strong-rgb: 21 21 21;
  --color-text-secondary: #6f6a62;
  --color-text-secondary-rgb: 111 106 98;
  --color-text-inverse: #ffffff;
  --color-text-inverse-rgb: 255 255 255;

  /* Background */
  --color-page: #f7f1e7;
  --color-page-rgb: 247 241 231;
  --color-surface: #fffdf8;
  --color-surface-rgb: 255 253 248;
  --color-surface-warm: #fff8ea;
  --color-surface-warm-rgb: 255 248 234;
  --color-surface-muted: #f4ebdd;
  --color-surface-muted-rgb: 244 235 221;
  --color-panel: #efe6d8;
  --color-panel-rgb: 239 230 216;

  /* Border */
  --color-border: #e7ddce;
  --color-border-rgb: 231 221 206;
  --color-border-strong: #e3d7c7;
  --color-border-strong-rgb: 227 215 199;

  /* Map / Ambient */
  --color-map-water: #cfe5dd;
  --color-map-water-rgb: 207 229 221;
  --color-ambient-grey: #c9d1d3;
  --color-ambient-grey-rgb: 201 209 211;
  --color-ambient-mist: #dde7e8;
  --color-ambient-mist-rgb: 221 231 232;
  --color-ambient-olive: #706736;
  --color-ambient-olive-rgb: 112 103 54;

  /* Semantic */
  --color-success: #27ae60;
  --color-success-rgb: 39 174 96;
  --color-warning: #ffcc33;
  --color-warning-rgb: 255 204 51;
  --color-danger: #d94a38;
  --color-danger-rgb: 217 74 56;
  --color-info: #3b7f8f;
  --color-info-rgb: 59 127 143;

  /* Gradients */
  --gradient-warm: linear-gradient(135deg, #fffdf8 0%, #f5ebd8 100%);
  --gradient-brand: linear-gradient(90deg, #ffcc33 0%, #ffd84d 100%);
  --gradient-dark: linear-gradient(135deg, #111213 0%, #2a2620 100%);
}
```

### 颜色使用规则

- 页面背景用 `--color-page`，叠加黄/灰/橄榄几何氛围块。
- 主要 CTA、当前导航、路线高亮用 `--color-brand`。
- 大标题和关键数字用 `--color-text-primary`，必须足够粗。
- 说明文字用 `--color-text-secondary`，不使用浅灰到不可读。
- 卡片用 `--color-surface`；地图/路线容器可用 `--color-panel`。
- 错误和危险状态只在支付、授权、执行失败、删除记忆等场景使用，不抢主色。

## 3. Typography Rules

### 字体导入

```css
@import url("https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;600;700;800;900&family=Inter:wght@500;600;700;800;900&display=swap");

:root {
  --font-sans: "Noto Sans SC", "Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", "Inter", Arial, sans-serif;
  --font-number: "Inter", "Noto Sans SC", Arial, sans-serif;
}
```

### 字号层级

| Token | Desktop | Mobile | Weight | Line Height | 用途 |
|---|---:|---:|---:|---:|---|
| `--text-hero` | 56px | 34px | 900 | 1.08 | 首页 Hero 主标题 |
| `--text-display` | 48px | 30px | 900 | 1.12 | 关键章节标题 |
| `--text-page-title` | 40px | 27px | 900 | 1.18 | 页面标题 |
| `--text-section` | 28px | 22px | 900 | 1.25 | 卡片组标题 |
| `--text-card-title` | 22px | 18px | 900 | 1.35 | 卡片标题 |
| `--text-body-lg` | 18px | 16px | 800 | 1.75 | 重要说明 |
| `--text-body` | 16px | 15px | 700 | 1.75 | 正文 |
| `--text-label` | 14px | 13px | 800 | 1.45 | 标签、表头、按钮 |
| `--text-caption` | 12px | 11px | 800 | 1.45 | 页码、辅助说明 |
| `--text-metric` | 32px | 24px | 900 | 1.05 | 价格、时长、评分 |

```css
:root {
  --text-hero: clamp(2.125rem, 4vw, 3.5rem);
  --text-display: clamp(1.875rem, 3.5vw, 3rem);
  --text-page-title: clamp(1.6875rem, 3vw, 2.5rem);
  --text-section: clamp(1.375rem, 2vw, 1.75rem);
  --text-card-title: clamp(1.125rem, 1.5vw, 1.375rem);
  --text-body-lg: 1.125rem;
  --text-body: 1rem;
  --text-label: 0.875rem;
  --text-caption: 0.75rem;
  --text-metric: clamp(1.5rem, 2.5vw, 2rem);
}
```

### 字体规则

- 中文字体必须在字体栈前面，禁止只写英文字体。
- 中文正文行高不低于 `1.7`，移动端正文不低于 `15px`。
- 标题允许 800/900 粗体，正文通常为 700，避免细字造成和设计稿不一致。
- 字距保持 `letter-spacing: 0.02em`，不要使用负字距。
- 长按钮、卡片标题、导航项必须允许换行或收缩，禁止文字撑破容器。

## 4. Component Stylings

### Global CSS 基础

```css
* {
  box-sizing: border-box;
}

html {
  scroll-behavior: smooth;
  background: var(--color-page);
}

body {
  margin: 0;
  font-family: var(--font-sans);
  color: var(--color-text-primary);
  background: var(--color-page);
  letter-spacing: 0.02em;
  overflow-x: hidden;
}

button,
input,
textarea,
select {
  font: inherit;
}

:focus-visible {
  outline: 3px solid rgb(var(--color-brand-rgb) / 0.55);
  outline-offset: 3px;
}
```

### 背景底图

```css
.app-shell {
  min-height: 100vh;
  position: relative;
  overflow-x: clip;
  background:
    radial-gradient(circle at 86% 16%, rgb(var(--color-brand-rgb) / 0.22) 0 14rem, transparent 14.5rem),
    radial-gradient(circle at 8% 88%, rgb(var(--color-ambient-mist-rgb) / 0.55) 0 13rem, transparent 13.5rem),
    linear-gradient(180deg, var(--color-page), var(--color-page));
}

.app-shell::before {
  content: "";
  position: fixed;
  inset: 0;
  pointer-events: none;
  background:
    linear-gradient(130deg, transparent 0 72%, rgb(var(--color-ambient-olive-rgb) / 0.12) 72% 88%, transparent 88%),
    linear-gradient(18deg, rgb(var(--color-ambient-grey-rgb) / 0.45) 0 18%, transparent 18% 100%);
  opacity: 0.9;
}
```

### 顶部导航

```css
.top-nav {
  position: sticky;
  top: 24px;
  z-index: 50;
  width: min(1360px, calc(100vw - 48px));
  height: 76px;
  margin: 24px auto 0;
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 28px;
  padding: 0 34px;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: rgb(var(--color-surface-rgb) / 0.96);
  box-shadow: var(--shadow-sm);
  backdrop-filter: blur(10px);
}

.brand-mark {
  display: inline-flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
  color: var(--color-text-primary);
  font-size: 18px;
  font-weight: 900;
  text-decoration: none;
}

.brand-dot {
  position: relative;
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: var(--color-brand);
}

.brand-dot::after {
  content: "";
  position: absolute;
  right: 7px;
  top: 7px;
  width: 11px;
  height: 11px;
  border-radius: 50%;
  background: var(--color-text-primary);
}

.nav-links {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-width: 0;
}

.nav-link {
  min-height: 44px;
  padding: 0 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  color: var(--color-text-primary);
  font-size: 15px;
  font-weight: 800;
  text-decoration: none;
  white-space: nowrap;
  transition: background 180ms ease, transform 180ms ease, box-shadow 180ms ease;
}

.nav-link:hover {
  background: rgb(var(--color-brand-rgb) / 0.18);
  transform: translateY(-1px);
}

.nav-link:active {
  transform: translateY(0);
}

.nav-link[aria-current="page"] {
  background: var(--color-brand);
  box-shadow: var(--shadow-sm);
}

.nav-link[aria-disabled="true"] {
  color: rgb(var(--color-text-secondary-rgb) / 0.45);
  pointer-events: none;
}

.nav-actions {
  display: inline-flex;
  align-items: center;
  gap: 12px;
}
```

### 按钮

```css
.button {
  min-height: 48px;
  min-width: 48px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 24px;
  border: 0;
  border-radius: 999px;
  font-size: 16px;
  font-weight: 900;
  line-height: 1;
  text-decoration: none;
  cursor: pointer;
  transition: transform 180ms ease, box-shadow 180ms ease, background 180ms ease, color 180ms ease;
}

.button:hover {
  transform: translateY(-2px);
}

.button:active {
  transform: translateY(0);
}

.button:disabled,
.button[aria-disabled="true"] {
  cursor: not-allowed;
  opacity: 0.45;
  transform: none;
  box-shadow: none;
}

.button-primary {
  color: var(--color-text-primary);
  background: var(--color-brand);
  box-shadow: var(--shadow-sm);
}

.button-primary:hover {
  background: var(--color-brand-hover);
}

.button-primary:active {
  background: var(--color-brand-pressed);
}

.button-dark {
  color: var(--color-text-inverse);
  background: var(--color-text-strong);
}

.button-dark:hover {
  background: var(--color-text-primary);
  box-shadow: var(--shadow-sm);
}

.button-ghost {
  color: var(--color-text-primary);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
}

.button-ghost:hover {
  background: var(--color-surface-warm);
  box-shadow: var(--shadow-sm);
}
```

### 卡片

```css
.card {
  position: relative;
  min-width: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  background: var(--color-surface);
  box-shadow: var(--shadow-md);
  overflow: hidden;
}

.card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-lg);
}

.card:focus-within {
  outline: 3px solid rgb(var(--color-brand-rgb) / 0.45);
  outline-offset: 4px;
}

.card[data-selected="true"] {
  border-color: var(--color-brand);
  box-shadow: 0 0 0 4px rgb(var(--color-brand-rgb) / 0.18), var(--shadow-md);
}

.card[data-disabled="true"] {
  opacity: 0.58;
  pointer-events: none;
}
```

### 标签 / 状态

```css
.tag {
  min-height: 30px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 14px;
  border-radius: 999px;
  background: var(--color-brand);
  color: var(--color-text-primary);
  font-size: 12px;
  font-weight: 900;
  line-height: 1;
}

.tag-muted {
  border: 1px solid var(--color-border);
  background: var(--color-surface-muted);
  color: var(--color-text-secondary);
}

.tag-success {
  background: rgb(var(--color-success-rgb) / 0.14);
  color: var(--color-success);
}

.tag-danger {
  background: rgb(var(--color-danger-rgb) / 0.12);
  color: var(--color-danger);
}
```

### 表单

```css
.field {
  display: grid;
  gap: 8px;
}

.field label {
  color: var(--color-text-primary);
  font-size: 14px;
  font-weight: 900;
}

.input,
.textarea,
.select {
  width: 100%;
  min-height: 48px;
  padding: 0 16px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  background: var(--color-surface);
  color: var(--color-text-primary);
  font-size: 15px;
  font-weight: 700;
}

.textarea {
  min-height: 132px;
  padding: 14px 16px;
  resize: vertical;
  line-height: 1.7;
}

.input:hover,
.textarea:hover,
.select:hover {
  border-color: var(--color-border-strong);
}

.input:focus,
.textarea:focus,
.select:focus {
  border-color: var(--color-brand);
  box-shadow: 0 0 0 4px rgb(var(--color-brand-rgb) / 0.18);
  outline: none;
}

.input:disabled,
.textarea:disabled,
.select:disabled {
  background: var(--color-surface-muted);
  color: rgb(var(--color-text-secondary-rgb) / 0.6);
  cursor: not-allowed;
}
```

### 弹窗 / Sheet

```css
.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgb(var(--color-text-primary-rgb) / 0.28);
}

.modal {
  width: min(560px, 100%);
  max-height: min(760px, calc(100vh - 48px));
  overflow: auto;
  border: 1px solid var(--color-border);
  border-radius: 28px;
  background: var(--color-surface);
  box-shadow: var(--shadow-xl);
}

.modal[data-state="open"] {
  animation: scaleIn 220ms ease both;
}

.modal[data-state="closed"] {
  animation: scaleOut 160ms ease both;
}
```

### 地图 / 路线

```css
.map-panel {
  position: relative;
  border: 1px solid var(--color-border);
  border-radius: 30px;
  background:
    radial-gradient(circle at 74% 30%, var(--color-map-water) 0 13rem, transparent 13.5rem),
    var(--color-panel);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}

.route-line {
  stroke: var(--color-brand);
  stroke-width: 8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.route-pin {
  fill: var(--color-brand);
  stroke: var(--color-text-primary);
  stroke-width: 3;
}
```

## 5. Layout Principles

### 容器

```css
:root {
  --container-xl: 1360px;
  --container-lg: 1180px;
  --container-md: 960px;
  --page-pad-desktop: 120px;
  --page-pad-tablet: 48px;
  --page-pad-mobile: 22px;

  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-7: 28px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;
  --space-16: 64px;
  --space-20: 80px;

  --radius-xs: 10px;
  --radius-sm: 12px;
  --radius-control: 20px;
  --radius-card: 24px;
  --radius-panel: 30px;
  --radius-pill: 999px;
}
```

### 桌面布局

- 页面宽度参考设计稿 `1600 x 1000`，主内容最大宽度 `1360px`。
- 顶部导航宽度 `min(1360px, 100vw - 48px)`，高度 `76px`，圆角胶囊。
- 首屏采用左文案 + 右地图/Agent 面板，左右比例约 `45% / 55%`。
- 功能页采用「标题区 + 操作主卡 + 旁侧状态/解释卡」或「三栏卡片」。
- 开发者页信息密度更高，可使用表格、日志列表、指标卡，但仍保持暖色底。

### 移动布局

- 设计稿移动端基准为 `430 x 932`。
- 页面左右安全边距 `22px - 28px`。
- 移动端使用顶部品牌条 + 底部五项导航：首页 / 规划 / 地图 / 消息 / 我的。
- 主要卡片宽度 `calc(100vw - 44px)`，最小触摸目标 `44px`。
- 桌面顶栏在 `<= 900px` 折叠为品牌 + 菜单按钮；菜单展开时仍按六个主导航显示，注册/登录位于菜单底部。

### 防溢出规则

- 所有卡片必须设置 `min-width: 0`。
- 长文本使用 `overflow-wrap: anywhere` 或合理分行。
- 按钮默认 `white-space: nowrap`，移动端长按钮允许 `white-space: normal` 且 `line-height: 1.3`。
- 卡片中底部按钮不得绝对定位到固定 y 值，使用 flex/grid 自然流布局。
- 三列卡片在小屏下变为横滑或单列，不压缩到文字溢出。

## 6. Depth & Elevation

```css
:root {
  --shadow-xs: 0 4px 10px rgb(var(--color-text-primary-rgb) / 0.06);
  --shadow-sm: 0 8px 10px rgb(var(--color-text-primary-rgb) / 0.08);
  --shadow-md: 0 16px 22px rgb(var(--color-text-primary-rgb) / 0.12);
  --shadow-lg: 0 24px 36px rgb(var(--color-text-primary-rgb) / 0.14);
  --shadow-xl: 0 32px 64px rgb(var(--color-text-primary-rgb) / 0.22);
  --shadow-brand: 0 14px 28px rgb(var(--color-brand-rgb) / 0.32);
}
```

### 阴影规则

- 导航、页码胶囊、轻按钮使用 `--shadow-sm`。
- 主要卡片使用 `--shadow-md`。
- Hero 地图、Agent 工作台、弹窗使用 `--shadow-lg` 或 `--shadow-xl`。
- 阴影必须是黑色透明度体系，不用彩色大投影。
- 大面积背景不要使用 `backdrop-filter`；导航可使用不超过 `14px` 的轻模糊。

## 7. Animation & Interaction

### 交互档位

实现档位：L2 流畅交互。

原因：设计稿是产品演示和可上线应用的混合，不需要电影级滚动劫持，但需要 Hero 动效、滚动 reveal、导航滚动态、卡片 hover、Agent 执行状态反馈和移动端顺滑切换。

### 动效依赖

- 首选：Framer Motion，符合技术栈文档。
- 辅助：CSS transitions / IntersectionObserver。
- 禁止：全局自定义光标、大面积 blur、强 scroll-jacking。

### 基础动效 Token

```css
:root {
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-standard: cubic-bezier(0.2, 0, 0, 1);
  --duration-fast: 160ms;
  --duration-base: 220ms;
  --duration-slow: 420ms;
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(18px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes scaleIn {
  from {
    opacity: 0;
    transform: translateY(10px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes scaleOut {
  from {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
  to {
    opacity: 0;
    transform: translateY(8px) scale(0.98);
  }
}

@keyframes routeDash {
  from {
    stroke-dashoffset: 80;
  }
  to {
    stroke-dashoffset: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 1ms !important;
    animation-iteration-count: 1 !important;
    scroll-behavior: auto !important;
    transition-duration: 1ms !important;
  }
}
```

### Framer Motion 约定

```ts
export const reveal = {
  hidden: { opacity: 0, y: 22 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.52, ease: [0.16, 1, 0.3, 1] },
  },
};

export const stagger = {
  visible: {
    transition: { staggerChildren: 0.08, delayChildren: 0.08 },
  },
};

export const cardHover = {
  y: -4,
  transition: { duration: 0.18, ease: [0.2, 0, 0, 1] },
};
```

### 必备签名动效

- Hero H1：分行 fadeInUp + 重点词黄色下划线或渐变扫光。
- Section H2：滚动进入时轻微上浮。
- Body / Label：Agent 工具调用状态使用逐项出现。
- 元素级：主 CTA hover 上浮，执行成功按钮出现轻微 pulse。
- 交互构件：方案卡片 hover spotlight 或 selected 状态放大边线。
- 背景：Hero 暖黄 radial spotlight 随首屏淡入，移动端静态降级。

## 8. Do's and Don'ts

### Do

- 使用「首页 / 功能 / 场景案例 / 设计亮点 / 开发者 / 个人中心」作为桌面主导航。
- 注册、登录始终靠右；登录后再显示昵称与退出。
- 用卡片和状态列表表达 Agent 正在做什么，避免只显示普通 loading。
- 对定位、预订、锁票、支付、日历、分享等动作展示授权边界。
- 重要 CTA 使用黄色，次级 CTA 使用黑色或白色描边。
- 地图路线必须有起点、节点、路线摘要和风险说明。
- 移动端使用底部五项导航，且保留可单手点击的 44px 目标。
- 长文本必须分行、截断或改成列表，绝不让文字压出卡片。

### Don't

- 不要把「功能页卡」作为最终导航文案，统一改为「功能」。
- 不要使用纯紫、深蓝、咖啡色等偏离设计稿的主视觉。
- 不要用普通 SaaS 蓝色按钮替代美团黄。
- 不要把页面做成营销空壳，首屏必须能进入真实 Demo 流。
- 不要在卡片内再套一层装饰性大卡片。
- 不要用固定高度硬塞内容导致按钮溢出。
- 不要在移动端保留完整桌面导航横排。
- 不要让支付由 Agent 自动完成，必须明确「用户本人确认」。
- 不要用纯色块占位地图；即使用 Mock，也要有路线、区域、水面/商圈和节点。
- 不要大面积使用 `filter: blur()` 或持续运行重动画。

## 9. Responsive Behavior

### 断点

```css
:root {
  --bp-mobile: 600px;
  --bp-tablet: 900px;
  --bp-desktop: 1200px;
}
```

### 桌面 >= 1200px

- 顶部胶囊导航完整展示。
- 首页 Hero 使用双栏：左叙事右地图/Agent 演示。
- 功能页允许 2-3 栏，日志/开发者页面允许表格。
- 页面主内容最大宽度 `1360px`。

### 平板 901px - 1199px

- 顶栏缩小间距，导航仍可展示但按钮 padding 降低。
- Hero 改为上文案下演示面板。
- 三列卡片改为两列。
- 旁侧状态栏并入主内容下方。

### 移动 <= 900px

- 顶栏改为品牌 + 菜单按钮，展开菜单包含六个主导航 + 注册/登录。
- 页面底部使用五项导航：首页 / 规划 / 地图 / 消息 / 我的。
- 所有主要区块单列。
- 卡片圆角 `20px - 24px`，左右边距 `22px`。
- 表格转为卡片列表，日志横向字段变纵向。
- Modal 改为 bottom sheet，最大高度 `82vh`。
- CTA 宽度默认 100%，双按钮可上下排列。

### 移动 <= 600px 硬性要求

```css
@media (max-width: 600px) {
  .desktop-only {
    display: none !important;
  }

  .mobile-stack {
    display: grid;
    grid-template-columns: 1fr;
    gap: var(--space-5);
  }

  .button {
    width: 100%;
    min-height: 48px;
    white-space: normal;
    line-height: 1.3;
  }

  .card {
    border-radius: 22px;
  }

  .top-nav {
    top: 14px;
    width: calc(100vw - 32px);
    height: 58px;
    padding: 0 18px;
  }

  .bottom-tabs {
    position: fixed;
    left: 24px;
    right: 24px;
    bottom: max(18px, env(safe-area-inset-bottom));
    z-index: 60;
    min-height: 62px;
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    align-items: center;
    border: 1px solid var(--color-border);
    border-radius: 999px;
    background: rgb(var(--color-surface-rgb) / 0.96);
    box-shadow: var(--shadow-sm);
    backdrop-filter: blur(10px);
  }
}
```

### 可访问性与上线检查

- 所有按钮、链接、表单控件必须有 focus-visible。
- 颜色对比：正文至少达到 WCAG AA；黄色按钮文字必须用黑色。
- 所有动态图标和状态变化需要文本说明。
- 路线、支付、授权、隐私页面不可只依赖颜色表达状态。
- 移动端任何页面不得出现横向滚动条。
- 触摸目标不得小于 `44 x 44px`。
