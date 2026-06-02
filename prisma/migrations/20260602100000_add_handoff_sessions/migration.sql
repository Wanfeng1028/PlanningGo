-- CreateTable: handoff_sessions
CREATE TABLE "handoff_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "token_hash" TEXT NOT NULL,
    "conversation_id" UUID NOT NULL,
    "plan_id" UUID,
    "selected_option_id" TEXT,
    "user_id" UUID,
    "guest_id" TEXT,
    "scopes" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'waiting_scan',
    "claimed_device_id" TEXT,
    "claimed_at" TIMESTAMP(3),
    "consumed_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "handoff_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "handoff_sessions_token_hash_key" ON "handoff_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "handoff_sessions_conversation_id_idx" ON "handoff_sessions"("conversation_id");

-- CreateIndex
CREATE INDEX "handoff_sessions_user_id_idx" ON "handoff_sessions"("user_id");

-- CreateIndex
CREATE INDEX "handoff_sessions_status_idx" ON "handoff_sessions"("status");
