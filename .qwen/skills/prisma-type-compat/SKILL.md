---
name: prisma-type-compat
description: Avoid type errors when writing helper functions that process Prisma query results — use inline types matching Prisma schema, not custom interfaces
source: auto-skill
extracted_at: '2026-05-27T13:04:17.205Z'
---

## Problem

When writing mapping/helper functions for Prisma query results, defining custom TypeScript interfaces
like `interface ApiKeyRecord { scopes: string[]; expiresAt?: Date }` causes type errors because Prisma's
inferred return types differ in two critical ways:

1. **JSON columns** → Prisma returns `JsonValue` (which includes `null`, arrays, objects), not `string[]`
2. **Nullable columns** → Prisma returns `T | null`, not `T | undefined`

This causes errors like:
```
Type 'JsonValue' is not assignable to type 'string[]'
Type 'string | null' is not assignable to type 'string | undefined'
```

## Solution

Replace custom interfaces with **inline type annotations** that match the actual Prisma schema columns:

```ts
// ❌ BAD — custom interface diverges from Prisma inferred types
interface ApiKeyRecord {
  scopes: string[];        // Prisma returns JsonValue
  expiresAt?: Date;        // Prisma returns Date | null
  appId?: string;          // Prisma returns string | null
}
function mapApiKey(key: ApiKeyRecord) { ... }

// ✅ GOOD — inline types match Prisma columns exactly
function mapApiKey(key: {
  id: string; name: string; prefix: string; scopes: unknown;
  status: string; environment: string | null; appId: string | null;
  expiresAt: Date | null; lastUsedAt: Date | null; createdAt: Date;
}) {
  return {
    scopes: toStringArray(key.scopes),         // utility converts JsonValue → string[]
    appId: nullToUndefined(key.appId),         // utility converts null → undefined
    expiresAt: nullToUndefined(key.expiresAt),
  };
}
```

## Key rules

- **JSON columns** (`@default("[]")`, `@default("{}")`): type as `unknown` in the parameter, use `toStringArray()` or `toRecordOrEmpty()` to convert
- **Nullable columns** (optional relations, `String?`): type as `T | null`, use `nullToUndefined()` at the boundary
- **Never use `?` (optional) for nullable Prisma columns** — Prisma returns `null`, not `undefined`
- If the schema has no legacy `event` column, don't reference it in the mapping function
- Run `tsc -b` locally before pushing to catch these mismatches before CI
