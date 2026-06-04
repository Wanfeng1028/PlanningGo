-- DropIndex
DROP INDEX "actions_provider_idx";

-- AlterTable
ALTER TABLE "handoff_codes" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "handoff_sessions" ALTER COLUMN "id" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "handoff_codes_expires_at_idx" ON "handoff_codes"("expires_at");
