import { Injectable, BadRequestException, NotFoundException, OnModuleInit, Logger, Inject, Optional, forwardRef } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ethers } from 'ethers';
import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';
import { HotStateService } from '../core/hot-state.service';
import { UserActivityAction, Prisma } from '@prisma/client';
import { ActivityService } from '../activity/activity.service';
import { getRpId } from '../config/app-url.config';
import { isWebPlaceholderUsername, provisionalPlatformId } from '../config/provisional-identity';
import {
  SOLANA_PROGRAM_ID,
  bytes32FromStored,
  deriveVaultAddress,
  deriveVaultFromPasskey,
  identitySalt,
  isSolanaAddress,
} from '../chains/solana/solana-account';

@Injectable()
export class IdentityService implements OnModuleInit {
  private readonly logger = new Logger(IdentityService.name);
  private readonly prisma: PrismaService;

  constructor(
    prisma?: PrismaService,
    private readonly hotStateService?: HotStateService,
    @Optional() @Inject(forwardRef(() => ActivityService))
    private readonly activityService?: ActivityService,
  ) {
    this.prisma = prisma || new PrismaService();
  }

  private factoryAddress: string;

  onModuleInit() {
    this.factoryAddress = SOLANA_PROGRAM_ID.toBase58();
    this.logger.log(`IdentityService initialized with Solana Program: ${this.factoryAddress}`);
  }

  /**
   * Validate Telegram raw launch params securely via HMAC verification
   */
  validateTelegramInitData(initData: string, botToken: string): boolean {
    if (!initData || !botToken) return false;
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return false;

    // Check auth_date is within the last 5 minutes to prevent replay attacks
    const authDate = params.get('auth_date');
    if (authDate) {
      const authTimestamp = parseInt(authDate, 10) * 1000;
      const maxAgeMs = 5 * 60 * 1000;
      if (isNaN(authTimestamp) || Date.now() - authTimestamp > maxAgeMs) {
        return false;
      }
    }

    params.delete('hash');
    const sortedKeys = Array.from(params.keys()).sort();
    const dataCheckString = sortedKeys.map(key => `${key}=${params.get(key)}`).join('\n');

    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    const computed = Buffer.from(computedHash, 'hex');
    const provided = Buffer.from(hash, 'hex');
    return computed.length === provided.length && crypto.timingSafeEqual(computed, provided);
  }

  // =============================================================
  //              UNIFIED CROSS-PLATFORM IDENTITY
  // =============================================================

  /**
   * The single source of truth for "which user is this?" across every bot driver.
   *
   * Resolution order:
   *   1. `SocialNode` for (platform, platformUserId) — the canonical link table.
   *   2. The denormalized `User.<platform>Id` column, scoped to the *same*
   *      platform, for accounts predating SocialNode backfill. A hit here
   *      self-heals by writing the missing SocialNode.
   *
   * Deliberately never matches on `username` alone: usernames are not unique
   * across platforms, so a Discord user named "alice" must never resolve to
   * the Telegram user "alice".
   *
   * @returns the user with `smartWallet` and *active* session keys, or null.
   */
  async resolveUser(platform: string, platformUserId: string, username?: string) {
    if (!platform || !platformUserId) return null;
    const normalizedPlatform = platform.toLowerCase();

    const include = {
      smartWallet: true,
      sessionKeys: {
        where: { expiryAt: { gte: new Date() }, revokedAt: null, activatedAt: { not: null } },
        orderBy: { createdAt: 'desc' as const },
      },
    };

    // 1. Canonical link table.
    const node = await this.prisma.socialNode.findUnique({
      where: {
        platform_platformUserId: {
          platform: normalizedPlatform,
          platformUserId,
        },
      },
      include: { user: { include } },
    });
    if (node?.user) return node.user;

    // 2. Legacy fallback, scoped to this platform only.
    const column = this.platformIdColumn(normalizedPlatform);
    if (!column) return null;

    const user = await this.prisma.user.findFirst({
      where: { [column]: platformUserId } as any,
      include,
    });

    if (user) {
      // Self-heal: create the SocialNode this account should always have had.
      this.syncSocialNode(user.id, normalizedPlatform, platformUserId, user.username || undefined).catch(
        (err) => this.logger.warn(`SocialNode self-heal failed for ${user.id}: ${err.message}`),
      );
      return user;
    }

    // 3. Adopt a provisional account created by an escrow claim.
    //
    // A recipient who claims a payment link has no numeric platform id yet —
    // the sender only ever typed a handle, and the Bot API cannot resolve a
    // handle to an id for someone who has never messaged the bot. Those
    // accounts are parked under `pending:<handle>` until their owner shows up.
    //
    // Binding is safe here because the platform itself is asserting, in this
    // very message, that `platformUserId` currently owns `username`, and
    // handles are unique per platform at any instant. Scoped to one platform,
    // so the Discord-"alice"/Telegram-"alice" confusion above stays impossible.
    const adoptedUserId = await this.adoptProvisionalAccount(
      normalizedPlatform,
      platformUserId,
      username,
    );
    if (!adoptedUserId) return null;

    return this.prisma.user.findUnique({ where: { id: adoptedUserId }, include });
  }

