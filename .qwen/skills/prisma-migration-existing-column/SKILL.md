---
name: prisma-migration-existing-column
description: 'Prisma migration fails with ''column already exists'' when the init migration already created it — check init SQL before writing ALTER TABLE'
source: auto-skill
extracted_at: '2026-05-27T21:33:49.000Z'
---

## Problem

When adding a new field to a Prisma model (e.g. `userId` on `NotificationPreference`), the generated
migration SQL includes `ALTER TABLE ... ADD COLUMN`. This fails in CI with:

```
ERROR: column "user_id" of relation "notification_preferences" already exists
```

**Root cause**: The original `init` migration (generated from an earlier schema version) already
created the column. The Prisma schema file was later modified to remove the field, but the database
(and init migration SQL) still has it. When the field is re-added, Prisma treats it as new, but the
column already exists in the DB.

## Diagnosis

Before writing migration SQL for a "new" column/index/constraint:

1. **Read the init migration SQL** (`prisma/migrations/*_init/migration.sql`)
2. Search for the table name — check if the column already exists in `CREATE TABLE`
3. Search for existing indexes (`CREATE INDEX`) and foreign keys (`FOREIGN KEY`)

## Solution

Only include operations that are truly new:

```sql
-- ❌ BAD — column already exists in init migration
ALTER TABLE "notification_preferences" ADD COLUMN "user_id" UUID;
CREATE UNIQUE INDEX "notification_preferences_user_id_key" ON "notification_preferences"("user_id");
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ✅ GOOD — column and unique index already exist, only add FK constraint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

## Key rules

- Always `grep` the init migration for the target table before writing ALTER statements
- Columns created in `CREATE TABLE` cannot be re-added with `ADD COLUMN`
- Indexes created with `CREATE INDEX` cannot be re-created
- FK constraints may be missing even if the column exists (Prisma may have had the field without `@relation`)
- Use `--create-only` or `prisma format` + `prisma generate` to validate schema without a running DB
- CI applies all migrations from scratch on a clean DB — it will fail on any duplicate DDL
