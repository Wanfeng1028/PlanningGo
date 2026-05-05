# PlanningGo / 周末有谱

本项目是「周末有谱」本地生活活动规划 Agent 的前端实现。当前版本优先完成前端可上线演示体验，基于上传设计稿中的 43 页、28 页、最终 100 页与移动端 60 页重新归并为一套连续产品流程。

## 页面结构

桌面端主导航固定为：

```text
首页 / 功能 / 场景案例 / 设计亮点 / 开发者 / 个人中心
```

右侧固定注册和登录入口。适合弹窗化的身份选择、定位授权、预约、票务锁单、支付交接、多人投票、隐私导出、API Key 创建等流程已作为 Modal / 移动端 Bottom Sheet 处理。

移动端使用：

```text
首页 / 规划 / 地图 / 消息 / 我的
```

## 页面覆盖

工程内已经生成所有设计稿对应页面组件：

- `src/pages/generated/finalDesktop/`：最终桌面端 100 页
- `src/pages/generated/mobile/`：移动端 60 页
- `src/pages/generated/d43/`：原始 43 页
- `src/pages/generated/i28/`：差异 28 页

合计 231 个设计稿页面组件，每个页面组件统一复用 `src/pages/DesignPage.tsx` 的页面模板，并通过 `src/data/pageCatalog.ts` 归入六个主导航或移动端底部导航。

## 技术栈

- React
- Vite
- TypeScript
- SCSS + CSS Modules
- Framer Motion
- lucide-react

本项目明确不使用 Tailwind CSS。

## 本地运行

```bash
npm install
npm run dev
```

## 生产构建

```bash
npm run build
```

## 设计规范

完整设计系统见 `DESIGN.md`，包含 9 大部分设计 token、颜色、字体、组件、布局、阴影、动效、设计护栏和响应式规则。