  /** Namespace for accounts awaiting their owner's first authenticated contact. */
  static provisionalPlatformId(handle: string): string {
    return provisionalPlatformId(handle);
  }

  /** @returns the adopted user's id, or null when there is nothing to adopt. */
  private async adoptProvisionalAccount(
    platform: string,
    platformUserId: string,
    username: string | undefined,
  ): Promise<string | null> {
    if (!username) return null;
    const column = this.platformIdColumn(platform);
    if (!column) return null;

    const provisionalId = IdentityService.provisionalPlatformId(username);
    // A real id must never be adoptable, only the `pending:` placeholder.
    if (provisionalId === `pending:${platformUserId}`) return null;

    // The SocialNode write during registration is best-effort (it is wrapped in
    // a .catch), so an account can exist with only the denormalized column set.
    // Falling back to that column keeps those accounts adoptable instead of
    // silently stranding their funds.
    const node = await this.prisma.socialNode.findUnique({
      where: { platform_platformUserId: { platform, platformUserId: provisionalId } },
    });
    const userId =
      node?.userId ??
      (await this.prisma.user.findFirst({
        where: { [column]: provisionalId } as any,
        select: { id: true },
      }))?.id;
    if (!userId) return null;

    try {
      await this.prisma.$transaction([
        // Upsert rather than update: the node may never have been written.
        this.prisma.socialNode.upsert({
          where: { platform_platformUserId: { platform, platformUserId: provisionalId } },
          update: { platformUserId, username: username.replace(/^@/, '') },
          create: { userId, platform, platformUserId, username: username.replace(/^@/, '') },
        }),
        this.prisma.user.update({
          where: { id: userId },
          data: { [column]: platformUserId } as any,
        }),
      ]);
    } catch (err: any) {
      // Unique violation means this id is already bound to a different account.
      // Leave the provisional one untouched rather than merge two identities.
      this.logger.warn(
        `Could not adopt provisional ${platform} account for @${username}: ${err.message}`,
      );
      return null;
    }

    this.logger.log(
      `Adopted provisional ${platform} account ${userId} for @${username} → ${platformUserId}`,
    );
    return userId;
  }

  /** Maps a platform name to its denormalized `User` column. */
  private platformIdColumn(platform: string): 'telegramId' | 'whatsappId' | 'discordId' | 'slackId' | null {
    switch (platform.toLowerCase()) {
      case 'telegram':
        return 'telegramId';
      case 'whatsapp':
        return 'whatsappId';
      case 'discord':
        return 'discordId';
      case 'slack':
        return 'slackId';
      default:
        return null;
    }
  }

