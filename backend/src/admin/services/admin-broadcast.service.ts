import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TelegramBotDriver } from '../../platform/drivers/telegram-bot';
import { WhatsAppBotDriver } from '../../platform/drivers/whatsapp-bot';
import { DiscordBotDriver } from '../../platform/drivers/discord-bot';
import { SlackBotDriver } from '../../platform/drivers/slack-bot';

export interface BroadcastDto {
  title: string;
  message: string;
  platforms: ('telegram' | 'whatsapp' | 'discord' | 'slack')[];
  actionLabel?: string;
  actionUrl?: string;
  userIds?: string[];
}

export interface BroadcastResult {
  success: boolean;
  totalTargeted: number;
  delivered: Record<string, number>;
  failed: Record<string, number>;
  errors: string[];
}

@Injectable()
export class AdminBroadcastService {
  private readonly logger = new Logger(AdminBroadcastService.name);
  private readonly BATCH_SIZE = 25;
  private readonly BATCH_DELAY_MS = 1000;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => TelegramBotDriver))
    private readonly telegramBot?: TelegramBotDriver,
    @Inject(forwardRef(() => WhatsAppBotDriver))
    private readonly whatsappBot?: WhatsAppBotDriver,
    @Inject(forwardRef(() => DiscordBotDriver))
    private readonly discordBot?: DiscordBotDriver,
    @Inject(forwardRef(() => SlackBotDriver))
    private readonly slackBot?: SlackBotDriver,
  ) {}

  async broadcast(dto: BroadcastDto): Promise<BroadcastResult> {
    this.logger.log(`Starting broadcast: "${dto.title}" to platforms: ${dto.platforms.join(', ')}`);

    const result: BroadcastResult = {
      success: true,
      totalTargeted: 0,
      delivered: {},
      failed: {},
      errors: [],
    };

    const users = await this.resolveTargetUsers(dto.userIds);
    result.totalTargeted = users.length;

    for (const platform of dto.platforms) {
      const { delivered, failed, errors } = await this.broadcastToPlatform(platform, users, dto);
      result.delivered[platform] = delivered;
      result.failed[platform] = failed;
      result.errors.push(...errors);
    }

    await this.prisma.notificationLog.create({
      data: {
        userId: 'system',
        category: 'broadcast',
        notificationType: 'admin_broadcast',
        metadata: {
          title: dto.title,
          platforms: dto.platforms,
          totalTargeted: result.totalTargeted,
          delivered: result.delivered,
          failed: result.failed,
        },
      },
    }).catch(() => {});

    this.logger.log(`Broadcast complete: ${JSON.stringify(result.delivered)} delivered, ${JSON.stringify(result.failed)} failed`);
    return result;
  }

  private async resolveTargetUsers(userIds?: string[]) {
    if (userIds && userIds.length > 0) {
      return this.prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, telegramId: true, whatsappId: true, discordId: true, slackId: true },
      });
    }
    return this.prisma.user.findMany({
      select: { id: true, telegramId: true, whatsappId: true, discordId: true, slackId: true },
    });
  }

  private async broadcastToPlatform(
    platform: string,
    users: { id: string; telegramId: string | null; whatsappId: string | null; discordId: string | null; slackId: string | null }[],
    dto: BroadcastDto,
  ) {
    let delivered = 0;
    let failed = 0;
    const errors: string[] = [];

    const recipients = users
      .map(u => {
        switch (platform) {
          case 'telegram': return u.telegramId;
          case 'whatsapp': return u.whatsappId;
          case 'discord': return u.discordId;
          case 'slack': return u.slackId;
          default: return null;
        }
      })
      .filter(Boolean) as string[];

    for (let i = 0; i < recipients.length; i += this.BATCH_SIZE) {
      const batch = recipients.slice(i, i + this.BATCH_SIZE);

      const results = await Promise.allSettled(
        batch.map(recipientId => this.sendToRecipient(platform, recipientId, dto))
      );

      for (const r of results) {
        if (r.status === 'fulfilled') delivered++;
        else {
          failed++;
          if (errors.length < 10) errors.push(r.reason?.message || 'Unknown error');
        }
      }

      if (i + this.BATCH_SIZE < recipients.length) {
        await new Promise(resolve => setTimeout(resolve, this.BATCH_DELAY_MS));
      }
    }

    return { delivered, failed, errors };
  }

  private async sendToRecipient(platform: string, recipientId: string, dto: BroadcastDto): Promise<void> {
    switch (platform) {
      case 'telegram':
        await this.sendTelegram(recipientId, dto);
        break;
      case 'whatsapp':
        await this.sendWhatsApp(recipientId, dto);
        break;
      case 'discord':
        await this.sendDiscord(recipientId, dto);
        break;
      case 'slack':
        await this.sendSlack(recipientId, dto);
        break;
    }
  }

  private async sendTelegram(chatId: string, dto: BroadcastDto) {
    if (!this.telegramBot) throw new Error('Telegram bot not available');

    const text = `📢 *${dto.title}*\n\n${dto.message}`;

    if (dto.actionLabel && dto.actionUrl) {
      const inlineKeyboard = [[{ text: dto.actionLabel, url: dto.actionUrl }]];
      await this.telegramBot.sendMessageWithInlineKeyboard(chatId, text, inlineKeyboard);
    } else {
      await this.telegramBot.sendMessageWithInlineKeyboard(chatId, text, []);
    }
  }

  private async sendWhatsApp(phoneNumber: string, dto: BroadcastDto) {
    if (!this.whatsappBot) throw new Error('WhatsApp bot not available');

    let text = `📢 *${dto.title}*\n\n${dto.message}`;
    if (dto.actionUrl) {
      text += `\n\n🔗 ${dto.actionUrl}`;
    }
    await this.whatsappBot.sendMessage(phoneNumber, text);
  }

  private async sendDiscord(userId: string, dto: BroadcastDto) {
    if (!this.discordBot) throw new Error('Discord bot not available');

    let text = `📢 **${dto.title}**\n\n${dto.message}`;
    if (dto.actionUrl) {
      text += `\n\n🔗 ${dto.actionUrl}`;
    }
    await this.discordBot.sendMessage(userId, text);
  }

  private async sendSlack(userId: string, dto: BroadcastDto) {
    if (!this.slackBot) throw new Error('Slack bot not available');

    let text = `📢 *${dto.title}*\n\n${dto.message}`;
    if (dto.actionUrl) {
      text += `\n\n🔗 ${dto.actionUrl}`;
    }
    await this.slackBot.sendMessage(userId, text);
  }
}
