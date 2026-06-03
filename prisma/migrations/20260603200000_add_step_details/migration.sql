-- AlterTable: plan_steps — add enhanced detail fields
ALTER TABLE "plan_steps" ADD COLUMN "description" TEXT;
ALTER TABLE "plan_steps" ADD COLUMN "estimated_cost" TEXT;
ALTER TABLE "plan_steps" ADD COLUMN "booking_hint" TEXT;
ALTER TABLE "plan_steps" ADD COLUMN "suggestions" JSONB NOT NULL DEFAULT '[]'::jsonb;
