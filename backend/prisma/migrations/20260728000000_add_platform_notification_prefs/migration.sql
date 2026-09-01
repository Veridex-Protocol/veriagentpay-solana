-- AlterTable
ALTER TABLE "UserNotificationPreference" ADD COLUMN IF NOT EXISTS "telegramNotifications" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "UserNotificationPreference" ADD COLUMN IF NOT EXISTS "whatsappNotifications" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "UserNotificationPreference" ADD COLUMN IF NOT EXISTS "discordNotifications" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "UserNotificationPreference" ADD COLUMN IF NOT EXISTS "slackNotifications" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "UserNotificationPreference" ADD COLUMN IF NOT EXISTS "webPushNotifications" BOOLEAN NOT NULL DEFAULT true;
