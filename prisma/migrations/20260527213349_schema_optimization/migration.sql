-- AddForeignKey: NotificationPreference -> User (column already exists, just add FK)
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: RequestLog — make userId optional, change CASCADE to SET NULL
ALTER TABLE "request_logs" ALTER COLUMN "user_id" DROP NOT NULL;
ALTER TABLE "request_logs" DROP CONSTRAINT "request_logs_user_id_fkey";
ALTER TABLE "request_logs" ADD CONSTRAINT "request_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: DeveloperUsageDaily — make userId optional, change CASCADE to SET NULL
ALTER TABLE "developer_usage_daily" ALTER COLUMN "user_id" DROP NOT NULL;
ALTER TABLE "developer_usage_daily" DROP CONSTRAINT "developer_usage_daily_user_id_fkey";
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