  /**
   * Idempotently writes the SocialNode + denormalized column for a platform
   * identity. Safe to call repeatedly.
   *
   * @returns false when the identity is already claimed by a *different* user.
   */
  async syncSocialNode(
    userId: string,
    platform: string,
    platformUserId: string,
    username?: string,
  ): Promise<boolean> {
    const normalizedPlatform = platform.toLowerCase();

    const existing = await this.prisma.socialNode.findUnique({
      where: {
        platform_platformUserId: { platform: normalizedPlatform, platformUserId },
      },
    });

    // Never silently steal an identity that belongs to another account.
    if (existing && existing.userId !== userId) return false;

    await this.prisma.socialNode.upsert({
      where: {
        platform_platformUserId: { platform: normalizedPlatform, platformUserId },
      },
      update: { userId, ...(username ? { username: username.replace(/^@/, '') } : {}) },
      create: {
        userId,
        platform: normalizedPlatform,
        platformUserId,
        username: username?.replace(/^@/, ''),
      },
    });

    // Keep the denormalized column in step so legacy lookups stay correct.
    const column = this.platformIdColumn(normalizedPlatform);
    if (column) {
      await this.prisma.user
        .update({ where: { id: userId }, data: { [column]: platformUserId } as any })
        .catch((err) => this.logger.warn(`Failed to sync ${column} for ${userId}: ${err.message}`));
    }

    return true;
  }

  /**
   * Links an additional platform account to an existing user.
   *
   * Called by the web settings flow, the `/verify` command, and the Discord /
   * Slack OAuth callbacks — every path that adds a platform to an account
   * funnels through here so the duplicate checks cannot be bypassed.
   *
   * @throws BadRequestException when the identity belongs to another account.
   */
  async linkAccount(
    userId: string,
    platform: string,
    platformUserId: string,
    username?: string,
  ): Promise<{ linked: boolean; alreadyLinked: boolean }> {
    const normalizedPlatform = platform.toLowerCase();
    if (!this.platformIdColumn(normalizedPlatform)) {
      throw new BadRequestException(`Unsupported platform: ${platform}`);
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Account not found');

    const existing = await this.prisma.socialNode.findUnique({
      where: {
        platform_platformUserId: { platform: normalizedPlatform, platformUserId },
      },
    });

    if (existing) {
      if (existing.userId === userId) {
        return { linked: true, alreadyLinked: true };
      }
      // Re-pointing an identity would silently transfer wallet access.
      throw new BadRequestException(
        `This ${platform} account is already linked to a different VeriAgent Pay account. ` +
          `Disconnect it there first.`,
      );
    }

    const ok = await this.syncSocialNode(userId, normalizedPlatform, platformUserId, username);
    if (!ok) {
      throw new BadRequestException(`This ${platform} account is already linked elsewhere.`);
    }

    await this.promoteWebPlaceholderUsername(userId, username);

    this.logger.log(
      `Linked ${normalizedPlatform}:${platformUserId} to user ${userId}`,
    );

    await this.activityService
      ?.record({
        userIdentifier: userId,
        action: UserActivityAction.ACCOUNT_LINKED,
        metadata: { platform: normalizedPlatform, platformUserId, username },
      })
      .catch(() => {});

    return { linked: true, alreadyLinked: false };
  }

  /**
   * Swaps a self-serve web signup's generated `web_…` handle for the real one
   * the platform just asserted.
   *
   * A web account starts with no handle anyone can type — it was created
   * without a platform, so its username is a placeholder that exists only to
   * satisfy the unique column. Linking Telegram (or any social) is the first
   * moment a real handle is known, so it is the moment to adopt it: from here
   * on, `@theirhandle` resolves to this wallet in contacts, payment requests,
   * and the leaderboard.
   *
   * Only ever overwrites a generated placeholder, and never throws — a handle
   * already taken by another account leaves the placeholder in place rather
   * than failing the link the user actually asked for.
   */
  private async promoteWebPlaceholderUsername(userId: string, username?: string) {
    const handle = username?.replace(/^@/, '').trim();
    if (!handle) return;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { smartWallet: true },
    });
    if (!isWebPlaceholderUsername(user?.username)) return;

