-- AlterTable: NotificationPreference add userId column
ALTER TABLE "notification_preferences" ADD COLUMN "user_id" UUID;

-- AddForeignKey: NotificationPreference -> User
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex: NotificationPreference userId unique
CREATE UNIQUE INDEX "notification_preferences_user_id_key" ON "notification_preferences"("user_id");

-- AlterTable: RequestLog userId optional, onDelete SetNull
ALTER TABLE "request_logs" ALTER COLUMN "user_id" DROP NOT NULL;
ALTER TABLE "request_logs" DROP CONSTRAINT IF EXISTS "request_logs_user_id_fkey";
ALTER TABLE "request_logs" ADD CONSTRAINT "request_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: DeveloperUsageDaily userId optional, onDelete SetNull
ALTER TABLE "developer_usage_daily" ALTER COLUMN "user_id" DROP NOT NULL;
ALTER TABLE "developer_usage_daily" DROP CONSTRAINT IF EXISTS "developer_usage_daily_user_id_fkey";
ALTER TABLE "developer_usage_daily" ADD CONSTRAINT "developer_usage_daily_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex: Action planOptionId, status
CREATE INDEX "actions_plan_option_id_idx" ON "actions"("plan_option_id");
CREATE INDEX "actions_status_idx" ON "actions"("status");

-- CreateIndex: ExecutionStep planId
CREATE INDEX "execution_steps_plan_id_idx" ON "execution_steps"("plan_id");

-- CreateIndex: ShareRoom planId
CREATE INDEX "share_rooms_plan_id_idx" ON "share_rooms"("plan_id");

-- CreateIndex: ApiKey appId
CREATE INDEX "api_keys_app_id_idx" ON "api_keys"("app_id");

-- CreateIndex: Webhook appId
CREATE INDEX "webhooks_app_id_idx" ON "webhooks"("app_id");

-- CreateIndex: RequestLog appId
CREATE INDEX "request_logs_app_id_idx" ON "request_logs"("app_id");

-- CreateIndex: Notification read, createdAt
CREATE INDEX "notifications_read_idx" ON "notifications"("read");
CREATE INDEX "notifications_created_at_idx" ON "notifications"("created_at");
