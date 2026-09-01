import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationsService } from './notifications.service';
import { IdentityService } from '../identity/identity.service';
import { TelegramBotDriver } from '../platform/drivers/telegram-bot';
import { WhatsAppBotDriver } from '../platform/drivers/whatsapp-bot';
import { DiscordBotDriver } from '../platform/drivers/discord-bot';
import { SlackBotDriver } from '../platform/drivers/slack-bot';
import { getAppBaseUrl } from '../config/app-url.config';

export interface UnifiedNotificationEvent {
  userId: string;
  type: 'money_received' | 'money_sent' | 'vault_deposit' | 'vault_withdrawal' | 'envelope_claimed' | 'envelope_created' | 'pool_loan_requested' | 'pool_loan_approved' | 'pool_loan_repaid' | 'pool_loan_due_soon' | 'pool_loan_repayment_reminder' | 'pool_invitation' | 'referral_reward' | 'badge_earned' | 'subscription_success' | 'subscription_failed' | 'admin_alert' | 'split_request' | 'split_paid' | 'split_completed';
  title: string;
  body: string;
  amount?: number;
  token?: string;
  from?: string;
  to?: string;
  link?: string;
  metadata?: Record<string, any>;
}

interface PlatformMessage {
  telegram?: string;
  whatsapp?: string;
  discord?: any;
  slack?: any;
  web?: any;
}

@Injectable()
export class UnifiedNotificationService {
  private readonly logger = new Logger(UnifiedNotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: NotificationsGateway,
    private readonly notificationsService: NotificationsService,
    @Inject(forwardRef(() => IdentityService))
    private readonly identityService: IdentityService,
    @Inject(forwardRef(() => TelegramBotDriver))
    private readonly telegramBot?: TelegramBotDriver,
    @Inject(forwardRef(() => WhatsAppBotDriver))
    private readonly whatsappBot?: WhatsAppBotDriver,
    @Inject(forwardRef(() => DiscordBotDriver))
    private readonly discordBot?: DiscordBotDriver,
    @Inject(forwardRef(() => SlackBotDriver))
    private readonly slackBot?: SlackBotDriver,
  ) {}

