-- AlterTable: actions — add provider column (V3 execution system)
ALTER TABLE "actions" ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'mock';
CREATE INDEX "actions_provider_idx" ON "actions"("provider");
