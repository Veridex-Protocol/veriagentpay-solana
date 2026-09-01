import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SecuritySettingsDto, NotificationPrefsDto } from './settings.controller';

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getSecuritySettings(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { requireBiometricsAlways: true },
    });

    return {
      requireBiometricsAlways: user?.requireBiometricsAlways ?? false,
    };
  }

  async updateSecuritySettings(userId: string, dto: SecuritySettingsDto) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        requireBiometricsAlways: dto.requireBiometricsAlways ?? false,
      },
      select: { requireBiometricsAlways: true },
    });

    this.logger.log(
      `User ${userId} updated requireBiometricsAlways to ${user.requireBiometricsAlways}`,
    );

    return {
      requireBiometricsAlways: user.requireBiometricsAlways,
    };
  }

  async getNotificationPrefs(userId: string) {
    const prefs = await this.prisma.userNotificationPreference.findUnique({
      where: { userId },
      select: {
        webPushNotifications: true,
        telegramNotifications: true,
        saving: true,
      },
    });

    return {
      pushAlerts: prefs?.webPushNotifications ?? true,
      telegramBot: prefs?.telegramNotifications ?? true,
      yieldAlerts: prefs?.saving ?? true,
    };
  }

  async updateNotificationPrefs(userId: string, dto: NotificationPrefsDto) {
    const data: Record<string, boolean> = {};
    if (dto.pushAlerts !== undefined) data.webPushNotifications = dto.pushAlerts;
    if (dto.telegramBot !== undefined) data.telegramNotifications = dto.telegramBot;
    if (dto.yieldAlerts !== undefined) data.saving = dto.yieldAlerts;

    const prefs = await this.prisma.userNotificationPreference.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
      select: {
        webPushNotifications: true,
        telegramNotifications: true,
        saving: true,
      },
    });

    return {
      pushAlerts: prefs.webPushNotifications,
      telegramBot: prefs.telegramNotifications,
      yieldAlerts: prefs.saving,
    };
  }
}
