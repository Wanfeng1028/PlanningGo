---
name: objecturl-cleanup-ref
description: 'useEffect 空依赖数组的 cleanup 闭包捕获初始值（空数组），ObjectURL 不会被 revoke — 用 ref 跟踪最新值'
source: auto-skill
extracted_at: '2026-05-28T00:15:00.000Z'
---

## Problem

组件中创建 ObjectURL（`URL.createObjectURL`）后，在 `useEffect` 的 cleanup 中 revoke：
```tsx
// ❌ BAD — cleanup 闭包捕获的是挂载时的 attachments（空数组）
const [attachments, setAttachments] = useState<Attachment[]>([]);

useEffect(() => {
  return () => {
    attachments.forEach((a) => {
      if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
    });
  };
}, []); // 空依赖 → cleanup 中的 attachments 永远是 []
```

**结果**：组件卸载时 cleanup 执行，但遍历的是空数组，ObjectURL 永远不会被释放 → 内存泄漏。

## Solution

用 `useRef` 跟踪最新值，cleanup 从 ref 读取：

```tsx
// ✅ GOOD — ref 始终指向最新的 attachments
const attachmentsRef = useRef(attachments);
attachmentsRef.current = attachments; // 每次渲染同步

useEffect(() => {
  return () => {
    attachmentsRef.current.forEach((a) => {
      if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
    });
  };
}, []); // 空依赖 OK，cleanup 从 ref 读最新值
```

## Diagnosis

搜索 `createObjectURL` 使用处，检查其对应的 `revokeObjectURL` 是否在同一个或相关的 cleanup effect 中。如果 cleanup effect 有 `[]` 空依赖但引用了会变化的 state，就是此 bug。

## Key rules

- `useEffect(fn, [])` 的 cleanup 闭包捕获的是**挂载时**的变量值，不是卸载时的
- 凡是 cleanup 需要访问"最新值"的场景，都用 ref 模式
- 同一模式适用于其他需要 cleanup 的资源：Blob URL、WebSocket、EventSource、定时器 ID 列表
- 替代方案：将 ObjectURL 存在 ref（`useRef<Map<File, string>>()`）而非 state 中，避免 re-render