    try {
      await this.prisma.user.update({ where: { id: userId }, data: { username: handle } });
    } catch (err: any) {
      // Unique violation: someone else already holds this handle. The link
      // itself stands; only the cosmetic rename is skipped.
      this.logger.warn(
        `Kept placeholder handle for ${userId}: @${handle} is already taken (${err.message})`,
      );
      return;
    }

    if (user?.smartWallet?.address) {
      this.hotStateService?.setHandleMapping(handle, user.smartWallet.address);
    }
    this.logger.log(`Adopted handle @${handle} for web account ${userId}`);
  }

  /**
   * Unlinks a platform account.
   * Refuses to remove the last remaining login path.
   */
  async unlinkAccount(userId: string, platform: string): Promise<{ unlinked: boolean }> {
    const normalizedPlatform = platform.toLowerCase();
    const column = this.platformIdColumn(normalizedPlatform);
    if (!column) throw new BadRequestException(`Unsupported platform: ${platform}`);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { socialNodes: true },
    });
    if (!user) throw new NotFoundException('Account not found');

    // An account with no email and no other platform would become unreachable.
    const otherNodes = user.socialNodes.filter((n) => n.platform !== normalizedPlatform);
    if (otherNodes.length === 0 && !user.email) {
      throw new BadRequestException(
        'This is your only sign-in method. Link another platform or add an email before disconnecting it.',
      );
    }

    await this.prisma.socialNode.deleteMany({
      where: { userId, platform: normalizedPlatform },
    });
    await this.prisma.user
      .update({ where: { id: userId }, data: { [column]: null } as any })
      .catch(() => undefined);

    this.logger.log(`Unlinked ${normalizedPlatform} from user ${userId}`);

    await this.activityService
      ?.record({
        userIdentifier: userId,
        action: UserActivityAction.ACCOUNT_UNLINKED,
        metadata: { platform: normalizedPlatform },
      })
      .catch(() => {});

    return { unlinked: true };
  }

  /**
   * Onboarding flow extracting P-256 coordinates and storing counterfactual smart account
   */
  async registerUser(
    platform: 'telegram' | 'whatsapp' | 'slack' | 'discord' | 'web',
    platformId: string,
    username: string,
    pubKeyX: string,
    pubKeyY: string,
    credentialId: string = `cred_${Date.now()}`
  ) {
    const derivation = deriveVaultFromPasskey(pubKeyX, pubKeyY, platform, platformId);
    const salt = `0x${derivation.salt.toString('hex')}`;
    const pubKeyHash = `0x${derivation.rootHash.toString('hex')}`;
    const smartAccountAddress = derivation.address;

    const cleanUsername = username.replace(/^@/, '');
    let existing = await this.prisma.user.findFirst({
      where: {
        OR: [
          ...(platform === 'telegram'
            ? [{ telegramId: platformId }, { username: cleanUsername }, { telegramId: cleanUsername }]
            : []),
          ...(platform === 'whatsapp' ? [{ whatsappId: platformId }] : []),
          { username: cleanUsername },
          ...(platform === 'telegram' ? [] : [{ username: cleanUsername.toLowerCase() }]),
        ],
      },
      include: { smartWallet: true },
    });

    let user: any;
    if (existing) {
      user = await this.prisma.user.update({
        where: { id: existing.id },
        data: {
          username: cleanUsername,
          telegramId: platform === 'telegram' ? platformId : existing.telegramId,
          whatsappId: platform === 'whatsapp' ? platformId : existing.whatsappId,
          slackId: platform === 'slack' ? platformId : existing.slackId,
          discordId: platform === 'discord' ? platformId : existing.discordId,
        },
        include: { smartWallet: true },
      });

      // Adopt the passkey-derived PDA when this identity was pre-created as an
      // unregistered recipient. No placeholder PDA is treated as spendable.
      if (existing.smartWallet && (existing.smartWallet.publicKeyX === '0x0' || existing.smartWallet.publicKeyX === '0')) {
        await this.prisma.smartWallet.update({
          where: { id: existing.smartWallet.id },
          data: {
            address: smartAccountAddress,
            publicKeyX: pubKeyX,
            publicKeyY: pubKeyY,
            salt,
            isDeployed: false,
            factoryAddress: this.factoryAddress,
            derivationVersion: 'SOLANA_PDA_V1',
          },
        });
        user = await this.prisma.user.findUnique({
          where: { id: existing.id },
          include: { smartWallet: true },
        });
      }
    } else {
      user = await this.prisma.user.create({
        data: {
          username: cleanUsername,
          telegramId: platform === 'telegram' ? platformId : null,
          whatsappId: platform === 'whatsapp' ? platformId : null,
          slackId: platform === 'slack' ? platformId : null,
          discordId: platform === 'discord' ? platformId : null,
          smartWallet: {
            create: {
              address: smartAccountAddress,
              publicKeyX: pubKeyX,
              publicKeyY: pubKeyY,
              salt,
              isDeployed: false,
              factoryAddress: this.factoryAddress,
              derivationVersion: 'SOLANA_PDA_V1',
            },
          },
        },
        include: { smartWallet: true },
      });
    }

    const typedUser = user as typeof user & { smartWallet?: { address: string; isDeployed: boolean } | null };

    // Create the canonical SocialNode for this platform identity.
    // Without it the account has no entry in the link table, which means
    // UnifiedNotificationService can never reach the user on any platform.
    if (platform !== 'web') {
      await this.syncSocialNode(typedUser.id, platform, platformId, cleanUsername).catch((err) =>
        this.logger.warn(`Failed to create SocialNode for ${typedUser.id}: ${err.message}`),
      );
    }

    // Populate in-memory HotStateService cache
    if (smartAccountAddress) {
      this.hotStateService?.setHandleMapping(username, smartAccountAddress);
      this.hotStateService?.setHandleMapping(platformId, smartAccountAddress);
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) throw new Error('JWT_SECRET environment variable is required');
    const resolvedAddress = typedUser.smartWallet?.address || smartAccountAddress;
    const accessToken = jwt.sign(
      { userId: typedUser.id, walletAddress: resolvedAddress, jti: crypto.randomUUID() },
      jwtSecret,
      { expiresIn: '24h' }
    );

    // Save PasskeyCredential record (legacy plaintext — will be upgraded to envelope encryption by CredentialVaultService if configured)
    if (credentialId) {
      try {
        await this.prisma.passkeyCredential.upsert({
          where: { credentialId },
          update: { publicKeyX: pubKeyX, publicKeyY: pubKeyY },
          create: {
            userId: typedUser.id,
            credentialId,
            publicKeyX: pubKeyX,
            publicKeyY: pubKeyY,
          },
        });
      } catch (e: any) {
        this.logger.warn(`PasskeyCredential upsert fallback: ${e.message}`);
      }
    }

    // Record activity log
    await this.activityService?.record({
      userIdentifier: typedUser.id,
      action: UserActivityAction.USER_REGISTERED,
      metadata: { platform, platformId, username, smartAccountAddress: resolvedAddress },
    }).catch(() => {});

    return {
      userId: typedUser.id,
      smartAccountAddress: resolvedAddress,
      isDeployed: typedUser.smartWallet?.isDeployed || false,
      accessToken,
      // A web signup is handed a generated handle it never chose. Returning it
      // lets the client show what the account is currently called, and prompt
      // to replace it by linking a social.
      username: typedUser.username as string | null,
    };
  }

  /**
   * Links a Telegram chatId to a user record and updates hot state cache
   */
  async linkTelegramChatId(
    platform: string,
    platformId: string,
    chatId: string,
    username: string,
    providedAddress?: string
  ): Promise<string> {
    const whereClause: any = {};
    if (platform === 'telegram') whereClause.telegramId = platformId;
    else whereClause.username = username;

    let existingUser = await this.prisma.user.findFirst({
      where: whereClause,
      include: { smartWallet: true },
    });

    const address =
      providedAddress ||
      existingUser?.smartWallet?.address ||
      (await this.resolveContact(platform, platformId));

    if (existingUser) {
      await this.prisma.user.update({
        where: { id: existingUser.id },
        data: {
          telegramId: platform === 'telegram' ? platformId : existingUser.telegramId,
          telegramChatId: chatId,
          username: username || existingUser.username,
        },
      });
    } else {
      existingUser = await this.prisma.user.create({
        data: {
          username,
          telegramId: platform === 'telegram' ? platformId : null,
          telegramChatId: chatId,
          smartWallet: {
            create: {
              address,
              publicKeyX: '0x0',
              publicKeyY: '0x0',
              salt: ethers.id(`${platform}_${platformId}`),
              isDeployed: false,
            },
          },
        },
        include: { smartWallet: true },
      });
    }

    // Pre-warm in-memory hot state cache
    if (address) {
      this.hotStateService?.setHandleMapping(username, address);
      this.hotStateService?.setHandleMapping(platformId, address);
      if (chatId) this.hotStateService?.setHandleMapping(chatId, address);
    }

    return address;
  }

  /**
   * Helper to normalize phone numbers (remove spaces, +, -, parentheses)
   */
  normalizePhone(input: string): string {
    return input.replace(/[\s\+\-\(\)]/g, '').trim();
  }

  /**
   * Resolve handle (convenience wrapper for resolveContact)
   */
  async resolveHandle(handle: string, platform = 'telegram'): Promise<string> {
    return this.resolveContact(platform, handle);
  }

  /**
   * Reverse resolution: Wallet Address -> Social Handle / Username
   */
  async getHandleForAddress(address: string, platform?: string): Promise<string> {
    if (!address || !isSolanaAddress(address)) {
      return address || 'Unknown';
    }

    // 0. Fast-path Redis HotStateService reverse cache
    if (this.hotStateService) {
      const cached = await this.hotStateService.getHandleForAddress(address);
      if (cached) return cached;
    }

    // 1. DB query: find user by smartWallet.address
    try {
      const user = await this.prisma.user.findFirst({
        where: {
          smartWallet: {
            address: { equals: address },
          },
        },
        include: {
          socialNodes: true,
        },
      });

      if (user) {
        if (platform) {
          const matchingNode = user.socialNodes.find(n => n.platform.toLowerCase() === platform.toLowerCase());
          if (matchingNode?.username) {
            const h = matchingNode.username.startsWith('@') ? matchingNode.username : `@${matchingNode.username}`;
            this.hotStateService?.setHandleMapping(h, address);
            return h;
          }
          if (platform === 'telegram' && user.telegramId) return `@${user.username || user.telegramId}`;
          if (platform === 'whatsapp' && user.whatsappId) return user.whatsappId;
          if (platform === 'discord' && user.discordId) return user.discordId;
          if (platform === 'slack' && user.slackId) return user.slackId;
        }

        const handle = user.username
          ? `@${user.username}`
          : user.telegramId
          ? `@${user.telegramId}`
          : user.whatsappId
          ? user.whatsappId
          : user.socialNodes[0]?.username
          ? (user.socialNodes[0].username.startsWith('@') ? user.socialNodes[0].username : `@${user.socialNodes[0].username}`)
          : `${address.slice(0, 6)}...${address.slice(-4)}`;

        this.hotStateService?.setHandleMapping(handle, address);
        return handle;
      }
    } catch (e: any) {
      this.logger.warn(`Failed reverse handle lookup for address ${address}: ${e.message}`);
    }

    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  /**
   * Resolve any platform handle, phone number, or social ID to its wallet address
   */
  async resolveContact(platform: string, handle: string, allowUnregisteredCounterfactual = true): Promise<string> {
    if (!handle || !handle.trim()) {
      throw new BadRequestException('Recipient handle or address is required');
    }

    const trimmed = handle.trim();

    // 0. A native Solana address is already a complete recipient identity.
    if (isSolanaAddress(trimmed)) {
      return trimmed;
    }

    const formattedHandle = trimmed.startsWith('@') ? trimmed.slice(1) : trimmed;
    const normalizedPhone = this.normalizePhone(trimmed);
    const exactPlatformHandleMatch = platform.toLowerCase() === 'telegram';
    const usernameMatch = (value: string) =>
      exactPlatformHandleMatch
        ? { equals: value }
        : { equals: value, mode: 'insensitive' as Prisma.QueryMode };

    // 1. Fast-path Redis HotStateService lookup
    if (this.hotStateService) {
      const cachedAddress =
        await this.hotStateService.resolveHandle(formattedHandle) ||
        await this.hotStateService.resolveHandle(trimmed) ||
        (normalizedPhone ? await this.hotStateService.resolveHandle(normalizedPhone) : null);

      if (cachedAddress) return cachedAddress;
    }

    // 2. Try finding in SocialNode table first (linked accounts)
    try {
      const linkedNode: any = await this.prisma.socialNode.findFirst({
        where: {
          platform: { equals: platform, mode: 'insensitive' as Prisma.QueryMode },
          OR: [
            { username: usernameMatch(trimmed) },
            { username: usernameMatch(formattedHandle) },
            { username: usernameMatch(`@${formattedHandle}`) },
            { platformUserId: formattedHandle },
            ...(normalizedPhone ? [{ platformUserId: normalizedPhone }] : [])
          ]
        },
        include: { user: { include: { smartWallet: true } } }
      });
      if (linkedNode?.user?.smartWallet?.address) {
        const addr = linkedNode.user.smartWallet.address;
        this.hotStateService?.setHandleMapping(trimmed, addr);
        return addr;
      }
    } catch (err) { }

    // 3. Try finding in User table directly
    const existingUser: any = await this.prisma.user.findFirst({
      where: {
        OR: [
          { username: usernameMatch(formattedHandle) },
          { telegramId: formattedHandle },
          { whatsappId: formattedHandle },
          { discordId: formattedHandle },
          { slackId: formattedHandle },
          ...(normalizedPhone ? [
            { whatsappId: normalizedPhone },
            { telegramId: normalizedPhone },
          ] : [])
        ]
      },
      include: { smartWallet: true }
    });

    if (existingUser?.smartWallet?.address) {
      const addr = existingUser.smartWallet.address;
      // Auto-link numeric platformId if user previously resolved by username handle
      if (platform === 'telegram' && existingUser.telegramId !== formattedHandle && /^\d+$/.test(formattedHandle)) {
        await this.prisma.user.update({
          where: { id: existingUser.id },
          data: { telegramId: formattedHandle },
        }).catch(() => {});
      }
      this.hotStateService?.setHandleMapping(trimmed, addr);
      return addr;
    }

    // 4. Counterfactual resolution or not found exception
    if (allowUnregisteredCounterfactual) {
      const rawPlatformUserId = normalizedPhone || formattedHandle;
      // A Telegram username is part of the counterfactual derivation salt.
      // Preserve it exactly so casing cannot redirect a payment to a different
      // placeholder wallet.
      const platformUserId = platform === 'telegram'
        ? rawPlatformUserId
        : rawPlatformUserId.toLowerCase();
      const saltBytes = identitySalt(platform, platformUserId);
      const salt = `0x${saltBytes.toString('hex')}`;
      const placeholderHash = `0x${Buffer.alloc(32).toString('hex')}`;
      const counterfactualAddress = await this.computeCounterfactualAddress(salt, placeholderHash);

      // Pre-create counterfactual User record so future lookups by username or platformId match this address
      try {
        const cleanHandle = platform === 'telegram'
          ? formattedHandle
          : formattedHandle.toLowerCase();
        await this.prisma.user.create({
          data: {
            username: cleanHandle,
            telegramId: platform === 'telegram' ? cleanHandle : null,
            whatsappId: platform === 'whatsapp' ? cleanHandle : null,
            discordId: platform === 'discord' ? cleanHandle : null,
            slackId: platform === 'slack' ? cleanHandle : null,
            smartWallet: {
              create: {
                address: counterfactualAddress,
                publicKeyX: '0x0',
                publicKeyY: '0x0',
                salt,
                isDeployed: false,
              },
            },
          },
        });
      } catch (err: any) {
        // Record might exist from race condition, swallow duplicate error
      }

      this.hotStateService?.setHandleMapping(trimmed, counterfactualAddress);
      return counterfactualAddress;
    }

    const displayHandle = trimmed.startsWith('@') ? trimmed : `@${trimmed}`;
    throw new NotFoundException(`${displayHandle} is not registered yet. Invite them to VeriAgent Pay!`);
  }

  /**
   * Resolve a handle (username or platformId) to a full user object
   */
  async resolveUserByHandle(handle: string) {
    const formattedHandle = handle.startsWith('@') ? handle.slice(1) : handle;

    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { username: formattedHandle },
          { telegramId: formattedHandle },
          { whatsappId: formattedHandle },
          { discordId: formattedHandle },
          { slackId: formattedHandle },
        ]
      },
      include: { smartWallet: true }
    });

    return user;
  }

  /**
   * Find a registered social node or user by their handle
   */
  async findSocialNodeByHandle(platform: string, handle: string) {
    const formattedHandle = handle.startsWith('@') ? handle.slice(1) : handle;
    try {
      const node = await this.prisma.socialNode.findFirst({
        where: {
          platform,
          OR: [
            { username: handle },
            { username: formattedHandle },
            { platformUserId: formattedHandle }
          ]
        }
      });
      if (node) return node;
    } catch (e) { }

    try {
      const user = await this.prisma.user.findFirst({
        where: {
          OR: [
            { username: formattedHandle },
            { telegramId: formattedHandle },
            { whatsappId: formattedHandle },
            { discordId: formattedHandle },
          ]
        }
      });
      if (user) {
        return {
          id: user.id,
          userId: user.id,
          platform,
          platformUserId: formattedHandle,
          username: user.username,
        };
      }
    } catch (e) { }

    return null;
  }

  /**
   * The address a user's vault will occupy once deployed.
   *
   * Asks the factory, which is the only authority on this. The local CREATE2
   * derivation below reproduces the same arithmetic from environment variables,
   * and reproducing it is exactly how it goes wrong: an operator who updates
   * one address variable and not another gets a plausible address that no
   * factory will ever deploy to. That happened — a stale
   * `PAY_VAULT_IMPLEMENTATION_ADDRESS` handed a user a vault address the
   * factory disowned, and `ensureVaultDeployed` (correctly) refused to deploy
   * it, leaving the account permanently unable to grant a session key.
   *
   * The local path stays as a fallback for an unreachable RPC, but it is no
   * longer what a working system relies on.
   */
  public async computeCounterfactualAddress(salt: string, ownerKeyHash: string): Promise<string> {
    return deriveVaultAddress(
      bytes32FromStored(ownerKeyHash),
      bytes32FromStored(salt),
    );
  }
}