  /**
   * Main entry point: notify user across all linked and enabled platforms
   */
  async notifyUser(event: UnifiedNotificationEvent): Promise<void> {
    try {
      this.logger.log(`[UnifiedNotif] Sending ${event.type} notification to user ${event.userId}`);

      // 0. Resolve `from` and `to` handles/names if they are UUIDs or raw addresses
      if (event.from) {
        event.from = await this.resolveDisplayName(event.from);
      }
      if (event.to) {
        event.to = await this.resolveDisplayName(event.to);
      }

      // Scan event.body and event.title for UUIDs and replace them with their human-friendly usernames
      const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
      const uuidsInBody = (event.body?.match(uuidRegex) || []);
      const uuidsInTitle = (event.title?.match(uuidRegex) || []);
      const uniqueUuids = Array.from(new Set([...uuidsInBody, ...uuidsInTitle]));

      for (const uuid of uniqueUuids) {
        const resolvedName = await this.resolveDisplayName(uuid);
        if (resolvedName && resolvedName !== uuid) {
          if (event.body) event.body = event.body.replaceAll(uuid, resolvedName);
          if (event.title) event.title = event.title.replaceAll(uuid, resolvedName);
        }
      }

      // Resolve user if handle or address or phone passed
      let resolvedUserId: string | null = null;
      try {
        const cleanId = event.userId.startsWith('@') ? event.userId.slice(1) : event.userId;
        const user = await this.prisma.user.findFirst({
          where: {
            OR: [
              { id: event.userId },
              { username: { equals: cleanId, mode: 'insensitive' } },
              { telegramId: event.userId },
              { telegramId: cleanId },
              { whatsappId: event.userId },
              { whatsappId: cleanId },
              { email: event.userId },
              { smartWallet: { address: { equals: event.userId, mode: 'insensitive' } } },
            ],
          },
          select: { id: true },
        });
        if (user) {
          resolvedUserId = user.id;
        }
      } catch (e) {
        // fallback
      }

      const canonicalUserId = resolvedUserId || event.userId;

      // 1. Look up user's linked social accounts
      const socialNodes = await this.getUserSocialNodes(canonicalUserId);

      // 2. Check user's notification preferences
      const prefs = await this.getUserNotificationPreferences(canonicalUserId);

      // 3. Log notification to NotificationLog for analytics and frequency caps
      const category = this.mapEventTypeToCategory(event.type);
      if (resolvedUserId) {
        try {
          await this.prisma.notificationLog.create({
            data: {
              userId: resolvedUserId,
              category,
              notificationType: event.type,
            },
          });
        } catch (logErr: any) {
          this.logger.warn(`Failed to create NotificationLog: ${logErr.message}`);
        }
      }

      // 4. Format messages for each platform
      const messages = this.formatPlatformMessages(event);

      // 5. Dispatch to each platform in parallel (fire-and-forget)
      const promises: Promise<void>[] = [];

      // Web Push (via WebSocket)
      if (prefs.webPushNotifications) {
        // `canonicalUserId`, not the raw `event.userId` — callers pass wallet
        // addresses and handles here, and the in-app row is keyed by user id.
        promises.push(this.sendWebNotification(canonicalUserId, messages.web || event));
      }

      // Telegram
      if (prefs.telegramNotifications && this.telegramBot) {
        const telegramNode = socialNodes.find(n => n.platform === 'telegram');
        if (telegramNode?.platformUserId) {
          promises.push(
            this.sendTelegramNotification(telegramNode.platformUserId, messages.telegram || event.body, event)
          );
        }
      }

      // WhatsApp
      if (prefs.whatsappNotifications && this.whatsappBot) {
        const whatsappNode = socialNodes.find(n => n.platform === 'whatsapp');
        if (whatsappNode?.platformUserId) {
          promises.push(
            this.sendWhatsAppNotification(whatsappNode.platformUserId, messages.whatsapp || event.body, event)
          );
        }
      }

      // Discord
      if (prefs.discordNotifications && this.discordBot) {
        const discordNode = socialNodes.find(n => n.platform === 'discord');
        if (discordNode?.platformUserId) {
          promises.push(
            this.sendDiscordNotification(discordNode.platformUserId, messages.discord, event)
          );
        }
      }

      // Slack
      if (prefs.slackNotifications && this.slackBot) {
        const slackNode = socialNodes.find(n => n.platform === 'slack');
        if (slackNode?.platformUserId) {
          promises.push(
            this.sendSlackNotification(slackNode.platformUserId, messages.slack, event)
          );
        }
      }

      // Execute all in parallel (non-blocking)
      await Promise.allSettled(promises);

      this.logger.log(`[UnifiedNotif] Completed ${event.type} notification dispatch for ${event.userId}`);

    } catch (error: any) {
      this.logger.error(`[UnifiedNotif] Failed to send notification: ${error.message}`);
    }
  }

  /**
   * Map event type to notification category for frequency capping
   */
  private mapEventTypeToCategory(type: string): string {
    if (type.includes('money_') || type.includes('vault_') || type.includes('envelope_')) {
      return 'spending';
    } else if (type.includes('vault_deposit')) {
      return 'saving';
    } else if (type.includes('referral_') || type.includes('envelope_created')) {
      return 'virality';
    } else if (type.includes('badge_')) {
      return 'reputation';
    } else if (type.includes('pool_') || type.includes('split_')) {
      return 'socialProof';
    }
    return 'spending'; // default
  }

