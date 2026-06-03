-- CreateTable: handoff_codes
CREATE TABLE "handoff_codes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "conversation_id" UUID NOT NULL,
    "plan_id" UUID,
    "user_id" UUID,
    "guest_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "claimed_device_id" TEXT,
    "claimed_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "handoff_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "handoff_codes_code_key" ON "handoff_codes"("code");

-- CreateIndex
CREATE INDEX "handoff_codes_conversation_id_idx" ON "handoff_codes"("conversation_id");

-- CreateIndex
CREATE INDEX "handoff_codes_user_id_idx" ON "handoff_codes"("user_id");

-- CreateIndex
CREATE INDEX "handoff_codes_status_idx" ON "handoff_codes"("status");
