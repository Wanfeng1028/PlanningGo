---
name: vite8-manualchunks
description: 'Vite 8 uses rolldown — manualChunks must be a function, not an object map'
source: auto-skill
extracted_at: '2026-05-27T21:33:49.000Z'
---

## Problem

Vite 8 switched from Rollup to Rolldown as its bundler. The object syntax for `manualChunks` in
`build.rollupOptions.output` no longer works:

```ts
// ❌ BAD — Vite 8 / rolldown rejects this
manualChunks: {
  "vendor-react": ["react", "react-dom"],
  "vendor-motion": ["framer-motion"],
}
```

Build fails with:
```
TypeError: manualChunks is not a function
Warning: Invalid output options - For the "manualChunks". Invalid type: Expected Function but received Object.
```

## Solution

Use a function that returns a chunk name based on module ID:

```ts
// ✅ GOOD — function form works with rolldown
manualChunks(id: string) {
  if (id.includes("node_modules")) {
    if (id.includes("react-dom") || id.includes("/react/")) return "vendor-react";
    if (id.includes("framer-motion")) return "vendor-motion";
    if (id.includes("lucide-react")) return "vendor-icons";
    if (id.includes("dompurify") || id.includes("marked") || id.includes("uuid")) return "vendor-utils";
  }
},
```

## Key rules

- Vite 8+ uses rolldown, not rollup — check rolldown docs for output option compatibility
- The function receives the full module file path (e.g. `/app/node_modules/react/index.js`)
- Return `undefined` (or nothing) to let the chunk stay in the default bundle
- Group related dependencies by checking multiple `id.includes()` patterns in one branch
- Verify the build output — each `return "name"` creates a separate `.js` file in `dist/assets/`