  /**
   * Fetch all linked social accounts for a user
   */
  private async getUserSocialNodes(userId: string): Promise<any[]> {
    try {
      const cleanId = userId.startsWith('@') ? userId.slice(1) : userId;
      const user = await this.prisma.user.findFirst({
        where: {
          OR: [
            { id: userId },
            { username: { equals: cleanId, mode: 'insensitive' } },
            { telegramId: userId },
            { telegramId: cleanId },
            { whatsappId: userId },
            { whatsappId: cleanId },
            { email: userId },
            { smartWallet: { address: { equals: userId, mode: 'insensitive' } } },
          ],
        },
        include: { socialNodes: true },
      });
      if (!user) return [];

      const nodes = [...user.socialNodes];
      const seen = new Set(nodes.map((n) => n.platform.toLowerCase()));

      // Fall back to the denormalized columns for any platform without a
      // SocialNode. Accounts created before SocialNode was wired into
      // registerUser have none at all, and would otherwise receive no
      // notification on any platform.
      const legacy: [string, string | null][] = [
        ['telegram', user.telegramId],
        ['whatsapp', user.whatsappId],
        ['discord', user.discordId],
        ['slack', user.slackId],
      ];

      for (const [platform, platformUserId] of legacy) {
        if (platformUserId && !seen.has(platform)) {
          nodes.push({
            id: `legacy-${platform}-${user.id}`,
            userId: user.id,
            platform,
            platformUserId,
            username: user.username,
            createdAt: user.createdAt,
          } as any);
        }
      }

      return nodes;
    } catch (error: any) {
      this.logger.warn(`Failed to fetch social nodes for ${userId}: ${error.message}`);
      return [];
    }
  }

  /**
   * Fetch user's notification platform preferences
   */
  private async getUserNotificationPreferences(userId: string) {
    const defaults = {
      telegramNotifications: true,
      whatsappNotifications: true,
      discordNotifications: true,
      slackNotifications: true,
      webPushNotifications: true,
    };

    try {
      const cleanId = userId.startsWith('@') ? userId.slice(1) : userId;
      const user = await this.prisma.user.findFirst({
        where: {
          OR: [
            { id: userId },
            { username: { equals: cleanId, mode: 'insensitive' } },
            { telegramId: userId },
            { whatsappId: userId },
          ],
        },
        include: { notificationPreferences: true },
      });
      if (!user?.notificationPreferences) return defaults;
      return { ...defaults, ...user.notificationPreferences };
    } catch (error: any) {
      this.logger.warn(`Failed to fetch notification prefs for ${userId}: ${error.message}`);
      return defaults;
    }
  }

  /**
   * Format messages for each platform with platform-specific features
   */
  private formatPlatformMessages(event: UnifiedNotificationEvent): PlatformMessage {
    const baseUrl = getAppBaseUrl();
    const link = event.link || `${baseUrl}/dashboard`;

    // Telegram: Markdown + inline buttons
    const telegram = this.formatTelegramMessage(event, link);

    // WhatsApp: Plain text + link (no buttons without templates)
    const whatsapp = this.formatWhatsAppMessage(event, link);

    // Discord: Embed cards
    const discord = this.formatDiscordMessage(event, link);

    // Slack: Block Kit
    const slack = this.formatSlackMessage(event, link);

    // Web: Object for WebSocket
    const web = {
      title: event.title,
      body: event.body,
      type: event.type,
      amount: event.amount,
      token: event.token,
      link,
      metadata: event.metadata,
    };

    return { telegram, whatsapp, discord, slack, web };
  }

  private formatTelegramMessage(event: UnifiedNotificationEvent, link: string): string {
    let icon = '🔔';
    if (event.type === 'money_received') icon = '💰';
    else if (event.type === 'money_sent') icon = '💸';
    else if (event.type === 'vault_deposit') icon = '🏦';
    else if (event.type === 'envelope_claimed' || event.type === 'envelope_created') icon = '🧧';
    else if (event.type === 'badge_earned') icon = '🏆';
    else if (event.type === 'referral_reward') icon = '🎁';
    else if (event.type === 'split_request' || event.type === 'split_paid') icon = '📊';
    else if (event.type === 'split_completed') icon = '🎉';
    else if (event.type === 'pool_loan_requested') icon = '🗳️';
    else if (event.type === 'pool_loan_approved') icon = '⚡';
    else if (event.type === 'pool_loan_due_soon' || event.type === 'pool_loan_repayment_reminder') icon = '⏳';
    else if (event.type === 'pool_loan_repaid') icon = '🏦';

    let message = `${icon} *${event.title}*\n\n${event.body}`;

    if (event.amount && event.token) {
      message += `\n\n💵 Amount: *${event.amount} ${event.token}*`;
    }

    if (event.from) {
      message += `\n👤 From: ${event.from}`;
    }

    if (event.type === 'pool_loan_due_soon' || event.type === 'pool_loan_repayment_reminder') {
      const amtStr = event.amount && event.token ? ` ($${event.amount} ${event.token})` : '';
      message += `\n\n👉 [💳 Repay Loan Now${amtStr}](${link})`;
    } else if (event.type === 'pool_loan_requested') {
      message += `\n\n👉 [🗳️ Vote on Loan Application](${link})`;
    } else if (event.type === 'pool_loan_approved') {
      message += `\n\n👉 [⚡ View & Repay Active Loan](${link})`;
    } else if (event.type === 'pool_loan_repaid') {
      message += `\n\n👉 [🏦 View Pool Group](${link})`;
    } else if (event.type === 'split_request') {
      message += `\n\n👉 [💳 Approve & Pay Share](${link})`;
    } else if (event.type === 'envelope_created') {
      message += `\n\n👉 [🎁 Claim Red Envelope](${link})`;
    } else if (event.type === 'envelope_claimed') {
      // Already claimed — inviting them to claim it again was the wrong verb
      // on a message that opens with "You claimed 50 USDT".
      message += `\n\n👉 [🧧 View Red Envelope](${link})`;
    } else {
      message += `\n\n👉 [View Details](${link})`;
    }

    return message;
  }

