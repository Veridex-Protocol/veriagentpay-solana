// Fix: P1-14 Singleton PrismaService Injection
import { Injectable, BadRequestException, ConflictException, Logger, Inject, Optional, forwardRef } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { IdentityService } from '../identity/identity.service';
import { TelegramBotDriver } from '../platform/drivers/telegram-bot';
import { RedisService } from '../core/redis.service';
import { getTelegramBotUsername } from '../config/app-url.config';
import * as crypto from 'crypto';
import {
  PendingTelegramLink,
  TELEGRAM_LINK_TTL_SECONDS,
  normalizeTelegramUsername,
  pendingTelegramLinkKey,
} from './telegram-link-state';

/** Ten minutes, matching the lifetime of the code itself. */
const LINK_OTP_TTL_SECONDS = TELEGRAM_LINK_TTL_SECONDS;

export type PlatformType = 'telegram' | 'whatsapp' | 'discord' | 'slack';

@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly identityService: IdentityService,
    private readonly redis: RedisService,
    @Optional()
    @Inject(forwardRef(() => TelegramBotDriver))
    private readonly telegramBot?: TelegramBotDriver,
  ) {}

  /**
   * Where a link code was delivered, when it was delivered as an OTP straight
   * to a chat account.
   *
   * This binding is written at send time and read at redemption, because the
   * browser cannot prove which chat account it speaks for. Re-deriving the
   * target from whatever handle the browser submits at redemption would let
   * someone request a code for their own handle, receive it, and then redeem it
   * against somebody else's.
   */
  private linkOtpKey(code: string) {
    return `link-otp:${code}`;
  }

  /**
   * Resolves a typed handle to the Telegram account we can actually message.
   *
   * Only an account that has already talked to the bot is reachable — Telegram
   * refuses a first message from a bot — so an unresolved handle is normal, not
   * an error, and the caller falls back to the deep link.
   */
  private async resolveTelegramTarget(handle: string): Promise<{ platformUserId: string; username: string } | null> {
    const username = handle.replace(/^@/, '').trim();
    if (!username) return null;

    const node = await this.prisma.socialNode.findFirst({
      where: { platform: 'telegram', username: { equals: username, mode: 'insensitive' } },
    });
    if (node?.platformUserId && /^\d+$/.test(node.platformUserId)) {
      return { platformUserId: node.platformUserId, username };
    }

    const user = await this.prisma.user.findFirst({
      where: { username: { equals: username, mode: 'insensitive' }, telegramId: { not: null } },
      select: { telegramId: true },
    });
    if (user?.telegramId && /^\d+$/.test(user.telegramId)) {
      return { platformUserId: user.telegramId, username };
    }

    return null;
  }

  async resolveOrCreateUser(userIdOrWallet: string): Promise<string> {
    try {
      const user = await this.prisma.user.findFirst({
        where: {
          OR: [
            { id: userIdOrWallet },
            { smartWallet: { address: { equals: userIdOrWallet, mode: 'insensitive' } } },
          ],
        },
      });
      if (user) {
        return user.id;
      }

      // If it looks like a wallet address and user does not exist, create user profile
      if (userIdOrWallet.startsWith('0x')) {
        const cleanAddress = userIdOrWallet.toLowerCase();
        const newUser = await this.prisma.user.create({
          data: {
            username: `user_${cleanAddress.slice(2, 8)}`,
            smartWallet: {
              create: {
                address: cleanAddress,
                publicKeyX: '0x0',
                publicKeyY: '0x0',
                salt: `salt_${Date.now()}`,
              },
            },
          },
        });
        return newUser.id;
      }
    } catch (e: any) {
      this.logger.warn(`Error resolving user ${userIdOrWallet}: ${e.message}`);
    }
    return userIdOrWallet;
  }

  async requestLink(userId: string, platform: PlatformType, handle?: string) {
    if (!['telegram', 'whatsapp', 'discord', 'slack'].includes(platform)) {
      throw new BadRequestException('Unsupported social platform');
    }

    const resolvedUserId = await this.resolveOrCreateUser(userId);

    if (platform === 'telegram' || platform === 'whatsapp') {
      // A linking code grants access to a wallet, so it must be unguessable.
      // Math.random() is not a CSPRNG and must never back an auth credential.
      const code = crypto.randomInt(100000, 1000000).toString();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      // Invalidate any outstanding codes for this user+platform so only the
      // newest one is redeemable.
      await this.prisma.verificationCode
        .updateMany({
          where: { userId: resolvedUserId, platform, usedAt: null },
          data: { usedAt: new Date(), usedBy: 'superseded' },
        })
        .catch(() => undefined);

      await this.prisma.verificationCode.create({
        data: {
          userId: resolvedUserId,
          platform,
          code,
          expiresAt,
        },
      });

      const botUsername = getTelegramBotUsername();

      // Preferred route when the person names a handle we can already reach:
      // deliver the code to that Telegram account as an OTP and let them type
      // it back here. It proves control of the account without leaving the
      // page, and — unlike the deep link — it cannot be completed by whoever
      // happens to be signed into Telegram on this device.
      if (platform === 'telegram' && handle) {
        const target = await this.resolveTelegramTarget(handle);
        if (target && this.telegramBot) {
          const owner = await this.prisma.socialNode.findUnique({
            where: {
              platform_platformUserId: { platform: 'telegram', platformUserId: target.platformUserId },
            },
          });
          if (owner && owner.userId !== resolvedUserId) {
            throw new ConflictException(
              `@${target.username} is already linked to another VeriAgent Pay account. Disconnect it there first.`,
            );
          }

          try {
            await this.redis.setJson(this.linkOtpKey(code), target, LINK_OTP_TTL_SECONDS * 1000);
            await this.telegramBot.sendMessage(
              target.platformUserId,
              `🔗 *Link your VeriAgent Pay account*\n\n` +
                `Your code is *${code}*\n\n` +
                `Enter it on the web page you came from. It expires in 10 minutes.\n` +
                `If you did not request this, ignore this message — nothing is linked without the code.`,
            );
            this.logger.log(`Link OTP delivered to telegram:${target.platformUserId} for user ${resolvedUserId}`);
            return {
              platform,
              delivery: 'otp' as const,
              botUsername,
              maskedTarget: `@${target.username}`,
              instructions: `We sent a 6-digit code to @${target.username} on Telegram. Enter it below.`,
              expiresAt,
            };
          } catch (err: any) {
            // A blocked bot or a stale chat id: fall through to the deep link
            // rather than stranding the user on a code that never arrives.
            this.logger.warn(`Link OTP delivery failed for @${target.username}: ${err.message}`);
            await this.redis.del(this.linkOtpKey(code)).catch(() => undefined);
          }
        }
      }

      if (platform === 'telegram' && handle) {
        const normalizedHandle = normalizeTelegramUsername(handle);
        if (normalizedHandle) {
          const wallet = await this.prisma.smartWallet.findUnique({
            where: { userId: resolvedUserId },
            select: { address: true },
          });
          const pendingLink: PendingTelegramLink = {
            code,
            walletAddress: wallet?.address || null,
            expiresAt: expiresAt.toISOString(),
          };
          await this.redis.setJson(
            pendingTelegramLinkKey(normalizedHandle),
            pendingLink,
            TELEGRAM_LINK_TTL_SECONDS * 1000,
          );
        }
      }

      return {
        platform,
        delivery: 'deeplink' as const,
        code,
        botUsername,
        // One tap replaces "copy this code, find the bot, type a command" —
        // Telegram opens the chat and delivers the code as the /start payload.
        // The proof is unchanged: the code is still redeemed from inside the
        // account being linked, so Telegram asserts whose account that is.
        deepLink:
          platform === 'telegram'
            ? `https://t.me/${encodeURIComponent(botUsername)}?start=verify_${code}`
            : undefined,
        instructions: `Send "/verify ${code}" to @${botUsername} on ${platform === 'telegram' ? 'Telegram' : 'WhatsApp'}`,
        expiresAt,
      };
    } else {
      // Discord or Slack OAuth2 URL generation
      const state = `st_${resolvedUserId}_${Date.now()}`;
      const clientId = process.env[`${platform.toUpperCase()}_CLIENT_ID`];
      if (!clientId) {
        throw new BadRequestException(`${platform} OAuth is not configured. Missing ${platform.toUpperCase()}_CLIENT_ID environment variable.`);
      }
      const baseUrl = process.env.PUBLIC_APP_URL || process.env.API_BASE_URL || 'http://localhost:3001';
      const redirectUri = encodeURIComponent(`${baseUrl}/api/auth/${platform}/callback`);
      
      const oauthUrl = platform === 'discord'
        ? `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=identify&state=${state}`
        : `https://slack.com/oauth/v2/authorize?client_id=${clientId}&scope=identity.basic&redirect_uri=${redirectUri}&state=${state}`;

      return {
        platform,
        url: oauthUrl,
        state,
      };
    }
  }

  /**
   * Redeems a linking code and attaches the platform identity to the account
   * that *issued* the code.
   *
   * Previously this swallowed the "invalid code" error, linked to the caller
   * rather than the code's owner, never consumed the code, and fabricated a
   * placeholder `platformUserId` when none was supplied — so a caller could
   * link an arbitrary identity with an invalid code.
   */
  async verifyCode(
    userId: string,
    platform: PlatformType,
    code: string,
    platformUserId?: string,
    username?: string,
  ) {
    if (!code?.trim()) throw new BadRequestException('Verification code is required');

    // An OTP was delivered to one specific chat, so that chat — not anything
    // the caller sends — is the account being linked. Possession of the code
    // is the proof, and only that chat received it.
    const otpTarget = await this.redis
      .getJson<{ platformUserId: string; username: string }>(this.linkOtpKey(code.trim()))
      .catch(() => null);
    if (otpTarget) {
      platformUserId = otpTarget.platformUserId;
      username = username || otpTarget.username;
    }

    if (!platformUserId?.trim()) {
      throw new BadRequestException(
        'platformUserId is required — it identifies the account being linked.',
      );
    }

    // Atomic claim: matches only while unused and unexpired.
    const claimed = await this.prisma.verificationCode.updateMany({
      where: { code: code.trim(), platform, usedAt: null, expiresAt: { gte: new Date() } },
      data: { usedAt: new Date(), usedBy: platformUserId },
    });
    if (claimed.count !== 1) {
      throw new BadRequestException('Invalid, expired, or already-used verification code');
    }

    const record = await this.prisma.verificationCode.findUnique({ where: { code: code.trim() } });
    if (!record) throw new BadRequestException('Invalid verification code');

    // Link to the code's issuer, never to whoever happens to be calling.
    const resolvedUserId = await this.resolveOrCreateUser(userId);
    if (record.userId !== resolvedUserId) {
      throw new BadRequestException('This verification code was issued for a different account');
    }

    try {
      await this.identityService.linkAccount(record.userId, platform, platformUserId, username);
    } catch (err) {
      // Release the claim so a legitimate retry remains possible.
      await this.prisma.verificationCode
        .update({ where: { id: record.id }, data: { usedAt: null, usedBy: null } })
        .catch(() => undefined);
      throw err;
    }

    // Single-use, like the code row itself.
    await this.redis.del(this.linkOtpKey(code.trim())).catch(() => undefined);

    const socialNode = await this.prisma.socialNode.findUnique({
      where: { platform_platformUserId: { platform, platformUserId } },
    });

    return { success: true, socialNode };
  }

  async getLinkedAccounts(userId: string) {
    const resolvedUserId = await this.resolveOrCreateUser(userId);
    try {
      const nodes = await this.prisma.socialNode.findMany({
        where: { userId: resolvedUserId },
      });

      const user = await this.prisma.user.findUnique({
        where: { id: resolvedUserId },
      });

      const result = [...nodes];

      if (user) {
        const platforms: { key: 'telegramId' | 'whatsappId' | 'slackId' | 'discordId'; name: PlatformType }[] = [
          { key: 'telegramId', name: 'telegram' },
          { key: 'whatsappId', name: 'whatsapp' },
          { key: 'slackId', name: 'slack' },
          { key: 'discordId', name: 'discord' },
        ];

        for (const plat of platforms) {
          const val = user[plat.key];
          if (val && !result.some(n => n.platform === plat.name)) {
            result.push({
              id: `sn-direct-${plat.name}`,
              userId: resolvedUserId,
              platform: plat.name,
              platformUserId: val,
              username: plat.name === 'telegram' ? (user.username.startsWith('@') ? user.username : `@${user.username}`) : user.username,
              createdAt: user.createdAt,
            } as any);
          }
        }
      }

      return result;
    } catch (e: any) {
      this.logger.error(`Failed to fetch linked accounts: ${e.message}`);
      return [];
    }
  }

  /**
   * Disconnects a platform from the account.
   *
   * Delegates to {@link IdentityService.unlinkAccount}, which also clears the
   * denormalized `User.<platform>Id` column. Deleting only the SocialNode left
   * that column set, and the legacy resolution fallback would keep matching the
   * "disconnected" account — the unlink appeared to work but did not.
   */
  async unlinkPlatform(userId: string, platform: PlatformType) {
    const resolvedUserId = await this.resolveOrCreateUser(userId);
    await this.identityService.unlinkAccount(resolvedUserId, platform);
    return { success: true, platform };
  }
}
