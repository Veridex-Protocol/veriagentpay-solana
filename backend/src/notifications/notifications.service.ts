// Fix: P1-5 Persistent Notification Frequency Caps via Prisma DB
import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsGateway } from './notifications.gateway';
import { TelegramBotDriver } from '../platform/drivers/telegram-bot';
import { Cron, CronExpression } from '@nestjs/schedule';
import axios from 'axios';
import { getAppBaseUrl } from '../config/app-url.config';

export interface CreateNotificationDto {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: any;
  /**
   * Skip the plain platform push for this notification.
   *
   * Set by callers that deliver to the chat platforms themselves.
   * `UnifiedNotificationService` sends its own Telegram message with inline
   * buttons and then records the notification here — which pushed a second,
   * plainer copy of the same text, so every unified notification arrived twice.
   */
  suppressPlatformPush?: boolean;
}

export type NotificationCategory = 'socialProof' | 'spending' | 'saving' | 'virality' | 'reputation';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly prisma: PrismaService;

  // In-memory preferences fallback cache
  private userPrefsMemory = new Map<string, any>();

  constructor(
    private readonly gateway: NotificationsGateway,
    @Inject(forwardRef(() => TelegramBotDriver))
    private readonly telegramBot?: TelegramBotDriver,
    prismaService?: PrismaService,
  ) {
    this.prisma = prismaService || new PrismaService();
  }

  /**
   * Evaluates category preferences and strict frequency caps before sending (DB-backed).
   */
  async shouldSend(userId: string, category: NotificationCategory, type = 'GENERAL'): Promise<boolean> {
    // 1. Check user preferences
    const prefs = await this.getUserPreferences(userId);
    if (prefs[category] === false) {
      this.logger.log(`Notification blocked for ${userId}: category [${category}] disabled by user preference.`);
      return false;
    }

    // 2. Persistent Frequency Caps Check against NotificationLog table
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    try {
      switch (category) {
        case 'socialProof': {
          const count = await this.prisma.notificationLog.count({
            where: { userId, category, sentAt: { gte: oneWeekAgo } },
          });
          if (count >= 3) return false;
          break;
        }

        case 'spending': {
          const count = await this.prisma.notificationLog.count({
            where: { userId, category, sentAt: { gte: oneDayAgo } },
          });
          if (count >= 2) return false;
          break;
        }

        case 'saving': {
          const count = await this.prisma.notificationLog.count({
            where: { userId, category, sentAt: { gte: oneDayAgo } },
          });
          if (count >= 1) return false;
          break;
        }

        case 'virality': {
          if (type === 'DOUBLE_REWARD') {
            const count = await this.prisma.notificationLog.count({
              where: { userId, category, notificationType: 'DOUBLE_REWARD', sentAt: { gte: oneMonthAgo } },
            });
            if (count >= 1) return false;
          } else {
            const count = await this.prisma.notificationLog.count({
              where: { userId, category, sentAt: { gte: oneDayAgo } },
            });
            if (count >= 2) return false;
          }
          break;
        }

        case 'reputation': {
          const count = await this.prisma.notificationLog.count({
            where: { userId, category, sentAt: { gte: oneDayAgo } },
          });
          if (count >= 2) return false;
          break;
        }
      }
    } catch (e: any) {
      this.logger.warn(`Database query error checking notification logs: ${e.message}`);
    }

    return true;
  }

  /**
   * Permission-based send method that respects user settings & frequency caps.
   */
  async sendIfAllowed(userId: string, category: NotificationCategory, dto: CreateNotificationDto) {
    const allowed = await this.shouldSend(userId, category, dto.type);
    if (!allowed) {
      return null;
    }

    // Record persistent DB log
    try {
      const logUserId = await this.resolveValidUserId(userId);
      if (logUserId) {
        await this.prisma.notificationLog.create({
          data: {
            userId: logUserId,
            category,
            notificationType: dto.type,
          },
        });
      }
    } catch (e: any) {
      this.logger.warn(`Failed to create NotificationLog in database: ${e.message}`);
    }

    return await this.create(dto);
  }

  private async resolveValidUserId(identifier: string): Promise<string | null> {
    if (!identifier) return null;

    try {
      const byId = await this.prisma.user.findUnique({
        where: { id: identifier },
        select: { id: true },
      });
      if (byId) return byId.id;

      const clean = identifier.replace(/^@/, '');
      const found = await this.prisma.user.findFirst({
        where: {
          OR: [
            { username: clean },
            { telegramId: identifier },
            { whatsappId: identifier },
            { discordId: identifier },
            { slackId: identifier },
            { smartWallet: { address: { equals: identifier, mode: 'insensitive' } } },
            { socialNodes: { some: { platformUserId: identifier } } },
          ],
        },
        select: { id: true },
      });

      return found?.id || null;
    } catch {
      return null;
    }
  }

  async create(dto: CreateNotificationDto) {
    this.logger.log(`Creating notification [${dto.type}] for user ${dto.userId}`);

    const mappedType = this.mapNotificationType(dto.type);
    const targetUserId = await this.resolveValidUserId(dto.userId);

    let notification: any;
    if (targetUserId) {
      try {
        notification = await this.prisma.notification.create({
          data: {
            userId: targetUserId,
            type: mappedType,
            title: dto.title,
            body: dto.body,
            data: dto.data || {},
          },
        });
      } catch (e: any) {
        this.logger.warn(`Prisma notification creation failed (${e.message}), falling back to in-memory envelope`);
        notification = {
          id: `notif-${Date.now()}`,
          userId: dto.userId,
          type: mappedType,
          title: dto.title,
          body: dto.body,
          data: dto.data || {},
          read: false,
          createdAt: new Date(),
        };
      }
    } else {
      notification = {
        id: `notif-${Date.now()}`,
        userId: dto.userId,
        type: mappedType,
        title: dto.title,
        body: dto.body,
        data: dto.data || {},
        read: false,
        createdAt: new Date(),
      };
    }

    // 1. Emit real-time WebSocket event
    try {
      this.gateway.emitToUser(dto.userId, 'notification:new', notification);
      const unreadCount = await this.getUnreadCount(dto.userId);
      this.gateway.emitToUser(dto.userId, 'notification:unread-count', { count: unreadCount });
    } catch (wsErr: any) {
      this.logger.warn(`WebSocket notification broadcast warning: ${wsErr.message}`);
    }

    // 2. Multi-platform notification dispatch across Telegram, WhatsApp, Discord, Slack
    if (!dto.suppressPlatformPush) {
      this.dispatchMultiPlatformPush(dto.userId, dto.title, dto.body, dto.data).catch((err) =>
        this.logger.warn(`Multi-platform push notification warning: ${err.message}`),
      );
    }

    return notification;
  }

  private mapNotificationType(type: any): NotificationType {
    if (!type) return NotificationType.SYSTEM;
    const upper = type.toString().toUpperCase();
    if (Object.values(NotificationType).includes(upper as any)) {
      return upper as NotificationType;
    }
    return NotificationType.SYSTEM;
  }

  async getUserPreferences(userId: string) {
    const defaults = {
      socialProof: true,
      spending: true,
      saving: true,
      virality: true,
      reputation: true,
      telegramNotifications: true,
      whatsappNotifications: true,
      discordNotifications: true,
      slackNotifications: true,
      webPushNotifications: true,
    };

    if (this.userPrefsMemory.has(userId)) {
      return { ...defaults, ...this.userPrefsMemory.get(userId) };
    }

    try {
      const prefs = await this.prisma.userNotificationPreference.findUnique({
        where: { userId },
      });
      if (prefs) return { ...defaults, ...prefs };
    } catch (e) {
      // Fallback
    }

    return defaults;
  }

  async updateUserPreferences(userId: string, prefs: any) {
    const existing = await this.getUserPreferences(userId);
    const updated = { ...existing, ...prefs };
    this.userPrefsMemory.set(userId, updated);

    try {
      await this.prisma.userNotificationPreference.upsert({
        where: { userId },
        create: { userId, ...updated },
        update: updated,
      });
    } catch (e) {
      // Fallback
    }

    return updated;
  }

  // --- Behavioral Cron Jobs ---

  /**
   * Streak Saver Cron: Fires daily at 11:00 PM to remind users nearing streak loss.
   */
  @Cron(CronExpression.EVERY_DAY_AT_11PM)
  async handleStreakSaverCron() {
    this.logger.log('Running Streak Saver Behavioral Cron Task...');

    const cutoff = new Date(Date.now() - 23 * 60 * 60 * 1000);
    const batchSize = 100;
    let cursor: string | undefined = undefined;

    while (true) {
      const batch: { id: string; userId: string }[] = await this.prisma.interactionStreak.findMany({
        where: { lastActiveAt: { lte: cutoff }, currentStreak: { gte: 1 } },
        select: { id: true, userId: true },
        take: batchSize,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        orderBy: { id: 'asc' },
      });

      if (batch.length === 0) break;

      for (const { userId } of batch) {
        try {
          await this.sendIfAllowed(userId, 'saving', {
            userId,
            type: NotificationType.SYSTEM,
            title: '⏳ Streak Saver Reminder!',
            body: 'Your activity streak ends in 1 hour. Open the app or send a command to keep it alive!',
            data: { deepLink: `${getAppBaseUrl()}/vaults` },
          });
        } catch (err: any) {
          this.logger.warn(`Failed to send streak saver to user ${userId}: ${err.message}`);
        }
      }

      cursor = batch[batch.length - 1].id;
      if (batch.length < batchSize) break;
    }
  }

  /**
   * Deliberately inactive until verified, per-user yield accounting is live.
   * Do not register this as a cron or send a placeholder earnings figure.
   */
  async handleWeeklyYieldSummaryCron() {
    this.logger.warn('Weekly yield summary is disabled until verified per-user yield accounting is available.');
  }

  async findAllForUser(userId: string, options: { read?: boolean; limit?: number; page?: number } = {}) {
    try {
      const pageNum = options.page || 1;
      const limitNum = options.limit || 20;
      const skip = (pageNum - 1) * limitNum;

      const [notifications, totalCount] = await Promise.all([
        this.prisma.notification.findMany({
          where: {
            userId,
            ...(options.read !== undefined ? { read: options.read } : {}),
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limitNum,
        }),
        this.prisma.notification.count({
          where: {
            userId,
            ...(options.read !== undefined ? { read: options.read } : {}),
          },
        }),
      ]);

      return {
        data: notifications,
        page: pageNum,
        limit: limitNum,
        totalCount,
        totalPages: Math.ceil(totalCount / limitNum),
      };
    } catch (e) {
      return {
        data: [],
        page: 1,
        limit: 20,
        totalCount: 0,
        totalPages: 0,
      };
    }
  }

  async getUnreadCount(userId: string) {
    try {
      return await this.prisma.notification.count({
        where: { userId, read: false },
      });
    } catch (e) {
      return 0;
    }
  }

  async markAsRead(id: string, userId: string) {
    try {
      return await this.prisma.notification.updateMany({
        where: { id, userId },
        data: { read: true },
      });
    } catch (e) {
      return { count: 0 };
    }
  }

  async markAllAsRead(userId: string) {
    try {
      return await this.prisma.notification.updateMany({
        where: { userId, read: false },
        data: { read: true },
      });
    } catch (e) {
      return { count: 0 };
    }
  }

  private async dispatchMultiPlatformPush(userId: string, title: string, body: string, data?: any) {
    try {
      const prefs = await this.getUserPreferences(userId);

      // Check Telegram
      if (prefs.telegramNotifications && this.telegramBot) {
        let telegramChatId: string | null = null;
        if (userId.startsWith('tg_')) {
          telegramChatId = userId.replace('tg_', '');
        } else {
          const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { telegramId: true, telegramChatId: true },
          });
          telegramChatId = user?.telegramChatId || user?.telegramId || null;
        }

        if (telegramChatId) {
          await this.telegramBot.sendMessage(telegramChatId, `🔔 *${title}*\n\n${body}`).catch(() => {});
        }
      }

      // Check Discord
      if (prefs.discordNotifications) {
        const discordWebhook = process.env.DISCORD_WEBHOOK_URL;
        if (discordWebhook) {
          await axios.post(discordWebhook, { content: `🔔 **${title}**\n${body}` }).catch(() => {});
        }
      }

      // Check Slack
      if (prefs.slackNotifications) {
        const slackWebhook = process.env.SLACK_WEBHOOK_URL;
        if (slackWebhook) {
          await axios.post(slackWebhook, { text: `🔔 *${title}*\n${body}` }).catch(() => {});
        }
      }
    } catch (err: any) {
      this.logger.warn(`Failed to dispatch multi-platform push notification: ${err.message}`);
    }
  }
}