  private formatWhatsAppMessage(event: UnifiedNotificationEvent, link: string): string {
    let icon = '🔔';
    if (event.type === 'money_received') icon = '💰';
    else if (event.type === 'money_sent') icon = '💸';
    else if (event.type === 'vault_deposit') icon = '🏦';
    else if (event.type === 'envelope_created' || event.type === 'envelope_claimed') icon = '🧧';
    else if (event.type === 'split_request') icon = '📊';
    else if (event.type === 'pool_loan_due_soon' || event.type === 'pool_loan_repayment_reminder') icon = '⏳';
    else if (event.type === 'pool_loan_requested') icon = '🗳️';
    else if (event.type === 'pool_loan_approved') icon = '⚡';

    let message = `${icon} *${event.title}*\n\n${event.body}`;

    if (event.amount && event.token) {
      message += `\n\n💵 Amount: *${event.amount} ${event.token}*`;
    }

    if (event.type === 'pool_loan_due_soon' || event.type === 'pool_loan_repayment_reminder') {
      message += `\n\n👉 Tap link to repay loan: ${link}`;
    } else if (event.type === 'split_request') {
      message += `\n\n👉 Tap link to approve/pay your share: ${link}`;
    } else if (event.type === 'envelope_created' || event.type === 'envelope_claimed') {
      message += `\n\n👉 Tap link to claim red envelope: ${link}`;
    } else {
      message += `\n\n👉 Tap link for details: ${link}`;
    }

    return message;
  }

  private formatDiscordMessage(event: UnifiedNotificationEvent, link: string) {
    let color = 0x10b981; // emerald
    if (event.type === 'money_received') color = 0x10b981;
    else if (event.type === 'money_sent') color = 0x3b82f6;
    else if (event.type === 'vault_deposit') color = 0x8b5cf6;
    else if (event.type === 'envelope_created' || event.type === 'envelope_claimed') color = 0xef4444;
    else if (event.type === 'split_request') color = 0xf59e0b;
    else if (event.type === 'pool_loan_due_soon' || event.type === 'pool_loan_repayment_reminder') color = 0xf59e0b;
    else if (event.type === 'pool_loan_requested') color = 0x3b82f6;

    const embed: any = {
      title: event.title,
      description: event.body,
      color,
      timestamp: new Date().toISOString(),
      footer: {
        text: 'VeriAgent Pay',
      },
      fields: [],
    };

    if (event.amount && event.token) {
      embed.fields.push({
        name: 'Amount',
        value: `${event.amount} ${event.token}`,
        inline: true,
      });
    }

    if (event.from) {
      embed.fields.push({
        name: 'From',
        value: event.from,
        inline: true,
      });
    }

    const buttonLabel = (event.type === 'pool_loan_due_soon' || event.type === 'pool_loan_repayment_reminder')
      ? '💳 Repay Loan Now'
      : event.type === 'pool_loan_requested'
      ? '🗳️ Vote on Application'
      : event.type === 'pool_loan_approved'
      ? '⚡ View Active Loan'
      : event.type === 'split_request'
      ? '💳 Approve & Pay Share'
      : event.type === 'envelope_created' || event.type === 'envelope_claimed'
      ? '🎁 Claim Red Envelope'
      : 'View Details';

    return {
      embeds: [embed],
      components: [
        {
          type: 1, // Action Row
          components: [
            {
              type: 2, // Button
              style: 5, // Link
              label: buttonLabel,
              url: link,
            },
          ],
        },
      ],
    };
  }

