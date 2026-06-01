-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "agent_state_json" JSONB,
ADD COLUMN     "selected_option_id" TEXT;
