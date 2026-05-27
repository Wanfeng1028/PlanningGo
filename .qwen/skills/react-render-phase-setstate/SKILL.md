---
name: react-render-phase-setstate
description: 'React render 中直接调用 setState（如条件重定向）会导致无限重渲染 — 移到 useEffect 中'
source: auto-skill
extracted_at: '2026-05-28T00:15:00.000Z'
---

## Problem

在 React 组件的渲染逻辑（JSX / IIFE）中直接调用 `setState`，例如条件守卫重定向：

```tsx
// ❌ BAD — 渲染期间调用 setModal / setActive，触发无限重渲染
const page = (() => {
  switch (active) {
    case "profile":
      if (!user) {
        handleAuthRequiredNavigate("profile"); // 内部调用 setModal + setActive
        return null;
      }
      return <ProfilePage />;
  }
})();
```

React 会在同一轮渲染中检测到 state 变更，导致：
- 开发模式下 warning: "Cannot update during an existing state transition"
- 可能触发无限渲染循环

## Solution

将条件重定向移到 `useEffect` 中，渲染逻辑只负责返回 `null`：

```tsx
// ✅ GOOD — useEffect 在渲染完成后执行
useEffect(() => {
  if (active === "profile" && !user) {
    handleAuthRequiredNavigate("profile");
  }
}, [active, user]);

const page = (() => {
  switch (active) {
    case "profile":
      if (!user) return null; // 渲染阶段只返回 null，不触发 state
      return <ProfilePage />;
  }
})();
```

## Diagnosis

搜索以下模式：
1. 在 `switch` / `if` 分支的 JSX 返回路径中调用含 `setState` 的函数
2. 在组件函数体（非 useEffect/useCallback）中直接调用 `set*`
3. 渲染逻辑中的条件守卫调用了导航/弹窗等副作用

## Key rules

- React 渲染必须是纯函数 — 不能有副作用
- 条件守卫 + 重定向 → `useEffect` + 渲染返回 `null`
- `useEffect` 中的依赖数组要包含触发条件的所有响应式值
- 如果导航函数内部使用了其他 state（如 `setPendingAfterAuth`），确保 effect 的依赖正确