  private formatSlackMessage(event: UnifiedNotificationEvent, link: string) {
    let emoji = ':bell:';
    if (event.type === 'money_received') emoji = ':money_with_wings:';
    else if (event.type === 'money_sent') emoji = ':money_with_wings:';
    else if (event.type === 'vault_deposit') emoji = ':bank:';
    else if (event.type === 'envelope_created' || event.type === 'envelope_claimed') emoji = ':envelope:';
    else if (event.type === 'split_request') emoji = ':bar_chart:';

    const blocks: any[] = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${emoji} *${event.title}*\n${event.body}`,
        },
      },
    ];

    if (event.amount && event.token) {
      blocks.push({
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Amount:*\n${event.amount} ${event.token}`,
          },
          {
            type: 'mrkdwn',
            text: `*From:*\n${event.from || 'N/A'}`,
          },
        ],
      });
    }

    const buttonText = event.type === 'split_request'
      ? '💳 Approve & Pay Share'
      : event.type === 'envelope_created' || event.type === 'envelope_claimed'
      ? '🎁 Claim Red Envelope'
      : 'View Details';

    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: buttonText,
          },
          url: link,
          style: 'primary',
        },
      ],
    });

    return { blocks };
  }

  // Platform-specific send methods
  private async sendWebNotification(userId: string, event: any): Promise<void> {
    try {
      // Create notification in DB and emit via WebSocket
      await this.notificationsService.create({
        userId,
        type: event.type as any,
        title: event.title,
        body: event.body,
        data: event,
        // This service already delivered to Telegram, WhatsApp, Discord and
        // Slack — with inline buttons and a link. Letting `create` push again
        // sent every user a second, plainer copy of the same message.
        suppressPlatformPush: true,
      });
    } catch (error: any) {
      this.logger.warn(`Web notification failed for ${userId}: ${error.message}`);
    }
  }

  private async sendTelegramNotification(chatId: string, message: string, event: UnifiedNotificationEvent): Promise<void> {
    try {
      if (!this.telegramBot) {
        this.logger.debug('Telegram bot not available');
        return;
      }

      const baseUrl = getAppBaseUrl();
      const link = event.link || `${baseUrl}/dashboard`;

      let inlineKeyboard: any[] = [];
      if (event.type === 'split_request') {
        const amountStr = event.amount && event.token ? ` (${event.amount} ${event.token})` : '';
        inlineKeyboard = [
          [{ text: `💳 Approve & Pay Share${amountStr}`, url: link }],
          [{ text: `🌐 View Split Details`, url: link }],
        ];
      } else if (event.type === 'envelope_created') {
        const amountStr = event.amount && event.token ? ` (${event.amount} ${event.token})` : '';
        inlineKeyboard = [
          [{ text: `🎁 Claim Red Envelope${amountStr}`, url: link }],
        ];
      } else if (event.type === 'envelope_claimed') {
        inlineKeyboard = [
          [{ text: `🧧 View Red Envelope`, url: link }],
        ];
      } else if (event.type === 'money_received' || event.type === 'money_sent') {
        inlineKeyboard = [
          [{ text: `💸 View Payment Details`, url: link }],
        ];
      } else {
        inlineKeyboard = [
          [{ text: `🔗 View Details`, url: link }],
        ];
      }

      await this.telegramBot.sendMessageWithInlineKeyboard(chatId, message, inlineKeyboard);

      this.logger.log(`✅ Telegram notification sent to ${chatId} with interactive inline buttons`);
    } catch (error: any) {
      this.logger.warn(`Telegram notification failed for ${chatId}: ${error.message}`);
    }
  }

  private async sendWhatsAppNotification(phoneNumber: string, message: string, event: UnifiedNotificationEvent): Promise<void> {
    try {
      if (!this.whatsappBot) {
        this.logger.debug('WhatsApp bot not available');
        return;
      }

      await this.whatsappBot.sendMessage(phoneNumber, message);

      this.logger.log(`✅ WhatsApp notification sent to ${phoneNumber}`);
    } catch (error: any) {
      this.logger.warn(`WhatsApp notification failed for ${phoneNumber}: ${error.message}`);
    }
  }

  private async sendDiscordNotification(userId: string, embedData: any, event: UnifiedNotificationEvent): Promise<void> {
    try {
      if (!this.discordBot) {
        this.logger.debug('Discord bot not available');
        return;
      }

      // For now, send plain text message (embed support can be added later)
      const message = `${event.title}\n\n${event.body}`;
      await this.discordBot.sendMessage(userId, message);

      this.logger.log(`✅ Discord notification sent to ${userId}`);
    } catch (error: any) {
      this.logger.warn(`Discord notification failed for ${userId}: ${error.message}`);
    }
  }

  private async sendSlackNotification(userId: string, blockData: any, event: UnifiedNotificationEvent): Promise<void> {
    try {
      if (!this.slackBot) {
        this.logger.debug('Slack bot not available');
        return;
      }

      // For now, send plain text message (block kit support can be added later)
      const message = `${event.title}\n\n${event.body}`;
      await this.slackBot.sendMessage(userId, message);

      this.logger.log(`✅ Slack notification sent to ${userId}`);
    } catch (error: any) {
      this.logger.warn(`Slack notification failed for ${userId}: ${error.message}`);
    }
  }

  /**
   * Resolve an identifier (address, UUID, handle) to a user-friendly display name
   */
  private async resolveDisplayName(identifier: string): Promise<string> {
    if (!identifier) return 'Anonymous';
    const trimmed = identifier.trim();
    if (trimmed.startsWith('@')) return trimmed;

    // Fast check for 0x address
    if (trimmed.startsWith('0x') && trimmed.length === 42) {
      const handle = await this.identityService.getHandleForAddress(trimmed);
      if (handle && handle !== trimmed) return handle;
      return `${trimmed.slice(0, 6)}...${trimmed.slice(-4)}`;
    }

    try {
      const clean = trimmed.replace(/^@/, '');
      const user = await this.prisma.user.findFirst({
        where: {
          OR: [
            { id: trimmed },
            { username: { equals: clean, mode: 'insensitive' } },
            { telegramId: trimmed },
            { telegramId: clean },
            { email: { equals: trimmed, mode: 'insensitive' } },
            { smartWallet: { address: { equals: trimmed, mode: 'insensitive' } } },
          ],
        },
        include: {
          smartWallet: { select: { address: true } },
          poolMemberships: { take: 1, select: { userIdentifier: true } },
          socialNodes: { take: 1, select: { username: true } },
        },
      });

      if (user) {
        if (user.username) return user.username.startsWith('@') ? user.username : `@${user.username}`;
        if (user.socialNodes?.[0]?.username) {
          const s = user.socialNodes[0].username;
          return s.startsWith('@') ? s : `@${s}`;
        }
        if (user.poolMemberships?.[0]?.userIdentifier && !user.poolMemberships[0].userIdentifier.includes('-')) {
          const p = user.poolMemberships[0].userIdentifier;
          return p.startsWith('@') ? p : `@${p}`;
        }
        if (user.email) return user.email.split('@')[0];
        if (user.smartWallet?.address) {
          const addr = user.smartWallet.address;
          return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
        }
      }

      // Check PoolMember
      const poolMember = await this.prisma.poolMember.findFirst({
        where: {
          OR: [
            { userId: trimmed },
            { userIdentifier: trimmed },
          ],
        },
        select: { userIdentifier: true },
      });
      if (poolMember?.userIdentifier && !poolMember.userIdentifier.includes('-')) {
        return poolMember.userIdentifier.startsWith('@') ? poolMember.userIdentifier : `@${poolMember.userIdentifier}`;
      }
    } catch (e: any) {
      this.logger.warn(`Failed to resolve display name for ${identifier}: ${e.message}`);
    }

    if (trimmed.length === 36 && trimmed.includes('-')) {
      return `Member (${trimmed.slice(0, 6)})`;
    }

    return trimmed;
  }
}
