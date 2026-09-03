import { Inject, Injectable, Logger } from '@nestjs/common';
import { IdentityService } from '../identity/identity.service';
import { RelayerService } from '../relayer/relayer.service';
import { resolveToken, SUPPORTED_TOKENS, TokenInfo } from '../config/tokens.config';
import { UserTokensService } from '../tokens/user-tokens.service';
import { getAppBaseUrl, getTelegramBotUsername } from '../config/app-url.config';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ethers } from 'ethers';

import { NlpService } from '../nlp/nlp.service';
import { AdminService } from '../admin/admin.service';

import { ShortLinksService, withAttribution } from '../shortlinks/shortlinks.service';
import { EscrowService } from '../escrow/escrow.service';
import { createBotChainProvider } from '../common/rpc-provider.helper';
import { VaultService } from '../vault/vault.service';
import { PoolsService } from '../pools/pools.service';
import { ReferralService } from '../referral/referral.service';
import { BadgesService } from '../badges/badges.service';
import { HotStateService } from '../core/hot-state.service';
import { ContactsService } from '../contacts/contacts.service';
import { ActivityService } from '../activity/activity.service';
import { CommandParserService, ParsedCommand, CommandIntent } from './command-parser.service';
import { PaymentEscalationService } from './payment-escalation.service';
import { describeForLog, errorReference, toUserMessage } from '../common/user-error.util';
import { SplitsService } from '../splits/splits.service';
import { SubscriptionService } from '../subscription/subscription.service';
import { InteractiveActionService } from './interactive-action.service';
import { NOTIFICATIONS_STORE, type NotificationStore } from '../common/service-contracts';
import { NOTIFICATION_SERVICE, type UserNotifier } from '../common/service-contracts';
import { FunnelEventsService } from '../analytics/funnel-events.service';
import { createRelayerSigner } from '../relayer/relayer-signer.factory';
import { GrowthService } from '../growth/growth.service';
import { SolanaChainService } from '../chains/solana/solana-chain.service';
import { isSolanaAddress } from '../chains/solana/solana-account';
import { SolanaRelayerService } from '../relayer/solana-relayer.service';

export interface SocialMessagePayload {
  platform: 'telegram' | 'whatsapp' | 'slack' | 'discord';
  platformId: string;
  platformGroupId?: string;
  username?: string;
  text?: string;
  replyToken?: string;
}

export interface ParsedIntent {
  action: CommandIntent;
  amount?: number;
  tokenSymbol?: string;
  tokenInfo?: TokenInfo | null;
  unsupportedToken?: string;
  recipient?: string;
  participants?: string[];
  memo?: string;
  claimsCount?: number;
  intervalDays?: number;
  poolId?: string;
  members?: string[];
  /** Short-link code, e.g. the escrow being cancelled. */
  code?: string;
  adminArgs?: any;
}

function formatSolBalance(lamports: bigint): string {
  const whole = lamports / 1_000_000_000n;
  const fraction = (lamports % 1_000_000_000n).toString().padStart(9, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

@Injectable()
export class PlatformService {
  private readonly logger = new Logger(PlatformService.name);
  private readonly secretKey = process.env.DEEPLINK_SECRET || '';
  private readonly drivers = new Map<string, any>();

  constructor(
    public readonly prisma: PrismaService,
    private readonly identityService: IdentityService,
    private readonly relayerService: RelayerService,
    private readonly paymentEscalation: PaymentEscalationService,
    private readonly shortLinksService: ShortLinksService,
    private readonly escrowService: EscrowService,
    private readonly commandParserService: CommandParserService,
    private readonly vaultService: VaultService,
    private readonly poolsService: PoolsService,
    public readonly referralService: ReferralService,
    public readonly funnelEvents: FunnelEventsService,
    public readonly badgesService: BadgesService,
    private readonly hotStateService: HotStateService,
    private readonly contactsService: ContactsService,
    private readonly activityService: ActivityService,
    private readonly splitsService: SplitsService,
    private readonly interactiveActionService: InteractiveActionService,
    @Inject(NOTIFICATIONS_STORE)
    private readonly notificationsService: NotificationStore,
    @Inject(NOTIFICATION_SERVICE)
    private readonly unifiedNotificationService: UserNotifier,
    private readonly userTokensService: UserTokensService,
    private readonly growthService: GrowthService,
    private readonly solana: SolanaChainService,
    private readonly subscriptionService?: SubscriptionService,
    private readonly adminService?: AdminService,
    private readonly nlpService?: NlpService
  ) { }

  registerDriver(platform: string, driver: any) {
    this.drivers.set(platform, driver);
    this.logger.log(`Registered platform driver: ${platform}`);
  }

  getInteractiveActionService(): InteractiveActionService {
    return this.interactiveActionService;
  }

  async sendDirectMessage(platform: string, targetId: string, text: string, replyMarkup?: any): Promise<boolean> {
    const driver = this.drivers.get(platform);
    if (!driver) {
      this.logger.warn(`No driver registered for platform: ${platform}`);
      return false;
    }
    try {
      if (platform === 'telegram') {
        await driver.sendMessageWithMarkup(targetId, text, replyMarkup);
      } else if (typeof driver.sendMessage === 'function') {
        await driver.sendMessage(targetId, text);
      } else {
        this.logger.warn(`Driver for ${platform} does not support sendMessage`);
        return false;
      }
      return true;
    } catch (e: any) {
      this.logger.error(`Failed to send direct message via ${platform}: ${e.message}`);
      return false;
    }
  }

  /**
   * Generates a signed deep link URL to prevent parameter tampering
   */
  generateSignedDeepLink(path: string, queryParams: Record<string, any>): string {
    if (!this.secretKey) throw new Error('DEEPLINK_SECRET is required to generate signed application links');

    // Attribution params ride outside the signature: they are advisory growth
    // metadata, and including them would break signature verification for
    // links whose attribution is added later in the chain.
    const ATTRIBUTION_KEYS = ['ref', 'src', 'campaign', 'partner', 'channel'];
    const attribution: Record<string, string> = {};
    const signable: Record<string, any> = {};
    for (const [key, value] of Object.entries(queryParams)) {
      if (value === undefined || value === null) continue;
      if (ATTRIBUTION_KEYS.includes(key)) attribution[key] = value.toString();
      else signable[key] = value;
    }

    const searchParams = new URLSearchParams();
    const signedParams = { ...signable, expires: Math.floor(Date.now() / 1000) + 15 * 60 };
    Object.keys(signedParams).sort().forEach(k => {
      if (signedParams[k] !== undefined) searchParams.append(k, signedParams[k].toString());
    });

    const queryString = searchParams.toString();
    const sig = crypto.createHmac('sha256', this.secretKey).update(queryString).digest('hex');
    const baseUrl = getAppBaseUrl();
    const signedUrl = `${baseUrl}${path}?${queryString}&sig=${sig}`;

    // Default the source to the platform when the caller did not set one.
    if (!attribution.src && signable.platform) attribution.src = signable.platform.toString();
    return withAttribution(signedUrl, attribution);
  }

  /**
   * Universal message router for any social messaging driver
   */
  async handleSocialMessage(payload: SocialMessagePayload): Promise<string> {
    const text = payload.text.trim();
    if (!text) return '';

    const parsedCommand = await this.commandParserService.parseCommand(text, { platform: payload.platform, username: payload.username });
    const intent: ParsedIntent = {
      action: parsedCommand.intent,
      ...parsedCommand.params,
    };

    this.logger.log(`Parsed command via [${parsedCommand.source.toUpperCase()}] (confidence: ${parsedCommand.confidence}): ${parsedCommand.intent}`);

    if (intent.unsupportedToken) {
      return `⚠️ Unsupported token '${intent.unsupportedToken}'.\n\n` +
        `Supported assets: *USDC* and *SOL*.\n\n` +
        `Examples: "send 50 USDC to @bob" or "send 1 SOL to @bob"`;
    }

    try {
      switch (intent.action) {
        case 'TOKENS':
          return this.solanaFeatureUnavailable('Custom SPL token watchlists');
        case 'ADD_TOKEN':
          return this.solanaFeatureUnavailable('Custom SPL token watchlists');
        case 'REMOVE_TOKEN':
          return this.solanaFeatureUnavailable('Custom SPL token watchlists');
        case 'START': {
          const user = await this.prisma.user.findFirst({
            where: {
              OR: [
                { telegramId: payload.platformId },
                { whatsappId: payload.platformId },
                { slackId: payload.platformId },
                { discordId: payload.platformId },
                { username: payload.username },
              ]
            },
            include: {
              smartWallet: true,
              sessionKeys: {
                where: {
                  expiryAt: { gte: new Date() },
                  revokedAt: null,
                  activatedAt: { not: null },
                },
                orderBy: { createdAt: 'desc' },
              }
            }
          });

          const onboardLink = this.generateSignedDeepLink('/onboard', { platform: payload.platform, platformId: payload.platformId, username: payload.username });
          const keysLink = this.generateSignedDeepLink('/keys', { platform: payload.platform, userId: payload.platformId, username: payload.username, mint: 'true' });

          let onboardingStatus = '';
          if (!user || !user.smartWallet) {
            onboardingStatus = `⚠️ *Action Required: Onboarding Pending*\n` +
              `You do not have a registered passkey wallet yet. To use VeriAgent Pay, please set up your hardware biometric passkey.\n` +
              `👉 [🚀 Register Passkey & Create Wallet](${onboardLink})\n\n`;
          } else if (!user.sessionKeys || user.sessionKeys.length === 0) {
            onboardingStatus = `🔑 *Action Required: Session Key Pending*\n` +
              `You have a registered passkey wallet but no active fast-path session key. Session keys let you send payments instantly without biometric prompts!\n` +
              `👉 [⚡ Authorize Session Key](${keysLink})\n\n`;
          } else {
            onboardingStatus = `✅ *Account Fully Onboarded*\n` +
              `Your passkey wallet and fast-path session keys are active and ready!\n\n` +
              `🛡️ *Tip:* Add a backup passkey or personal recovery guardian from /dashboard → Security so you can recover your wallet if you lose your device.\n\n`;
          }

          return `👋 *Welcome to VeriAgent Pay!*\n\n` +
            `Your self-custodial smart wallet for instant payments, AI-powered yield, and social finance — right from chat.\n\n` +
            `${onboardingStatus}` +
            `🚀 *Quick Start:*\n` +
            `• /dashboard — Open the secure web dashboard\n` +
            `• /wallet — View your wallet & balances\n` +
            `• /pay 50 USDC @alice — Send money instantly\n` +
            `• /save — AI yield vault (Coming Soon)\n` +
            `• /referral — Invite friends & earn rewards\n\n` +
            `Use the menu below or type any command to get started!`;
        }
        case 'HELP':
          return `🤖 *VeriAgent Pay Commands*\n\n` +
            `💳 *Wallet & Identity*\n` +
            `• /dashboard — Open dashboard and manage session-key limits\n` +
            `• /wallet — View balances & passkey controls\n` +
            `• /balance — Quick balance check\n` +
            `• /history — View recent transactions & activity history\n` +
            `• /contacts — View your frequent contacts\n` +
            `• /verify <code> — Link your web account\n\n` +
            `💸 *Payments*\n` +
            `• /pay 50 USDC @alice — Send money\n` +
            `• /request 25 USDC @bob — Request money\n` +
            `• SOL — Visible network balance; USDC is the settlement asset\n\n` +
            `🎯 *Coming next on Solana*\n` +
            `• Splits, subscriptions, envelopes, pools, and yield vaults\n\n` +
            `🏆 *Rewards*\n` +
            `• /referral — Refer friends & earn VERI\n` +
            `• /leaderboard — Global rankings\n` +
            `• /badges — Achievement badges\n\n` +
            `💡 You can also type naturally: "send 50 USDC to @alice"\n` +
            `Recipients are auto-saved to contacts for quick re-sends.`;
        case 'PAY':
          return await this.handlePayAction(payload, intent);
        case 'REQUEST':
          return await this.handleRequestAction(payload, intent);
        case 'SAVE':
          return this.solanaFeatureUnavailable('Yield vaults');
        case 'ENVELOPE':
          return this.solanaFeatureUnavailable('Red envelopes');
        case 'SPLIT':
          return this.solanaFeatureUnavailable('Bill splits');
        case 'LEADERBOARD':
          return await this.handleLeaderboardCommand(payload);
        case 'BADGES':
          return await this.handleBadgesCommand(payload);
        case 'INVITE':
        case 'REFERRAL':
          return await this.handleReferralAction(payload);
        case 'STATS':
          return await this.handleStatsCommand(payload);
        case 'PENDING':
          return await this.handlePendingCommand(payload);
        case 'CANCEL':
          return await this.handleCancelCommand(payload, intent);
        case 'ADMIN_STATS': {
          const totalUsers = await this.prisma.user.count();
          const activeLast24h = await this.prisma.userActivityLog.groupBy({
            by: ['userId'],
            where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
          });
          const txs24h = await this.prisma.userActivityLog.count({
            where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
          });

          const depositSum = await this.prisma.userActivityLog.aggregate({
            where: { action: 'VAULT_DEPOSIT' },
            _sum: { amount: true },
          });
          const withdrawSum = await this.prisma.userActivityLog.aggregate({
            where: { action: 'VAULT_WITHDRAW' },
            _sum: { amount: true },
          });
          const tvl = Number(depositSum._sum.amount || 0) - Number(withdrawSum._sum.amount || 0);

          return `🛡️ *VeriAgent Pay Admin Overview*\n\n` +
            `👥 Total Users: ${totalUsers}\n` +
            `⚡ Daily Active Wallets (DAW): ${activeLast24h.length}\n` +
            `💰 TVL Locked: $${Math.max(0, tvl).toFixed(2)} USDC\n` +
            `💸 24h Transactions: ${txs24h}\n` +
            `💵 Protocol Revenue 24h: $${(txs24h * 0.05).toFixed(2)}`;
        }
        case 'ADMIN_INSIGHTS': {
          const totalUsers = await this.prisma.user.count();
          const referredUsers = await this.prisma.referral.count();
          const kFactor = totalUsers > 0 ? (referredUsers / totalUsers).toFixed(2) : '0.00';

          const usersWithVault = await this.prisma.userActivityLog.groupBy({
            by: ['userId'],
            where: { action: 'VAULT_DEPOSIT' },
          });
          const vaultPercent = totalUsers > 0 ? ((usersWithVault.length / totalUsers) * 100).toFixed(1) : '0.0';

          const depositSum = await this.prisma.userActivityLog.aggregate({
            where: { action: 'VAULT_DEPOSIT' },
            _sum: { amount: true },
          });
          const withdrawSum = await this.prisma.userActivityLog.aggregate({
            where: { action: 'VAULT_WITHDRAW' },
            _sum: { amount: true },
          });
          const tvl = Number(depositSum._sum.amount || 0) - Number(withdrawSum._sum.amount || 0);

          return `🤖 *AI Executive Report (@veridex/agents)*\n\n` +
            `• *Viral K-Factor (${kFactor}):* Calculated referral loop.\n` +
            `• *Yield Vaults (${vaultPercent}%):* $${Math.max(0, tvl).toFixed(2)} TVL locked.\n` +
            `• *Recommendation:* ${Number(kFactor) < 1.0 ? 'Launch 2x Double Referral Weekend to push K > 1.2.' : 'K-Factor is healthy! Maintain current reward structures.'}`;
        }
        case 'ADMIN_ALERT':
          return `📢 *Admin Alert Broadcast Sent:* "${intent.adminArgs || 'System Alert'}"`;
        case 'ADMIN_ADD':
          if (this.adminService) {
            await this.adminService.addAdminIdentifier({ platform: intent.adminArgs?.platform || 'telegram', value: intent.adminArgs?.value || '@admin' });
          }
          return `✅ *Admin Identifier Whitelisted:* ${intent.adminArgs?.platform}:${intent.adminArgs?.value}`;
        case 'SUBSCRIBE':
          return this.solanaFeatureUnavailable('Recurring subscriptions');
        case 'WALLET':
          return await this.handleWalletCommand(payload);
        case 'DASHBOARD':
          return await this.handleDashboardCommand(payload);
        case 'BALANCE':
          return await this.handleBalanceCommand(payload);
        case 'CONTACTS':
          return await this.handleContactsCommand(payload);
        case 'HISTORY':
          return await this.handleHistoryCommand(payload);
        case 'REQUESTS_MENU':
          return await this.handleRequestsMenu(payload);
        case 'SPLITS_MENU':
          return this.solanaFeatureUnavailable('Bill splits');
        case 'VAULTS_MENU':
          return this.solanaFeatureUnavailable('Yield vaults');
        case 'ENVELOPES_MENU':
          return this.solanaFeatureUnavailable('Red envelopes');
        case 'POOLS_MENU':
          return this.solanaFeatureUnavailable('Group pools');
        case 'POOL_INVITE':
          return this.solanaFeatureUnavailable('Group pools');
        case 'POOL_JOIN':
          return this.solanaFeatureUnavailable('Group pools');
        case 'POOL_DEPOSIT':
          return this.solanaFeatureUnavailable('Group pools');
        case 'POOL_REQUEST':
          return this.solanaFeatureUnavailable('Group pools');
        case 'MENU':
          return await this.handleUnifiedMenu(payload);
        case 'VERIFY':
          return await this.handleVerifyAction(payload, intent);
        default:
          return `I didn't understand that. Try something like:\n\n` +
            `• "send 50 USDC to @alice"\n` +
            `• "what's my balance"\n` +
            `• /help for all commands`;
      }
    } catch (e: any) {
      this.logger.error(`Error processing social payload: ${e.message}`, e.stack);
      return `❌ ${toUserMessage(e, 'Something went wrong handling that command. Please try again.')}`;
    } finally {
      // Fire-and-forget: record the interaction streak for authenticated users.
      // This runs even if the command handler threw — the user was still active.
      this.resolveCurrentUser(payload)
        .then((user) => {
          if (user) {
            return this.growthService.recordInteraction(user.id, 'BOT_COMMAND');
          }
        })
        .catch((err) =>
          this.logger.warn(`Streak recording failed for ${payload.platformId}: ${err.message}`),
        );
    }
  }

  private parseIntent(text: string): ParsedIntent {
    const res = this.commandParserService.parseRegex(text);
    return {
      action: res.intent,
      ...res.params,
    };
  }

  private async handleContactsCommand(payload: SocialMessagePayload): Promise<string> {
    const user = await this.resolveCurrentUser(payload);
    if (!user) {
      return `⚠️ Please set up your wallet first to manage contacts.`;
    }

    const suggestions = await this.contactsService.getPaySuggestions(user.id, 10);
    if (suggestions.length === 0) {
      return `📇 *Your Contacts*\n\nNo contacts yet. Send money to someone and they'll be added automatically!`;
    }

    let contactsList = '';
    suggestions.forEach((s, i) => {
      const recency = s.lastSentAt ? ` • last: ${this.formatRelativeDate(s.lastSentAt)}` : '';
      contactsList += `${i + 1}. *@${s.identifier}* — ${s.sendCount} sends${recency}\n`;
    });

    return `📇 *Your Contacts* (${suggestions.length})\n\n${contactsList}\n` +
      `💡 Tip: Just type "/pay 50 USDC @name" to send instantly`;
  }

  /**
   * History command — shows user activity logs, sent/received payments, and escrow claims.
   */
  private async handleHistoryCommand(payload: SocialMessagePayload): Promise<string> {
    const user = await this.resolveCurrentUser(payload);
    const userAddress = await this.identityService.resolveContact(payload.platform, payload.platformId);

    // 1. Fetch user activity logs
    let logs: any[] = [];
    if (this.activityService) {
      logs = await this.activityService.getUserActivity(payload.platformId, 8);
    }

    // 2. Fetch shortlinks sent or targeted to user
    const shortLinks = await this.prisma.shortLink.findMany({
      where: {
        OR: [
          ...(user ? [{ senderUserId: user.id }] : []),
          ...(user ? [{ targetUserId: user.username }] : []),
          ...(payload.username ? [{ targetUserId: payload.username }] : []),
          { toAddress: { equals: userAddress, mode: 'insensitive' as any } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 8,
    });

    const dashboardLink = this.generateSignedDeepLink('/activity', {
      platform: payload.platform,
      userId: payload.platformId,
      username: payload.username,
    });

    if (logs.length === 0 && shortLinks.length === 0) {
      return `📜 *Activity & Transaction History*\n\n` +
        `No recent transactions found for \`${this.truncateAddress(userAddress)}\`.\n\n` +
        `💡 Tip: Send money or create a red envelope to get started!`;
    }

    let message = `📜 *Recent Activity & Transactions*\n\n`;

    const items: Array<{ title: string; subtitle: string; time: Date; txHash?: string }> = [];

    for (const log of logs) {
      let title = `• *${log.action.replace(/_/g, ' ')}*`;
      if (log.amount) title += `: *${log.amount} ${log.token || 'USDC'}*`;

      const meta = log.metadata as any;
      let subtitle = meta?.recipientHandle
        ? `To @${meta.recipientHandle}`
        : meta?.senderHandle
        ? `From @${meta.senderHandle}`
        : 'System Action';

      items.push({
        title,
        subtitle,
        time: log.createdAt,
        txHash: log.txHash,
      });
    }

    for (const link of shortLinks) {
      const isSender = user && link.senderUserId === user.id;
      const actionIcon = isSender ? '💸' : '🎁';
      const dirText = isSender
        ? `Sent $${link.amount || 0} ${link.token || 'USDC'} to ${link.targetUserId ? `@${link.targetUserId}` : 'recipient'}`
        : `Received $${link.amount || 0} ${link.token || 'USDC'}`;

      items.push({
        title: `${actionIcon} *${dirText}*`,
        subtitle: `Status: ${link.status}`,
        time: link.createdAt,
        txHash: (link as any).redeemedTxHash || (link as any).txHash || undefined,
      });
    }

    // Sort by most recent
    items.sort((a, b) => b.time.getTime() - a.time.getTime());
    const topItems = items.slice(0, 6);

    topItems.forEach((item, idx) => {
      const relTime = this.formatRelativeDate(item.time);
      const tx = item.txHash ? ` \`(${item.txHash.slice(0, 6)}...${item.txHash.slice(-4)})\`` : '';
      message += `${idx + 1}. ${item.title}\n   • ${item.subtitle} • ${relTime}${tx}\n\n`;
    });

    return message.trim();
  }

  private async handleWalletCommand(payload: SocialMessagePayload): Promise<string> {
    const user = await this.resolveCurrentUser(payload);

    const contact = user?.smartWallet?.address
      ?? await this.identityService.resolveContact(payload.platform, payload.platformId);
    const onboardLink = this.generateSignedDeepLink('/onboard', { platform: payload.platform, platformId: payload.platformId, username: payload.username });
    const keysLink = this.generateSignedDeepLink('/keys', { platform: payload.platform, userId: payload.platformId, username: payload.username, mint: 'true' });
    const dashboardLink = this.generateSignedDeepLink('/dashboard', { platform: payload.platform, userId: payload.platformId, username: payload.username });

    const { sol, usdc } = await this.fetchOnChainBalances(contact);

    let statusBlock = '';
    if (!user || !user.smartWallet) {
      statusBlock = `\n\n⚠️ *Status: Wallet Unregistered*\n` +
        `You haven't registered your biometric passkey. Your address above is a secure counterfactual address.\n` +
        `👉 [🔐 Register Passkey & Create Wallet](${onboardLink})`;
    } else if (!user.sessionKeys || user.sessionKeys.length === 0) {
      statusBlock = `\n\n🔑 *Status: No Active Session Key*\n` +
        `Your passkey wallet is registered, but you need to authorize a fast-path session key for in-chat payments.\n` +
        `👉 [🔐 Authorize Session Key](${keysLink})`;
    } else {
      const activeSession = user.sessionKeys[0];
      statusBlock = `\n\n✅ *Status: Active & Secure*\n` +
        `• Daily safety limit: $${Number(activeSession.dailyLimitUSD).toFixed(2)}\n` +
        `• Per-payment limit: $${Number(activeSession.perTxLimitUSD).toFixed(2)}\n` +
        `Your passkey and session key are active. Use /dashboard to revoke this key and enroll one with higher limits.`;
    }

    return `👤 *Hello @${payload.username}!*\n` +
      `Your passkey vault address on Solana is:\n` +
      `\`${contact}\`\n\n` +
      `💰 *Solana balances:*\n` +
      `• *SOL:* ${sol}\n` +
      `• *USDC:* ${usdc}${statusBlock}`;
  }

  private async handleDashboardCommand(payload: SocialMessagePayload): Promise<string> {
    const user = await this.resolveCurrentUser(payload);
    const dashboardLink = this.generateSignedDeepLink('/dashboard', {
      platform: payload.platform,
      userId: payload.platformId,
      username: payload.username,
    });
    const keysLink = this.generateSignedDeepLink('/keys', {
      platform: payload.platform,
      userId: payload.platformId,
      username: payload.username,
    });

    if (!user?.smartWallet) {
      const onboardLink = this.generateSignedDeepLink('/onboard', {
        platform: payload.platform,
        platformId: payload.platformId,
        username: payload.username,
      });
      return `🖥️ *VeriAgent Pay Dashboard*\n\n` +
        `Create your passkey wallet before opening the dashboard.\n\n` +
        `👉 [Create Wallet](${onboardLink})`;
    }

    const active = user.sessionKeys?.[0];
    const sessionSummary = active
      ? `✅ *Session key active*\n` +
        `• Daily safety limit: $${Number(active.dailyLimitUSD).toFixed(2)}\n` +
        `• Per-payment limit: $${Number(active.perTxLimitUSD).toFixed(2)}\n` +
        `• Expires: ${active.expiryAt.toISOString().slice(0, 10)}\n\n`
      : `⚠️ *No active session key*\nIn-chat payments will require session-key enrollment.\n\n`;

    return `🖥️ *VeriAgent Pay Dashboard*\n\n` +
      `${sessionSummary}` +
      `For your protection, new accounts start with a $100 daily session-key limit. ` +
      `To use a higher limit, open Session Keys in the dashboard, revoke the old key, and enroll a new key with the limits you choose.\n\n` +
      `👉 [Open Dashboard](${dashboardLink})\n` +
      `👉 [Manage Session Keys](${keysLink})`;
  }

  /**
   * Rejects vault addresses that cannot possibly be correct before they are
   * persisted or funded.
   *
   * Specifically catches the ethers-v6 `getAddress()` collision, whose symptom
   * is the *factory* address being returned in place of a per-user vault. That
   * failure is silent and unrecoverable once written, so it is asserted rather
   * than logged.
   */
  private assertPlausibleVaultAddress(address: string, factoryAddress: string, stage: string): void {
    if (!address || !ethers.isAddress(address)) {
      throw new Error(`Invalid vault address at ${stage}: ${address}`);
    }
    if (address === ethers.ZeroAddress) {
      throw new Error(
        `Vault address resolved to the zero address at ${stage}. ` +
          `Check PAY_VAULT_IMPLEMENTATION_ADDRESS is configured.`,
      );
    }
    if (address.toLowerCase() === factoryAddress.toLowerCase()) {
      throw new Error(
        `Vault address at ${stage} equals the factory address (${factoryAddress}). ` +
          `This indicates getAddress() was called without its explicit signature.`,
      );
    }
  }

  /**
   * Resolves the current platform user (including wallet + active session keys)
   * from a social message payload. Returns null when the user is not yet persisted.
   */
  public async resolveCurrentUser(payload: SocialMessagePayload) {
    // Delegates to the single canonical resolver.
    //
    // This previously matched `{ username }` across every platform and the
    // platformId against all four id columns, so a Discord user named "alice"
    // resolved to the Telegram user "alice" — handing them that account's
    // wallet. Identity is now strictly scoped to (platform, platformUserId).
    // The username is passed so an escrow-claim account parked under
    // `pending:<handle>` can be adopted on its owner's first contact.
    return this.identityService.resolveUser(payload.platform, payload.platformId, payload.username);
  }

  /** Fetches visible SOL and spendable USDC balances for a Solana vault. */
  private async fetchOnChainBalances(address: string): Promise<{ sol: string; usdc: string }> {
    try {
      const [lamports, atomicUsdc] = await Promise.all([
        this.solana.getVaultSolBalance(address),
        this.solana.getVaultUsdcBalance(address),
      ]);
      return {
        sol: formatSolBalance(lamports),
        usdc: (Number(atomicUsdc) / 1_000_000).toFixed(2),
      };
    } catch (e: any) {
      this.logger.warn(`Failed to fetch Solana balances for ${address}: ${e.message}`);
      return { sol: '0', usdc: '0.00' };
    }
  }

  /**
   * Concise balance view — just truncated address & on-chain balances.
   */
  private async handleBalanceCommand(payload: SocialMessagePayload): Promise<string> {
    const user = await this.resolveCurrentUser(payload);
    const contact = user?.smartWallet?.address
      ?? await this.identityService.resolveContact(payload.platform, payload.platformId);
    const { sol, usdc } = await this.fetchOnChainBalances(contact);

    return `💰 *Balances* — \`${this.truncateAddress(contact)}\`\n\n` +
      `• *SOL:* ${sol}\n` +
      `• *USDC:* ${usdc}`;
  }

  /**
   * Vaults menu — shows the real on-chain verified APY and coming soon preview.
   */
  private async handleVaultsMenu(payload: SocialMessagePayload): Promise<string> {
    let apy = 0;
    try {
      const verified = await this.vaultService.getVerifiedAPY();
      apy = verified.apy;
    } catch (e: any) {
      this.logger.warn(`Failed to fetch verified vault APY: ${e.message}`);
    }

    const vaultLink = `${getAppBaseUrl()}/vaults`;

    return `🏦 *AI Yield Vaults (Coming Soon)*\n\n` +
      `📈 *Target APY:* ${apy ? apy.toFixed(2) + '%' : '~5.8%'}\n` +
      `(Attested on-chain via Veridex zkTLS oracle)\n\n` +
      `Automated savings and cross-chain yield routing are currently in preparation.\n\n` +
      `👉 [📱 Preview Vaults in Web App](${vaultLink})`;
  }

  private async handleRequestsMenu(payload: SocialMessagePayload, tab: 'in' | 'out' = 'in', page: number = 1): Promise<string> {
    const user = await this.resolveCurrentUser(payload);
    const dashboardLink = this.generateSignedDeepLink('/requests', { platform: payload.platform, userId: payload.platformId, username: payload.username });

    if (!user) {
      return `📥 *Payment Requests Hub*\n\n` +
        `Set up your passkey wallet to send, receive, and approve payment requests.\n\n` +
        `👉 [🔐 Register Wallet](${dashboardLink})`;
    }

    const pageSize = 3;

    if (tab === 'in') {
      const incoming = await this.prisma.paymentRequest.findMany({
        where: {
          OR: [
            { recipientId: user.id },
            { recipientIdentifier: user.username || '' },
            { recipientIdentifier: { equals: user.smartWallet?.address || '', mode: 'insensitive' } },
          ],
        },
        include: { requester: true },
        orderBy: { createdAt: 'desc' },
      });

      const totalItems = incoming.length;
      const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
      const currentPage = Math.max(1, Math.min(page, totalPages));
      const pageItems = incoming.slice((currentPage - 1) * pageSize, currentPage * pageSize);

      let message = `📥 *Payment Requests Hub* — *[📥 Incoming (${totalItems})] | [📤 Outgoing]*\n\n`;

      if (pageItems.length === 0) {
        message += `You have no incoming payment requests.\n\n`;
      } else {
        for (const req of pageItems) {
          const creatorName = req.requester ? `@${req.requester.username || req.requester.telegramId}` : 'Someone';
          const link = `${getAppBaseUrl()}/requests/${req.id}`;
          const statusIcon = req.status === 'PAID' ? '✅ Paid' : (req.status === 'CANCELLED' || (req.status as string) === 'REJECTED') ? '❌ Declined' : '⏳ Pending';

          message += `📌 *From ${creatorName}*: *${req.amount} ${req.token}* (${statusIcon})\n`;
          if (req.note) message += `📝 Memo: "${req.note}"\n`;
          if (req.status === 'PENDING') {
            message += `👉 [💳 Pay Direct](${link}?action=pay) | [❌ Decline](${link}?action=decline)\n\n`;
          } else {
            message += `👉 [🌐 View Request Details](${link})\n\n`;
          }
        }

        if (totalPages > 1) {
          message += `📄 *Page Navigation (${currentPage}/${totalPages}):*\n`;
          if (currentPage > 1) message += `[⬅️ Prev](${dashboardLink}?tab=in&page=${currentPage - 1}) `;
          if (currentPage < totalPages) message += `[Next ➡️](${dashboardLink}?tab=in&page=${currentPage + 1})`;
          message += `\n\n`;
        }
      }

      message += `💡 *Quick Actions:*\n` +
        `👉 [📥 Request $25](${dashboardLink}?action=req_quick&amount=25) | [📥 Request $50](${dashboardLink}?action=req_quick&amount=50)\n` +
        `👉 [📤 View Outgoing](${dashboardLink}?tab=out) | [📱 Dashboard](${dashboardLink})`;

      return message.trim();
    } else {
      const outgoing = await this.prisma.paymentRequest.findMany({
        where: { requesterId: user.id },
        orderBy: { createdAt: 'desc' },
      });

      const totalItems = outgoing.length;
      const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
      const currentPage = Math.max(1, Math.min(page, totalPages));
      const pageItems = outgoing.slice((currentPage - 1) * pageSize, currentPage * pageSize);

      let message = `📥 *Payment Requests Hub* — *[📥 Incoming] | [📤 Outgoing (${totalItems})]*\n\n`;

      if (pageItems.length === 0) {
        message += `You have no outgoing payment requests.\n\n`;
      } else {
        for (const req of pageItems) {
          const link = `${getAppBaseUrl()}/requests/${req.id}`;
          const statusIcon = req.status === 'PAID' ? '✅ Paid' : (req.status === 'CANCELLED' || (req.status as string) === 'REJECTED') ? '❌ Declined' : '⏳ Pending';

          message += `📌 *To ${req.recipientIdentifier || 'Recipient'}*: *${req.amount} ${req.token}* (${statusIcon})\n`;
          if (req.status === 'PENDING') {
            message += `👉 [🔔 Nudge Recipient](${link}?action=nudge)\n\n`;
          }
        }

        if (totalPages > 1) {
          message += `📄 *Page Navigation (${currentPage}/${totalPages}):*\n`;
          if (currentPage > 1) message += `[⬅️ Prev](${dashboardLink}?tab=out&page=${currentPage - 1}) `;
          if (currentPage < totalPages) message += `[Next ➡️](${dashboardLink}?tab=out&page=${currentPage + 1})`;
          message += `\n\n`;
        }
      }

      message += `💡 *Quick Actions:*\n` +
        `👉 [📥 Request $25](${dashboardLink}?action=req_quick&amount=25) | [📥 Request $50](${dashboardLink}?action=req_quick&amount=50)\n` +
        `👉 [📥 View Incoming](${dashboardLink}?tab=in) | [📱 Dashboard](${dashboardLink})`;

      return message.trim();
    }
  }

  private async handleSplitsMenu(payload: SocialMessagePayload, page: number = 1): Promise<string> {
    const user = await this.resolveCurrentUser(payload);
    const dashboardLink = this.generateSignedDeepLink('/splits', { platform: payload.platform, userId: payload.platformId, username: payload.username });

    if (!user) {
      return `📊 *Bill Splits Manager*\n\n` +
        `Set up your passkey wallet to split bills with friends.\n\n` +
        `👉 [🔐 Register Wallet](${dashboardLink})`;
    }

    const splits = await this.splitsService.getUserSplits(user.id);
    const activeSplits = splits.filter((s: any) => s.status !== 'COMPLETED');

    if (activeSplits.length === 0) {
      return `📊 *Bill Splits Manager*\n\n` +
        `You have no active splits. Create one on the dashboard or type naturally.\n\n` +
        `👉 [➕ Create New Bill Split](${dashboardLink}?action=create)`;
    }

    const pageSize = 3;
    const totalPages = Math.max(1, Math.ceil(activeSplits.length / pageSize));
    const currentPage = Math.max(1, Math.min(page, totalPages));
    const pageItems = activeSplits.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    let message = `📊 *Bill Splits Manager* (Page ${currentPage}/${totalPages})\n\n`;

    for (const s of pageItems) {
      const paidCount = s.participants.filter((p: any) => p.hasPaid || p.paid).length;
      const totalCount = s.participants.length || 1;
      const progressRatio = paidCount / totalCount;
      const progressBlocks = Math.round(progressRatio * 10);
      const progressBar = '█'.repeat(progressBlocks) + '░'.repeat(10 - progressBlocks);
      const progressPercent = Math.round(progressRatio * 100);
      const link = `${getAppBaseUrl()}/splits/${s.id}`;

      message += `📌 *${s.description || 'Group Split'}*\n`;
      message += `Collection: [${progressBar}] ${progressPercent}% ($${s.amountCollected || (paidCount * s.yourShare)}/$${s.totalAmount})\n`;

      if (s.hasPaid) {
        message += `Status: ✅ *You paid your share ($${(s.yourShare || 0).toFixed(2)})*\n`;
        message += `👉 [📣 Ping Pending](${link}?action=ping)\n\n`;
      } else {
        message += `Status: 💰 *Your Share: $${(s.yourShare || 0).toFixed(2)} ${s.token || 'USDC'}* (Pending ⏳)\n`;
        message += `👉 [💳 Pay My Share](${link}?action=pay)\n\n`;
      }
    }

    if (totalPages > 1) {
      message += `📄 *Page Navigation:*\n`;
      if (currentPage > 1) message += `[⬅️ Prev](${dashboardLink}&page=${currentPage - 1}) `;
      if (currentPage < totalPages) message += `[Next ➡️](${dashboardLink}&page=${currentPage + 1})`;
      message += `\n\n`;
    }

    return message.trim();
  }

  private async handleEnvelopesMenu(payload: SocialMessagePayload, page: number = 1): Promise<string> {
    const user = await this.resolveCurrentUser(payload);
    const dashboardLink = this.generateSignedDeepLink('/envelopes', { platform: payload.platform, userId: payload.platformId, username: payload.username });

    if (!user) {
      return `🧧 *Red Envelope Portal*\n\n` +
        `Set up your passkey wallet to drop and claim lucky red envelopes.\n\n` +
        `👉 [🔐 Register Wallet](${dashboardLink})`;
    }

    const activeEnvelopes = await this.prisma.redEnvelope.findMany({
      where: { creatorId: user.id, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
    });

    const pageSize = 3;
    const totalPages = Math.max(1, Math.ceil((activeEnvelopes.length || 1) / pageSize));
    const currentPage = Math.max(1, Math.min(page, totalPages));
    const pageItems = activeEnvelopes.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    let message = `🧧 *Red Envelope Portal* (Page ${currentPage}/${totalPages})\n\n`;

    if (pageItems.length === 0) {
      message += `You have no active red envelope drops right now.\n\n`;
    } else {
      for (const env of pageItems) {
        const claimedCount = env.numRecipients - env.remainingClaims;
        const link = `${getAppBaseUrl()}/envelopes/${env.id}`;

        message += `🎁 *${env.message || 'Lucky Red Envelope Drop'}*\n`;
        message += `💰 Remaining Vault: *${env.remainingBalance.toFixed(2)} / ${env.totalAmount} ${env.token}*\n`;
        message += `📊 Claim Ratio: *${claimedCount}/${env.numRecipients} Claimed*\n`;
        message += `👉 [🎁 Claim Share](${link}?action=claim) | [🔄 Reclaim](${link}?action=cancel)\n\n`;
      }

      if (totalPages > 1) {
        message += `📄 *Page Navigation:*\n`;
        if (currentPage > 1) message += `[⬅️ Prev](${dashboardLink}&page=${currentPage - 1}) `;
        if (currentPage < totalPages) message += `[Next ➡️](${dashboardLink}&page=${currentPage + 1})`;
        message += `\n\n`;
      }
    }

    message += `💡 *Quick Red Envelope Drops:*\n` +
      `👉 [🧧 Drop $10 (5 slots)](${dashboardLink}?action=env_create&amount=10&slots=5) | [🧧 Drop $25 (5 slots)](${dashboardLink}?action=env_create&amount=25&slots=5)\n` +
      `👉 [🧧 Drop $50 (10 slots)](${dashboardLink}?action=env_create&amount=50&slots=10) | [📱 Dashboard](${dashboardLink})`;

    return message.trim();
  }

  private async handlePoolsMenu(payload: SocialMessagePayload, page: number = 1): Promise<string> {
    const user = await this.resolveCurrentUser(payload);
    const dashboardLink = this.generateSignedDeepLink('/pools', { platform: payload.platform, userId: payload.platformId, username: payload.username });

    if (!user) {
      return `👥 *Group Liquidity & Peer Credit Pools*\n\n` +
        `Set up your passkey wallet to join group pools and issue peer loans.\n\n` +
        `👉 [🔐 Register Wallet](${dashboardLink})`;
    }

    let message = `👥 *Group Liquidity & Credit Lines*\n\n`;

    try {
      const { pools, total } = await this.poolsService.findAllForUser(user.id);
      if (pools && pools.length > 0) {
        const pageSize = 3;
        const totalPages = Math.max(1, Math.ceil(total / pageSize));
        const currentPage = Math.max(1, Math.min(page, totalPages));
        const pageItems = pools.slice((currentPage - 1) * pageSize, currentPage * pageSize);

        message += `*Your Active Group Pools (${total}):*\n\n`;

        for (const p of pageItems) {
          const link = `${getAppBaseUrl()}/pools/${p.id}`;
          const activeLoanRequests = p.loans?.filter((l: any) => l.status === 'PENDING') || [];

          message += `🏦 *${p.name}*\n`;
          message += `💰 Vault TVL: *${p.poolBalance ?? 0} ${p.token || 'USDC'}* | Members: *${p.members?.length || 1}*\n`;

          if (activeLoanRequests.length > 0) {
            const loan = activeLoanRequests[0];
            const borrowerName = (loan as any).borrowerHandle || (loan as any).borrower?.username || 'Member';
            message += `⚠️ *Credit Request:* ${borrowerName} requested *${loan.amount} ${p.token || 'USDC'}*\n`;
            message += `👉 [✅ Approve](${link}?loan=${loan.id}&vote=yes) | [❌ Reject](${link}?loan=${loan.id}&vote=no)\n`;
          }

          message += `👉 [💰 Deposit](${link}?action=deposit) | [📥 Request](${link}?action=request) | [📱 Dashboard](${link})\n\n`;
        }

        if (totalPages > 1) {
          message += `📄 *Page ${currentPage}/${totalPages}*\n`;
          if (currentPage > 1) message += `[⬅️ Prev](${dashboardLink}&page=${currentPage - 1}) `;
          if (currentPage < totalPages) message += `[Next ➡️](${dashboardLink}&page=${currentPage + 1})`;
          message += `\n\n`;
        }
      } else {
        message += `You have no active group pools yet.\n\n`;
      }
    } catch (e: any) {
      this.logger.warn(`Failed to load pools for ${user.id}: ${e.message}`);
    }

    const createLink = `${getAppBaseUrl()}/pools?action=create`;
    message += `💡 *Actions:*\n`;
    message += `👉 [➕ Create New Pool](${createLink})\n`;

    return message.trim();
  }


  private async handlePoolInviteAction(payload: SocialMessagePayload, intent: ParsedIntent): Promise<string> {
    const user = await this.resolveCurrentUser(payload);
    if (!user) {
      const registerLink = this.generateSignedDeepLink('/onboard', { platform: payload.platform, platformId: payload.platformId, username: payload.username });
      return `⚠️ *Wallet Required*\n\nYou need a passkey wallet to invite members to pools.\n\n👉 [🔐 Register Wallet](${registerLink})`;
    }

    if (!intent.poolId || !intent.members || intent.members.length === 0) {
      return `❌ *Invalid Invite Command*\n\n` +
        `Usage: \`/pool invite <poolId> @user1,@user2,@user3\`\n\n` +
        `Example: \`/pool invite abc123 @alice,@bob,user@example.com\``;
    }

    try {
      const result = await this.poolsService.inviteMembers(intent.poolId, user.id, intent.members);

      return `✅ *Pool Invitations Sent!*\n\n` +
        `Invited *${result.invitedCount}* member(s) to the pool.\n\n` +
        `📎 *Share Link:*\n${result.inviteLink}\n\n` +
        `Invited members will receive notifications across all their connected platforms.`;
    } catch (e: any) {
      this.logger.error(`Pool invite failed: ${e.message}`);
      return `❌ *Invite Failed*\n\n${toUserMessage(e, 'The invite could not be sent.')}\n\nUse \`/pools\` to view your pools and get the correct pool ID.`;
    }
  }

  private async handlePoolJoinAction(payload: SocialMessagePayload, intent: ParsedIntent): Promise<string> {
    const user = await this.resolveCurrentUser(payload);
    if (!user) {
      const registerLink = this.generateSignedDeepLink('/onboard', { platform: payload.platform, platformId: payload.platformId, username: payload.username });
      return `⚠️ *Wallet Required*\n\nYou need a passkey wallet to join pools.\n\n👉 [🔐 Register Wallet](${registerLink})`;
    }

    if (!intent.poolId) {
      return `❌ *Invalid Join Command*\n\n` +
        `Usage: \`/pool join <poolId>\`\n\n` +
        `Example: \`/pool join abc123\`\n\n` +
        `Get the pool ID from the invite link or use \`/pools\` to view available pools.`;
    }

    try {
      const result = await this.poolsService.joinPool(intent.poolId, user.id);
      const poolLink = `${getAppBaseUrl()}/pools/${intent.poolId}`;

      return `✅ *${result.message}*\n\n` +
        `You're now a member! You can:\n` +
        `• Deposit funds to the pool\n` +
        `• Request credit from the pool\n` +
        `• Vote on peer loan requests\n\n` +
        `👉 [💰 Deposit](${poolLink}?action=deposit) | [📥 Request](${poolLink}?action=request) | [📱 Dashboard](${poolLink})`;
    } catch (e: any) {
      this.logger.error(`Pool join failed: ${e.message}`);
      return `❌ *Join Failed*\n\n${toUserMessage(e, 'You could not be added to that pool.')}`;
    }
  }

  private async handlePoolDepositAction(payload: SocialMessagePayload, intent: ParsedIntent): Promise<string> {
    const user = await this.resolveCurrentUser(payload);
    if (!user) {
      const registerLink = this.generateSignedDeepLink('/onboard', { platform: payload.platform, platformId: payload.platformId, username: payload.username });
      return `⚠️ *Wallet Required*\n\nYou need a passkey wallet to deposit to pools.\n\n👉 [🔐 Register Wallet](${registerLink})`;
    }

    if (!intent.poolId || !intent.amount || intent.amount <= 0) {
      return `❌ *Invalid Deposit Command*\n\n` +
        `Usage: \`/pool deposit <poolId> <amount> [token]\`\n\n` +
        `Example: \`/pool deposit abc123 100 USDC\``;
    }

    try {
      const result = await this.poolsService.deposit(intent.poolId, user.id, intent.amount);
      const poolLink = `${getAppBaseUrl()}/pools/${intent.poolId}`;

      return `✅ *Deposit Successful!*\n\n` +
        `Deposited *${intent.amount} ${intent.tokenSymbol || 'USDC'}* to the pool.\n` +
        `Transaction: \`${result.txHash}\`\n\n` +
        `👉 [📱 View Pool](${poolLink})`;
    } catch (e: any) {
      this.logger.error(`Pool deposit failed: ${e.message}`);
      return `❌ *Deposit Failed*\n\n${toUserMessage(e, 'The deposit could not be completed. No funds have left your wallet.')}\n\nMake sure you have sufficient balance and an active session key.`;
    }
  }

  private async handlePoolRequestAction(payload: SocialMessagePayload, intent: ParsedIntent): Promise<string> {
    const user = await this.resolveCurrentUser(payload);
    if (!user) {
      const registerLink = this.generateSignedDeepLink('/onboard', { platform: payload.platform, platformId: payload.platformId, username: payload.username });
      return `⚠️ *Wallet Required*\n\nYou need a passkey wallet to request loans.\n\n👉 [🔐 Register Wallet](${registerLink})`;
    }

    if (!intent.poolId || !intent.amount || intent.amount <= 0) {
      return `❌ *Invalid Request Command*\n\n` +
        `Usage: \`/pool request <poolId> <amount> [purpose]\`\n\n` +
        `Example: \`/pool request abc123 500 Business expansion\``;
    }

    try {
      const result = await this.poolsService.requestLoan(intent.poolId, user.id, {
        amount: intent.amount,
        purpose: intent.memo,
        durationDays: 30, // Default 30 days
      });
      const poolLink = `${getAppBaseUrl()}/pools/${intent.poolId}`;

      // Same disclosure as the web form, for the same reason: the origination
      // fee is taken on disbursement, so the amount that arrives is smaller
      // than the amount owed. `result.token` rather than a hardcoded "USDC" —
      // this pool may well be USDT.
      const fee = result.originationFee ?? 0;
      const token = result.token ?? 'USDC';
      const feePct = (result.loanTerms?.originationFeeBps ?? 250) / 100;

      return `✅ *Loan Request Submitted!*\n\n` +
        `Requested *${intent.amount} ${token}* from the pool.\n` +
        `Purpose: ${intent.memo || 'Not specified'}\n\n` +
        `💵 You receive *${result.amountReceived?.toFixed(2) ?? intent.amount} ${token}* ` +
        `after the ${feePct}% origination fee (−${fee.toFixed(2)} ${token}).\n` +
        `You repay the full *${intent.amount} ${token}*.\n\n` +
        `Your request is now pending member votes.\n` +
        `👉 [📱 View Status](${poolLink})`;
    } catch (e: any) {
      this.logger.error(`Pool loan request failed: ${e.message}`);
      return `❌ *Request Failed*\n\n${toUserMessage(e, 'The loan request could not be created.')}`;
    }
  }

  private async handleUnifiedMenu(payload: SocialMessagePayload): Promise<string> {
    const user = await this.resolveCurrentUser(payload);
    const dashboardLink = this.generateSignedDeepLink('/', { platform: payload.platform, userId: payload.platformId, username: payload.username });

    if (!user) {
      return `📱 *VeriAgent Pay — Interactive Hub*\n\n` +
        `Set up your passkey wallet to manage payments, splits, envelopes, and group pools natively in chat.\n\n` +
        `👉 [🔐 Register Wallet & Create Session Key](${dashboardLink})`;
    }

    const address = user.smartWallet?.address ? this.truncateAddress(user.smartWallet.address) : 'Pending Setup';

    return `📱 *VeriAgent Pay — Native Interactive Hub*\n\n` +
      `👤 *User:* @${user.username || user.telegramId || 'Member'}\n` +
      `💳 *Smart Wallet:* \`${address}\`\n\n` +
      `*Select a Feature Hub:* \n` +
      `• \`/balance\` — View token balances & quick send\n` +
      `• \`/requests\` — Pending Request Hub (Pay / Decline / Nudge)\n` +
      `• \`/splits\` — Group Split Manager (Pay Share / Ping Unpaid)\n` +
      `• \`/envelopes\` — Red Envelope Lucky Drops (Claim / Reclaim)\n` +
      `• \`/pools\` — Group Pools & Credit Lines (Vote / Request Loans)\n` +
      `• \`/history\` — On-Chain Activity Audit Trail`;
  }

  private async handleSubscriptionsMenu(payload: SocialMessagePayload): Promise<string> {
    const user = await this.resolveCurrentUser(payload);
    const dashboardLink = this.generateSignedDeepLink('/subscriptions', { platform: payload.platform, userId: payload.platformId, username: payload.username });

    let message = `🔁 *Recurring Subscriptions*\n\n`;

    if (user) {
      const subs = await this.prisma.subscription.findMany({
        where: {
          subscriberId: user.id,
          isActive: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      });

      if (subs.length > 0) {
        message += `*Your Active Subscriptions (${subs.length}):*\n\n`;
        for (const s of subs) {
          const link = `${getAppBaseUrl()}/subscriptions`;
          message += `• *To ${s.recipientHandle}*: *${s.amountUSD} USDC* / every ${s.intervalDays} days\n`;
          message += `  📅 Next: ${s.nextPaymentAt.toISOString().split('T')[0]}\n`;
          message += `  👉 [⚙️ Manage / Cancel](${link})\n\n`;
        }
      } else {
        message += `You have no active recurring subscriptions.\n\n` +
          `💡 *Usage:* Send \`/subscribe 50 USDC @landlord 30\` for automated 30-day recurring payments.\n\n`;
      }
    }

    message += `👉 [🖥️ Manage Subscriptions](${dashboardLink})`;
    return message;
  }

  private async handlePayAction(payload: SocialMessagePayload, intent: ParsedIntent): Promise<string> {
    if (!intent.amount || !Number.isFinite(intent.amount) || intent.amount <= 0 || !intent.recipient) {
      return `💸 *Send on Solana*\n\nUsage: \`/pay 50 USDC @alice\` or \`/pay 1 SOL @alice\``;
    }

    const tokenSymbol = (intent.tokenSymbol || intent.tokenInfo?.symbol || 'USDC').toUpperCase();
    if (tokenSymbol !== 'USDC' && tokenSymbol !== 'SOL') {
      return `⚠️ Supported Solana assets are *USDC* and *SOL*.`;
    }

    const sender = await this.resolveCurrentUser(payload);
    const onboardLink = this.generateSignedDeepLink('/onboard', {
      platform: payload.platform,
      platformId: payload.platformId,
      username: payload.username,
    });
    const keysLink = this.generateSignedDeepLink('/keys', {
      platform: payload.platform,
      userId: payload.platformId,
      username: payload.username,
      mint: 'true',
    });

    if (!sender?.smartWallet) {
      return `⚠️ *Payment Setup Required*\n\nCreate your Solana passkey vault first.\n\n👉 [Create Passkey Vault](${onboardLink})`;
    }

    const activeSession = sender.sessionKeys?.[0];
    if (!activeSession && tokenSymbol === 'USDC') {
      return `⚠️ *Session Key Required*\n\nAuthorize a bounded Solana session before sending from chat.\n\n👉 [Authorize Session Key](${keysLink})`;
    }

    if (tokenSymbol === 'SOL') {
      const approval = this.paymentEscalation.buildPrompt({
        to: intent.recipient.trim(),
        token: 'SOL',
        amount: intent.amount,
        note: intent.memo,
        reason: 'biometrics_required',
      });
      return `🔐 *Passkey Approval Required*\n\n` +
        `Native SOL transfers always require your passkey. Open the app to approve ${intent.amount} SOL to ${intent.recipient}.\n\n` +
        `👉 [Review SOL Payment](${approval.link})`;
    }

    const recipientInput = intent.recipient.trim();
    let recipientAddress = isSolanaAddress(recipientInput) ? recipientInput : null;
    let recipientUser: any = null;
    if (recipientAddress) {
      recipientUser = await this.prisma.user.findFirst({
        where: { smartWallet: { address: recipientAddress } },
      });
    } else {
      recipientUser = await this.identityService.resolveUserByHandle(recipientInput);
      recipientAddress = recipientUser?.smartWallet?.address || null;
    }

    if (!recipientAddress) {
      if (sender.requireBiometricsAlways || intent.amount > Number(activeSession!.perTxLimitUSD)) {
        return `🔐 *Session Limit Approval Required*\n\n` +
          `Creating a ${intent.amount} USDC payment link exceeds your current chat-payment policy.\n\n` +
          `👉 [Review Session Limits](${keysLink})`;
      }

      try {
        const result = await this.escrowService.createClaimLink({
          senderUserId: sender.id,
          senderVaultAddress: sender.smartWallet.address,
          platform: payload.platform,
          recipientHandle: recipientInput,
          amount: intent.amount,
          token: 'USDC',
          fromUser: payload.username,
        });
        const shareText = `I sent you ${intent.amount} USDC on Solana. Claim it with a passkey:`;
        const shareLink = `https://t.me/share/url?url=${encodeURIComponent(result.shortUrl)}&text=${encodeURIComponent(shareText)}`;
        return `💸 *Native Solana Payment Link Created!*\n\n` +
          `👤 *To:* ${recipientInput}\n` +
          `💰 *Amount:* ${intent.amount} USDC\n` +
          `⚡ *Status:* Escrowed on Solana Devnet\n` +
          `🔗 *Transaction:* \`${result.txHash}\`\n\n` +
          `👉 [Claim Payment](${result.shortUrl})\n` +
          `📤 [Send Link to ${recipientInput}](${shareLink})`;
      } catch (error: any) {
        const reference = errorReference();
        this.logger.error(
          `[${reference}] Native Solana payment-link creation failed for ${recipientInput}: ${describeForLog(error)}`,
          error?.stack,
        );
        return `⚠️ *Payment Link Failed*\n\n` +
          `${toUserMessage(error, 'The USDC could not be escrowed on Solana. No funds were moved.')}\n\n` +
          `Reference: \`${reference}\``;
      }
    }

    if (sender.requireBiometricsAlways || intent.amount > Number(activeSession!.perTxLimitUSD)) {
      const paymentLink = this.generateSignedDeepLink('/send', {
        to: recipientAddress,
        amount: intent.amount,
        token: 'USDC',
      });
      return `🔐 *Passkey Approval Required*\n\nOpen the app to approve ${intent.amount} USDC on Solana.\n\n` +
        `👉 [Review Payment](${paymentLink})`;
    }

    try {
      const decryptedKey = await this.relayerService.decryptSessionKey(activeSession!);
      const result = await (this.relayerService as unknown as SolanaRelayerService).executeSessionTransfer({
        userId: sender.id,
        vaultAddress: sender.smartWallet.address,
        recipientAddress,
        encryptedSessionKey: decryptedKey,
        txAmountUSD: intent.amount,
      });

      await this.activityService.record({
        userIdentifier: sender.id,
        action: 'TRANSFER_SENT',
        amount: intent.amount,
        token: 'USDC',
        txHash: result.txHash,
        metadata: {
          recipient: recipientInput,
          to: recipientAddress,
          platform: payload.platform,
          source: 'chat',
        },
      });
      await this.contactsService.upsertAfterPayment(
        sender.id,
        payload.platform,
        recipientInput.replace(/^@/, ''),
        recipientAddress,
        recipientUser?.username,
      );

      const recipientPlatformId = recipientUser?.telegramId;
      if (payload.platform === 'telegram' && recipientPlatformId && /^\d+$/.test(recipientPlatformId)) {
        await this.sendDirectMessage(
          'telegram',
          recipientPlatformId,
          `🔔 *Payment Received*\n\nYou received *${intent.amount} USDC* on Solana.\n\n` +
            `Signature: \`${result.txHash}\``,
        );
      }

      const cluster = process.env.SOLANA_CLUSTER || 'devnet';
      const explorer = process.env.SOLANA_EXPLORER_URL || 'https://explorer.solana.com';
      return `💸 *Payment Sent on Solana*\n\n` +
        `👤 *To:* ${recipientInput} (${this.truncateAddress(recipientAddress)})\n` +
        `💰 *Amount:* ${intent.amount} USDC\n` +
        `🔗 [View transaction](${explorer}/tx/${result.txHash}?cluster=${encodeURIComponent(cluster)})`;
    } catch (err: any) {
      if (
        err.code === 'SESSION_EXPIRED' ||
        err.message?.toLowerCase().includes('session') ||
        err.message?.toLowerCase().includes('limit')
      ) {
        return `🔐 *Passkey Approval Required*\n\n` +
          `${toUserMessage(err, 'Your Solana session needs authorization.')}\n\n` +
          `👉 [Authorize Session Key](${keysLink})`;
      }
      return `⚠️ *Payment Failed*\n\n` +
        toUserMessage(err, 'The Solana USDC transfer could not be completed. No funds moved.');
    }
  }

  /** Legacy EVM implementation retained temporarily for migration reference. */
  private async handleLegacyPayAction(payload: SocialMessagePayload, intent: ParsedIntent): Promise<string> {
    // No amount provided — show quick-start with contact suggestions
    if (!intent.amount || !Number.isFinite(intent.amount) || intent.amount <= 0 || intent.amount > 1_000_000) {
      const user = await this.resolveCurrentUser(payload);
      if (user) {
        const suggestions = await this.contactsService.getPaySuggestions(user.id, 5);
        if (suggestions.length > 0) {
          let suggestionsBlock = `👥 *Recent contacts:*\n`;
          suggestions.forEach((s, i) => {
            const recency = s.lastSentAt ? ` • ${this.formatRelativeDate(s.lastSentAt)}` : '';
            suggestionsBlock += `${i + 1}. @${s.identifier}${recency}\n`;
          });
          return `💸 *Send Money*\n\n${suggestionsBlock}\n` +
            `Type: \`/pay <amount> <token> @recipient\`\n` +
            `Or naturally: "send 50 USDC to @${suggestions[0].identifier}"`;
        }
      }
      return `💸 *Send Money*\n\nUsage: \`/pay 50 USDC @alice\`\nOr type naturally: "send 50 USDC to @alice"`;
    }

    // Amount provided but no recipient — show contact suggestions
    if (!intent.recipient) {
      const user = await this.resolveCurrentUser(payload);
      if (user) {
        const suggestions = await this.contactsService.getPaySuggestions(user.id, 5);
        if (suggestions.length > 0) {
          let suggestionsBlock = `👥 *Who would you like to send to?*\n`;
          suggestions.forEach((s, i) => {
            const recency = s.lastSentAt ? ` • ${this.formatRelativeDate(s.lastSentAt)}` : '';
            suggestionsBlock += `${i + 1}. @${s.identifier}${recency}\n`;
          });
          return `${suggestionsBlock}\n` +
            `💡 Type: /pay ${intent.amount} ${intent.tokenSymbol || 'USDC'} @${suggestions[0].identifier}`;
        }
      }
      return `Who should I send ${intent.amount} ${intent.tokenSymbol || 'USDC'} to?\n\n` +
        `Usage: \`/pay ${intent.amount} ${intent.tokenSymbol || 'USDC'} @recipient\``;
    }
    const token = intent.tokenInfo || SUPPORTED_TOKENS.USDC;
    if (!token || !token.address || token.address === ethers.ZeroAddress) {
      return `⚠️ Unsupported token. Supported: USDC, USDT, BOT`;
    }
    const cleanSender = payload.username.startsWith('@') ? payload.username.slice(1) : payload.username;

    // Find sender user record
    const senderUser = await this.prisma.user.findFirst({
      where: {
        OR: [
          { telegramId: payload.platformId },
          { whatsappId: payload.platformId },
          { slackId: payload.platformId },
          { discordId: payload.platformId },
          { username: cleanSender },
        ]
      },
      select: {
        id: true,
        username: true,
        requireBiometricsAlways: true,
        smartWallet: true,
        sessionKeys: {
          where: {
            expiryAt: { gte: new Date() },
            revokedAt: null,
            activatedAt: { not: null },
          },
          orderBy: { createdAt: 'desc' },
        }
      }
    });

    const onboardLink = this.generateSignedDeepLink('/onboard', { platform: payload.platform, platformId: payload.platformId, username: payload.username });
    const keysLink = this.generateSignedDeepLink('/keys', { platform: payload.platform, userId: payload.platformId, username: payload.username, mint: 'true' });

    if (!senderUser || !senderUser.smartWallet) {
      return `⚠️ *Payment Setup Required*\n\n` +
        `You do not have a registered passkey wallet yet. To send funds directly from chat, please set up your hardware biometric passkey.\n\n` +
        `👉 [🚀 Register Passkey & Create Wallet](${onboardLink})`;
    }

    if (!senderUser.sessionKeys || senderUser.sessionKeys.length === 0) {
      return `⚠️ *Session Key Required*\n\n` +
        `You have a registered passkey wallet but no active fast-path session key. Session keys let you send payments instantly without biometric prompts!\n\n` +
        `👉 [⚡ Authorize Session Key](${keysLink})`;
    }

    // Check if user requires biometric auth for all transactions
    if (senderUser.requireBiometricsAlways) {
      const paymentLink = this.generateSignedDeepLink('/pay', {
        to: intent.recipient,
        amount: intent.amount,
        token: token.symbol
      });
      return `🔐 *Biometric Auth Required*\n\n` +
        `Your security settings require biometric authentication for all payments.\n\n` +
        `👉 [Open App to Pay](${paymentLink})`;
    }

    // Check session key limits before attempting transfer
    const activeSession = senderUser.sessionKeys[0];
    const txAmountUSD = intent.amount; // Assume 1:1 for stablecoins

    if (txAmountUSD > Number(activeSession.perTxLimitUSD)) {
      const paymentLink = this.generateSignedDeepLink('/pay', {
        to: intent.recipient,
        amount: intent.amount,
        token: token.symbol
      });
      return `⚠️ *Amount Exceeds Session Limit*\n\n` +
        `This payment ($${txAmountUSD}) exceeds your per-transaction limit ($${activeSession.perTxLimitUSD}).\n\n` +
        `👉 [Open App for Biometric Auth](${paymentLink})`;
    }

    // Lookup recipient to see if they are registered
    const recipientNode = await this.identityService.findSocialNodeByHandle(payload.platform, intent.recipient);
    let recipientUser = null;
    if (recipientNode) {
      recipientUser = await this.prisma.user.findUnique({
        where: { id: recipientNode.userId },
        include: { smartWallet: true },
      });
    }

    const isRegistered = !!(recipientUser?.smartWallet?.address);

    // --- Branch 1: Registered Recipient (Instant Send) ---
    if (isRegistered && recipientUser?.smartWallet?.address) {
      try {
        const activeSession = senderUser.sessionKeys[0];
        const decryptedKey = await this.relayerService.decryptSessionKey(activeSession);
        const sessionWallet = new ethers.Wallet(decryptedKey);
        const sessionKeyHash = ethers.keccak256(ethers.solidityPacked(['address'], [sessionWallet.address]));

        const provider = createBotChainProvider();
        const relayerSigner = createRelayerSigner(provider);

        // Step 1: Ensure sender's smart wallet is deployed on-chain
        let vaultAddress = senderUser.smartWallet.address;
        const senderCode = await provider.getCode(vaultAddress);

        if (senderCode === '0x' || senderCode === '0x0') {
          this.logger.log(`[DirectPay] Sender vault ${vaultAddress} not deployed. Deploying via factory...`);

          const senderWallet = await this.prisma.smartWallet.findUnique({
            where: { userId: senderUser.id },
          });
          if (!senderWallet) throw new Error('Sender smart wallet record not found');

          const ownerKeyHash = ethers.keccak256(
            ethers.AbiCoder.defaultAbiCoder().encode(
              ['uint256', 'uint256'],
              [BigInt(senderWallet.publicKeyX), BigInt(senderWallet.publicKeyY)]
            )
          );

          const factoryAddress = process.env.PAY_VAULT_FACTORY_ADDRESS || process.env.FACTORY_CONTRACT_ADDRESS || '';
          if (!factoryAddress) throw new Error('PAY_VAULT_FACTORY_ADDRESS not configured');

          const factoryAbi = [
            'function createVault(bytes32 ownerKeyHash, address owner) returns (address vault)',
            'function getAddress(bytes32 ownerKeyHash, address owner) view returns (address)',
            'function getVaultForOwner(bytes32 ownerKeyHash) view returns (address)',
            'event VaultCreated(address indexed vault, bytes32 indexed ownerKeyHash, address indexed owner)',
          ];
          const factoryContract = new ethers.Contract(factoryAddress, factoryAbi, relayerSigner);

          // Predict the deploy address.
          //
          // The signature must be given explicitly: `getAddress` collides with
          // ethers v6's built-in `Contract.getAddress()`, which returns the
          // contract's *own* address and ignores arguments. Calling it bare
          // silently yielded the factory address for every user.
          const predictedAddress: string = await factoryContract['getAddress(bytes32,address)'](
            ownerKeyHash,
            await relayerSigner.getAddress(),
          );
          this.assertPlausibleVaultAddress(predictedAddress, factoryAddress, 'prediction');
          this.logger.log(`[DirectPay] Factory predicted vault address: ${predictedAddress}`);

          const deployTx = await factoryContract.createVault(ownerKeyHash, await relayerSigner.getAddress());
          const deployReceipt = await deployTx.wait();

          if (deployReceipt.status !== 1) throw new Error('Vault deployment transaction reverted');

          // Extract actual vault address from VaultCreated event
          const vaultCreatedEvent = deployReceipt.logs.find(
            (log: any) => log.topics[0] === ethers.id('VaultCreated(address,bytes32,address)')
          );

          let deployedVaultAddress: string;
          if (vaultCreatedEvent) {
            deployedVaultAddress = ethers.getAddress('0x' + vaultCreatedEvent.topics[1].slice(-40));
          } else {
            // Fall back to authoritative on-chain state before trusting the
            // local prediction — the factory records every vault it deploys.
            this.logger.warn('[DirectPay] VaultCreated event not found in tx logs; reading factory state.');
            const recorded: string = await factoryContract.getVaultForOwner(ownerKeyHash);
            deployedVaultAddress =
              recorded && recorded !== ethers.ZeroAddress ? ethers.getAddress(recorded) : predictedAddress;
          }

          // A wrong address here is unrecoverable: it is persisted as the
          // user's wallet and every future deposit would be sent to it.
          this.assertPlausibleVaultAddress(deployedVaultAddress, factoryAddress, 'deployment');
          if (deployedVaultAddress.toLowerCase() !== predictedAddress.toLowerCase()) {
            throw new Error(
              `Vault address mismatch: predicted ${predictedAddress}, resolved ${deployedVaultAddress}. ` +
                `Refusing to persist — CREATE2 derivation and factory disagree.`,
            );
          }

          this.logger.log(`[DirectPay] Vault deployed at ${deployedVaultAddress}. Tx: ${deployTx.hash}`);

          // Verify bytecode exists at deployed address (retry up to 3 times for RPC sync)
          let postDeployCode = '0x';
          for (let attempt = 0; attempt < 3; attempt++) {
            postDeployCode = await provider.getCode(deployedVaultAddress);
            if (postDeployCode !== '0x' && postDeployCode !== '0x0') {
              break; // Bytecode found!
            }
            if (attempt < 2) {
              this.logger.warn(`[DirectPay] Bytecode not yet available at ${deployedVaultAddress}, retrying in 1s... (attempt ${attempt + 1}/3)`);
              await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
            }
          }

          if (postDeployCode === '0x' || postDeployCode === '0x0') {
            throw new Error(`Vault deployment failed — no bytecode at ${deployedVaultAddress} after ${deployTx.hash}`);
          }

          this.logger.log(`[DirectPay] Vault bytecode verified at ${deployedVaultAddress} (${postDeployCode.length} bytes)`);

          // Update DB with the actual on-chain address
          vaultAddress = deployedVaultAddress;
          await this.prisma.smartWallet.update({
            where: { userId: senderUser.id },
            data: { isDeployed: true, address: deployedVaultAddress },
          });

        }

        // The session registry and the session grant are no longer configured
        // here. Both are `CONFIG 10` and `ACTION_EXECUTE`, which the vault
        // refuses from the relayer — the grant is authorized by the user's
        // passkey instead. This code could only ever revert, and it reverted
        // *before* the payment, turning "your session needs activating" into a
        // failed payment with a chain error attached. The relayer verifies the
        // grant exists and refuses early; activation happens in
        // PasskeyExecutionService.prepareSessionGrant.

        let nonce = 0;
        try {
          const vaultAbi = ['function localSessionNonces(bytes32 sessionKeyHash) view returns (uint256)'];
          const vaultContract = new ethers.Contract(vaultAddress, vaultAbi, provider);
          const nonceVal = await vaultContract.localSessionNonces(sessionKeyHash);
          nonce = Number(nonceVal);
        } catch (err) {
          nonce = 0;
        }

        // Step 3: Build ACTION_TRANSFER payload
        const tokenBytes = ethers.zeroPadValue(token.address, 32);
        const recipientBytes = ethers.zeroPadValue(recipientUser.smartWallet.address, 32);
        const amountWei = ethers.parseUnits(intent.amount.toString(), token.decimals);
        const amountBytes = ethers.zeroPadValue(ethers.toBeHex(amountWei), 32);
        const typeByte = Buffer.from([1]); // ACTION_TRANSFER = 1

        const actionPayload = ethers.hexlify(ethers.concat([
          typeByte,
          tokenBytes,
          recipientBytes,
          amountBytes
        ]));

        this.logger.log(
          `[DirectPay] Executing transfer: ${intent.amount} ${token.symbol} ` +
          `from ${vaultAddress} to ${recipientUser.smartWallet.address} ` +
          `(token: ${token.address}, nonce: ${nonce})`
        );

        // Step 4: Execute via relayer.
        //
        // A payment above the session-key allowance is the expected path for
        // anything large, not a failure. Rather than reporting an error — or
        // worse, telling the user to revoke and re-enrol their session key with
        // higher limits — hand back a signed link that opens the app with this
        // payment filled in, for a one-tap passkey approval. Their limits are
        // untouched.
        let relayerResult: any;
        try {
          relayerResult = await this.relayerService.executeLocalSessionAction(
            senderUser.id,
            vaultAddress,
            decryptedKey,
            actionPayload,
            intent.amount,
            nonce
          );
        } catch (execErr: any) {
          const reason = this.paymentEscalation.classify(execErr);
          if (reason) {
            this.logger.log(
              `[DirectPay] Escalating to passkey (${reason}) for ${senderUser.id.slice(0, 8)}…`
            );
            return this.paymentEscalation.buildPrompt({
              to: intent.recipient,
              token: token.symbol,
              amount: intent.amount,
              reason,
            }).message;
          }
          throw execErr;
        }

        if (relayerResult && relayerResult.success && relayerResult.txHash) {
          const txHash = relayerResult.txHash;

          // Step 5: Verify the transaction receipt and Transfer event
          const txReceipt = await Promise.race([
            provider.getTransactionReceipt(txHash),
            new Promise<null>((_, reject) => setTimeout(() => reject(new Error('Receipt fetch timeout')), 30000))
          ]);
          if (!txReceipt || txReceipt.logs.length === 0) {
            this.logger.error(`[DirectPay] Transaction ${txHash} succeeded but has NO event logs — transfer did not execute on-chain.`);
            throw new Error('Transfer transaction produced no event logs — on-chain execution failed silently');
          }

          // Validate the ERC20 Transfer event matches expected amount
          const transferEventSig = ethers.id('Transfer(address,address,uint256)');
          const transferLog = txReceipt.logs.find(log => log.topics[0] === transferEventSig);
          if (transferLog) {
            const decodedAmount = BigInt(transferLog.data);
            if (decodedAmount !== amountWei) {
              this.logger.error(`[DirectPay] Transfer amount mismatch: expected ${amountWei}, got ${decodedAmount}`);
              throw new Error('Transfer amount mismatch on-chain');
            }
          }

          this.logger.log(`[DirectPay] Transfer confirmed on-chain with ${txReceipt.logs.length} event logs. Tx: ${txHash}`);

          // Record activity for both sender and recipient
          await this.activityService.record({
            userIdentifier: senderUser.id,
            action: 'TRANSFER_SENT',
            amount: intent.amount,
            token: token.symbol,
            txHash,
            metadata: {
              recipient: intent.recipient,
              to: recipientUser.smartWallet.address,
              platform: payload.platform,
              source: 'chat',
            },
          });

          // Growth milestones — never allowed to fail a settled payment.
          this.funnelEvents
            .trackWalletActivated(senderUser.id, 'send', { txHash, amount: intent.amount })
            .catch(() => undefined);
          this.referralService
            .markFirstSend(senderUser.id, intent.amount)
            .catch((err) => this.logger.warn(`markFirstSend failed: ${err.message}`));
          this.activityService.record({
            userIdentifier: recipientUser.id,
            action: 'TRANSFER_RECEIVED',
            amount: intent.amount,
            token: token.symbol,
            txHash,
            metadata: { sender: cleanSender, from: vaultAddress },
          }).catch(() => {});

          // Auto-add recipient to contacts
          await this.contactsService.upsertAfterPayment(
            senderUser.id,
            payload.platform,
            intent.recipient!,
            recipientUser.smartWallet.address,
            recipientUser.username || intent.recipient,
          );

          // Auto-add sender to recipient's contacts (bidirectional)
          if (recipientUser.id) {
            this.contactsService.upsertAfterPayment(
              recipientUser.id,
              payload.platform,
              cleanSender,
              senderUser.smartWallet!.address,
              senderUser.username || cleanSender,
            ).catch(() => {});
          }

          // Notify Recipient
          const recipientPlatformId = recipientUser.telegramId || recipientNode?.platformUserId;
          if (recipientPlatformId && /^\d+$/.test(recipientPlatformId)) {
            const recipientMsg = `🔔 *Payment Received!*\n\n` +
              `👤 *@${cleanSender}* sent you *${intent.amount} ${token.symbol}*.\n` +
              `⚡ *It has been deposited directly into your smart wallet!*\n` +
              `Tx Hash: \`${txHash}\``;
            await this.sendDirectMessage(payload.platform, recipientPlatformId, recipientMsg);
          }

          // Return Sender Confirmation
          return `💸 *Payment Sent Instantly!* (Direct Transfer ✅)\n\n` +
            `👤 *To:* ${intent.recipient} (${this.truncateAddress(recipientUser.smartWallet.address)})\n` +
            `💰 *Amount:* ${intent.amount} ${token.symbol} ${token.icon}\n` +
            `⚡ *Status:* Transferred & Cleared On-Chain\n` +
            `🔗 *Tx Hash:* \`${txHash}\`\n\n` +
            `✅ *Notification sent directly to recipient!*`;
        }
      } catch (err: any) {
        this.logger.error(`Failed to execute direct on-chain pay: ${err.message}`, err.stack);
        if (err.code === 'SESSION_EXPIRED' || err.code === 'SESSION_KEY_REQUIRED' || err.message?.includes('expired') || err.message?.includes('revoked')) {
          // 🔑 Add mint=true parameter to trigger automatic session key creation
          const registerLink = this.generateSignedDeepLink('/keys', {
            platform: payload.platform,
            userId: payload.platformId,
            username: payload.username,
            mint: 'true' // ⚡ Triggers automatic passkey prompt + session key creation
          });
          return `🔑 *Session Key Expired or Invalid*\n\n` +
            `Your fast-path session key has expired or is invalid. To execute transactions from chat, please re-authorize with your Passkey.\n\n` +
            `👉 [⚡ Re-Authorize Session Key](${registerLink})\n\n` +
            `_Tap the link above and authenticate with Face ID/Touch ID to instantly create a new session key._`;
        }
        // Only fall back to escrow if the on-chain session nonce was NOT consumed.
        // If the relayer already submitted and incremented the nonce, retrying via escrow
        // could cause double-spend attempts or inconsistent state.
        if (err.code === 'RELAYER_SUBMISSION_FAILED' || err.message?.includes('nonce') || err.message?.includes('reverted')) {
          return `⚠️ *Payment Failed*\n\n${toUserMessage(err, 'The on-chain transaction could not be completed.')}\n\nPlease try again or contact support.`;
        }
      }
    }

    let shortUrl = '';
    let shortCode = '';
    let recipientAddress = '';

    try {
      const escrowResult = await this.escrowService.createClaimLink({
        senderUserId: senderUser.id,
        senderVaultAddress: senderUser.id,
        platform: payload.platform,
        recipientHandle: intent.recipient,
        amount: intent.amount,
        token: token.symbol,
        fromUser: cleanSender,
      });
      shortUrl = escrowResult.shortUrl;
      shortCode = escrowResult.code;
      recipientAddress = escrowResult.toAddress;

      // Auto-add recipient to contacts on escrow creation
      await this.contactsService.upsertAfterPayment(
        senderUser.id,
        payload.platform,
        intent.recipient!,
        recipientAddress,
      );
    } catch (e: any) {
      // Escrow creation is the step that actually locks the funds on-chain.
      // If it fails there is nothing to claim, so we must never fall through
      // and hand out a link that tells both parties the money is escrowed —
      // the recipient would only discover the lie at claim time.
      // The reference goes into the log line the user will be asked to quote,
      // so support can find this exact failure without a timestamp hunt.
      const reference = errorReference();
      this.logger.error(
        `[${reference}] Escrow creation failed for ${cleanSender} → ${intent.recipient} (${intent.amount} ${token.symbol}): ${describeForLog(e)}`,
        e.stack,
      );

      const needsSetup =
        e.code === 'SESSION_KEY_REQUIRED' ||
        e.requirePasskey === true ||
        (e.message && (e.message.includes('wallet setup') || e.message.includes('session key') || e.message.includes('exceeds')));

      if (needsSetup) {
        const registerLink = this.generateSignedDeepLink('/keys', { platform: payload.platform, userId: payload.platformId, username: payload.username, mint: 'true' });
        return `⚠️ *Payment Setup Required*\n\n${toUserMessage(e, 'Your account needs a passkey-authorized session key before it can send from chat.')}\n\n👉 [🚀 Setup Passkey & Session Key](${registerLink})`;
      }

      // Never interpolate the raw error: this line was rendering entire ethers
      // transaction receipts into the chat, addresses and logsBloom included.
      const detail = toUserMessage(e, 'The payment could not be escrowed on-chain.');
      return `⚠️ *Payment Failed*\n\nCould not escrow ${intent.amount} ${token.symbol} for ${intent.recipient}. No funds have left your wallet.\n\n${detail}\n\nIf it keeps happening, contact support and quote \`${reference}\`.`;
    }

    if (!shortUrl) {
      this.logger.error(
        `Escrow reported success but returned no short link for ${cleanSender} → ${intent.recipient}`,
      );
      return `⚠️ *Payment Failed*\n\nCould not generate a claim link for ${intent.recipient}. No funds have left your wallet.\n\nPlease try again or contact support.`;
    }

    // --- Branch 2: Unregistered Recipient (Claim Flow) ---
    // Built from config, not hardcoded: a non-production bot must not hand out
    // links that send claimants to the production bot.
    const telegramAppLink = `https://t.me/${getTelegramBotUsername()}/veripay?startapp=c_${shortCode}`;
    const claimLink = payload.platform === 'telegram' ? telegramAppLink : shortUrl;

    let directForwarded = false;
    try {
      const targetId = recipientNode?.platformUserId || intent.recipient.replace(/^@/, '');
      const isNumericId = /^\d+$/.test(targetId);

      if (isNumericId) {
        const notificationText = `🔔 *Incoming Escrowed Payment!*\n\n` +
          `👤 *@${cleanSender}* has escrowed *${intent.amount} ${token.symbol}* for you on VeriAgent Pay!\n` +
          `⚡ *Funds locked in SocialPayments contract*\n\n` +
          `👉 [Claim Payment](${claimLink})`;
        await this.sendDirectMessage(payload.platform, targetId, notificationText);
        directForwarded = true;
      }
    } catch (e: any) {
      this.logger.warn(`Failed to forward direct payment notification: ${e.message}`);
    }

    const formattedHandle = intent.recipient.startsWith('@') ? intent.recipient.slice(1) : intent.recipient;
    // Telegram's share sheet renders the `url` param itself and then appends
    // `text`, so the body must not repeat the link or the recipient sees it
    // twice. WhatsApp has no separate url param and needs it inline.
    const shareBody = `🎁 Hey! I escrowed ${intent.amount} ${token.symbol} for you on VeriAgent Pay.\n\n` +
      `⚡ Claim instantly with passkey:`;
    const shareMessageText = `${shareBody}\n${shortUrl}`;

    const shareLink = `https://t.me/share/url?url=${encodeURIComponent(shortUrl)}&text=${encodeURIComponent(shareBody)}`;

    let invitePrompt = '';
    if (!directForwarded) {
      if (payload.platform === 'telegram') {
        invitePrompt = `\n\n🚀 [Click here to send payment link to @${formattedHandle}](${shareLink})`;
      } else if (payload.platform === 'whatsapp') {
        const digitsOnly = formattedHandle.replace(/\D/g, '');
        const waLink = `https://wa.me/${digitsOnly}?text=${encodeURIComponent(shareMessageText)}`;
        invitePrompt = `\n\n🚀 [Send claim message via WhatsApp](${waLink})`;
      }
    }

    return `💸 *Escrow Created!* ${directForwarded ? ' (Direct DM Sent ✅)' : ''}\n\n` +
      `👤 *To:* ${intent.recipient} ${recipientAddress ? `(${this.truncateAddress(recipientAddress)})` : '(Pending Passkey Claim)'}\n` +
      `💰 *Amount:* ${intent.amount} ${token.symbol} ${token.icon}\n` +
      `🔗 *Short Link:* ${shortUrl}\n` +
      `⚡ *Status:* Funds Escrowed at Send Time\n` +
      `${directForwarded ? '✅ *Notification sent directly to recipient!*' : `📱 *@${formattedHandle} can claim anytime.*`}` +
      invitePrompt;
  }

  /**
   * Links the calling platform account to the user who requested the code.
   *
   * The code is the only proof of ownership here, so it must be redeemed
   * exactly once. A previous version accepted the literal code `123456` and
   * linked the caller to a hardcoded address — anyone on any platform could
   * take over that account by typing it.
   */
  /**
   * Redeems a linking code that arrived outside the `/verify` command — today
   * that is the `t.me/<bot>?start=verify_<code>` deep link, which is how a
   * recipient who signed up on the web connects Telegram without retyping
   * anything. The proof is identical either way: the code is redeemed from
   * inside the Telegram account being linked, so Telegram itself asserts who
   * that is.
   */
  async redeemLinkCode(payload: SocialMessagePayload, code: string): Promise<string> {
    return this.handleVerifyAction(payload, { adminArgs: code } as ParsedIntent);
  }

  private async handleVerifyAction(payload: SocialMessagePayload, intent: ParsedIntent): Promise<string> {
    const code = (intent.adminArgs || '').trim();
    if (!code) return `ℹ️ Usage: /verify <code>\n\nGet your code from Settings → Linked Accounts in the web dashboard.`;

    const invalidMessage =
      `❌ Invalid, expired, or already-used verification code.\n\n` +
      `Please request a new code from the VeriAgent Pay Web Dashboard.`;

    try {
      // Atomically claim the code: the updateMany only matches while the code
      // is unused and unexpired, so two concurrent redemptions cannot both win.
      const claimed = await this.prisma.verificationCode.updateMany({
        where: {
          code,
          platform: payload.platform,
          usedAt: null,
          expiresAt: { gte: new Date() },
        },
        data: { usedAt: new Date(), usedBy: payload.platformId },
      });

      if (claimed.count !== 1) return invalidMessage;

      const record = await this.prisma.verificationCode.findUnique({ where: { code } });
      if (!record) return invalidMessage;

      try {
        const result = await this.identityService.linkAccount(
          record.userId,
          payload.platform,
          payload.platformId,
          payload.username,
        );

        if (result.alreadyLinked) {
          return `✅ This ${payload.platform} account is already linked to your VeriAgent Pay account.`;
        }
      } catch (linkErr: any) {
        // Release the code so a legitimate retry is still possible.
        await this.prisma.verificationCode
          .update({ where: { id: record.id }, data: { usedAt: null, usedBy: null } })
          .catch(() => undefined);
        return `❌ ${linkErr.message}`;
      }

      return `🎉 *Account Successfully Linked!*\n\n` +
        `✅ Your ${payload.platform} account (@${payload.username}) is now securely linked to your VeriAgent Pay Smart Account on Solana.\n\n` +
        `Your wallet, balances, and session keys are shared across every linked platform.`;
    } catch (err: any) {
      this.logger.error(`Verification error: ${err.message}`, err.stack);
      return `❌ Verification failed. Please try again or request a new code.`;
    }
  }

  private async handleRequestAction(payload: SocialMessagePayload, intent: ParsedIntent): Promise<string> {
    if (!intent.amount || intent.amount <= 0 || !intent.recipient) return `ℹ️ Usage: /request <amount> <token> from <@payer_handle>`;

    const requester = await this.resolveCurrentUser(payload);
    if (!requester) {
      return `⚠️ Please set up your wallet first before creating payment requests.`;
    }

    const requesterAddress = await this.identityService.resolveContact(payload.platform, payload.platformId);
    const tokenSymbol = intent.tokenSymbol || 'USDC';
    const recipientHandle = intent.recipient.startsWith('@') ? intent.recipient.slice(1) : intent.recipient;

    try {
      const recipientUser = await this.identityService.resolveUserByHandle(recipientHandle);

      if (!recipientUser) {
        const link = this.generateSignedDeepLink('/pay', { to: requesterAddress, amount: intent.amount, token: tokenSymbol });
        return `⚠️ Recipient @${recipientHandle} hasn't registered yet.\n\nDeep link: ${link}`;
      }

      // Create payment request in database
      const paymentRequest = await this.prisma.paymentRequest.create({
        data: {
          requesterId: requester.id,
          recipientId: recipientUser.id,
          recipientIdentifier: intent.recipient,
          token: tokenSymbol,
          amount: intent.amount,
          note: intent.memo,
          status: 'PENDING',
        },
      });

      const recipientPlatformId = payload.platform === 'telegram' ? recipientUser.telegramId :
        payload.platform === 'whatsapp' ? recipientUser.whatsappId :
        payload.platform === 'discord' ? recipientUser.discordId : null;

      if (recipientPlatformId) {
        // Generate signed payloads for approve/reject buttons
        const approvePayload = await this.interactiveActionService.generatePayload(
          'approve',
          paymentRequest.id,
          recipientUser.id,
          intent.amount,
          tokenSymbol
        );

        const rejectPayload = await this.interactiveActionService.generatePayload(
          'reject',
          paymentRequest.id,
          recipientUser.id,
          intent.amount,
          tokenSymbol
        );

        const link = this.generateSignedDeepLink('/pay', { to: requesterAddress, amount: intent.amount, token: tokenSymbol });

        // Send message with inline buttons for Telegram
        if (payload.platform === 'telegram') {
          const driver = this.drivers.get('telegram');
          if (driver && driver.sendMessageWithInlineKeyboard) {
            await driver.sendMessageWithInlineKeyboard(
              recipientPlatformId,
              `📥 *Payment Request*\n\n` +
              `👤 @${payload.username} is requesting *${intent.amount} ${tokenSymbol}* from you.\n` +
              `${intent.memo ? `📝 Note: ${intent.memo}\n\n` : '\n'}` +
              `Choose an action below:`,
              [
                [
                  { text: '✅ Approve & Pay', callback_data: approvePayload },
                  { text: '❌ Reject', callback_data: rejectPayload }
                ]
              ]
            );
          }
        } else {
          // Fallback for other platforms
          await this.sendDirectMessage(
            payload.platform,
            recipientPlatformId,
            `📥 *Payment Request*\n\n` +
            `👤 @${payload.username} is requesting *${intent.amount} ${tokenSymbol}* from you.\n` +
            `🔗 Click to approve transfer:\n${link}`
          );
        }
      }

      return `✅ Request sent to ${intent.recipient} for ${intent.amount} ${tokenSymbol}`;
    } catch (err: any) {
      this.logger.error(`Failed to create payment request: ${err.message}`);
      return `⚠️ Failed to send request: ${toUserMessage(err, 'The payment request could not be created.')}`;
    }
  }

  private async handleSaveAction(payload: SocialMessagePayload, intent: ParsedIntent): Promise<string> {
    const userAddress = await this.identityService.resolveContact(payload.platform, payload.platformId);
    const link = this.generateSignedDeepLink('/vaults', { address: userAddress });

    let apy = 0;
    try {
      apy = (await this.vaultService.getVerifiedAPY()).apy;
    } catch (e: any) {
      this.logger.warn(`Failed to fetch verified APY for /save: ${e.message}`);
    }

    const apyString = apy ? `${apy.toFixed(2)}% APY` : '~5.8% APY';

    return `🏦 *AI Yield Vaults (Coming Soon)*\n\n` +
      `Automated savings balances earning verified yield (${apyString}) on stablecoins are launching soon!\n\n` +
      `We are currently finalizing cross-chain yield routing across BNB Chain and Arbitrum to ensure maximum security and high APY for your idle funds.\n\n` +
      `👉 [📱 Preview Vaults in Web App](${link})`;
  }

  private async handleEnvelopeAction(payload: SocialMessagePayload, intent: ParsedIntent): Promise<string> {
    if (!intent.amount || intent.amount <= 0) return `ℹ️ Usage: /envelope <amount> <claims_count>`;

    const user = await this.resolveCurrentUser(payload);
    if (!user) {
      return `⚠️ *Account Setup Required*\n\nPlease set up your wallet first before creating envelopes.`;
    }

    const count = intent.claimsCount || 5;
    const tokenSymbol = intent.tokenSymbol || 'USDC';

    try {
      // Import EnvelopesService dynamically to avoid circular dependency
      const { EnvelopesService } = await import('../envelopes/envelopes.service');
      // Positional, and the constructor has grown — anything omitted here is
      // silently `undefined` inside the service. `userTokensService` in
      // particular: without it, `resolveTokenFor` falls back to the built-in
      // registry and an envelope in a user-added token fails to resolve on the
      // one path that matters most, the bots.
      const envelopesService = new EnvelopesService(
        this.prisma,
        this.notificationsService,
        this.unifiedNotificationService,
        this.activityService,
        this.identityService,
        undefined, // claimRetryService
        undefined, // badgesService
        undefined, // relayerService
        this.userTokensService,
      );

      // Create envelope with proper fund locking
      const result = await envelopesService.create(user.id, {
        token: tokenSymbol,
        totalAmount: intent.amount,
        numRecipients: count,
        type: 'OPEN',
        message: intent.memo || '🧧 Happy Red Envelope!',
      });

      if (!result.success) {
        // A failure that a passkey could resolve gets the same one-tap
        // approval link a direct payment would, rather than a dead end.
        const reason = this.paymentEscalation.classify(result);
        if (reason) {
          return this.paymentEscalation.buildPrompt({
            token: tokenSymbol,
            amount: intent.amount,
            count,
            action: 'envelope',
            reason,
          }).message;
        }
        return `⚠️ Failed to create envelope. Please try again.`;
      }

      return `🧧 *Red Envelope Created!*\n\n` +
        `💰 Total Pool: *${intent.amount} ${tokenSymbol}* split randomly between *${count}* claimers.\n` +
        `📦 Envelope ID: \`${result.envelope.id}\`\n\n` +
        `🔗 Share this claim link:\n${result.deepLink}\n\n` +
        `✅ Funds are locked in escrow until claimed!`;
    } catch (err: any) {
      // `create()` throws rather than returning a failed result for the cases
      // that matter here — no session key, expired grant, over the cap — so the
      // escalation has to be offered from the catch as well. Without it these
      // came back as "Failed to create envelope", which tells the user nothing
      // they can act on when the fix is one passkey tap.
      const reason = this.paymentEscalation.classify(err);
      if (reason) {
        this.logger.log(
          `[Envelope] Escalating to passkey (${reason}) for ${user.id.slice(0, 8)}…`,
        );
        return this.paymentEscalation.buildPrompt({
          token: tokenSymbol,
          amount: intent.amount,
          count,
          action: 'envelope',
          reason,
        }).message;
      }

      this.logger.error(`Failed to create envelope: ${err.message}`);
      return `⚠️ Failed to create envelope: ${toUserMessage(err, 'The envelope could not be created. No funds have left your wallet.')}`;
    }
  }

  private async handleSplitAction(payload: SocialMessagePayload, intent: ParsedIntent): Promise<string> {
    if (!intent.amount || intent.amount <= 0 || !intent.participants || intent.participants.length === 0) {
      return `ℹ️ *Split Payment Usage:*\n\n` +
        `💡 Equal split:\n\`/split 120 USDC @alice @bob @charlie\`\n\n` +
        `💡 Custom amounts:\n\`/split 120 USDC @alice:50 @bob:40 @charlie:30\`\n\n` +
        `Each participant will receive a payment request with their share.`;
    }

    const user = await this.resolveCurrentUser(payload);
    if (!user) {
      return `⚠️ *Account Setup Required*\n\nPlease set up your wallet first before creating splits.`;
    }

    try {
      // Parse custom amounts if specified (e.g., @alice:50 @bob:30)
      let customAmounts: number[] | undefined;
      const participantsClean: string[] = [];

      for (const p of intent.participants) {
        const match = p.match(/^(@?[\w]+):(\d+(?:\.\d+)?)$/);
        if (match) {
          participantsClean.push(match[1].startsWith('@') ? match[1] : `@${match[1]}`);
          if (!customAmounts) customAmounts = [];
          customAmounts.push(parseFloat(match[2]));
        } else {
          participantsClean.push(p.startsWith('@') ? p : `@${p}`);
        }
      }

      // If some but not all have custom amounts, return error
      if (customAmounts && customAmounts.length !== participantsClean.length) {
        return `⚠️ *Invalid Format*\n\nEither all participants must have custom amounts or none.\n` +
          `Example: \`/split 120 @alice:50 @bob:40 @charlie:30\``;
      }

      const token = intent.tokenSymbol || 'USDC';
      const description = intent.memo || `Split payment for ${intent.amount} ${token}`;

      // Create the split
      const split = await this.splitsService.createSplit(user.id, {
        token,
        totalAmount: intent.amount,
        participants: participantsClean,
        customAmounts,
        description,
      });

      const shareAmount = customAmounts
        ? 'varies'
        : (intent.amount / participantsClean.length).toFixed(2);

      const appBaseUrl = getAppBaseUrl();
      const splitLink = `${appBaseUrl}/splits/${split.id}`;

      return `✅ *Split Payment Created!*\n\n` +
        `💰 Total: *${intent.amount} ${token}*\n` +
        `👥 Split ${participantsClean.length} ways ${customAmounts ? '(custom amounts)' : `(${shareAmount} ${token} each)`}\n` +
        `👤 Participants: ${participantsClean.join(', ')}\n\n` +
        `🔔 Each participant has been notified with a payment request.\n\n` +
        `📊 Track payment status:\n${splitLink}`;
    } catch (error: any) {
      this.logger.error(`Split creation failed: ${error.message}`);
      return `❌ *Split Creation Failed*\n\n${toUserMessage(error, 'The split could not be created.')}\n\n` +
        `Please try again or contact support if the issue persists.`;
    }
  }

  private async handleReferralAction(payload: SocialMessagePayload): Promise<string> {
    const user = await this.resolveCurrentUser(payload);
    if (!user) {
      return `⚠️ *Account Setup Required*\n\nPlease set up your wallet first to get a referral code.`;
    }
    const stats = await this.referralService.getUserReferralStats(user.id);
    return `🎁 *Refer & Earn VERI Points!*\n\n` +
      `Your unique invite link:\n${stats.shareUrl}\n\n` +
      `• *Total Referrals:* ${stats.totalReferrals}\n` +
      `• *Total Points Earned:* ${stats.totalPoints} VERI\n\n` +
      `Earn **100 VERI Points** for every friend who sets up their biometric passkey!`;
  }

  private async handleSubscribeAction(payload: SocialMessagePayload, intent: ParsedIntent): Promise<string> {
    if (!intent.amount || intent.amount <= 0 || !intent.recipient) return `ℹ️ Usage: /subscribe <amount> <@recipient> <interval_days>`;
    const days = intent.intervalDays || 30;
    const user = await this.resolveCurrentUser(payload);

    if (user && this.subscriptionService) {
      const activeSession = user.sessionKeys?.find((k) =>
        k.activatedAt && !k.revokedAt && new Date(k.expiryAt) > new Date()
      );

      if (activeSession) {
        try {
          const recipientAddress = (await this.identityService.resolveContact(payload.platform, intent.recipient)) || intent.recipient;
          const sub = await this.subscriptionService.createSubscription(
            user.id,
            recipientAddress,
            intent.recipient,
            intent.amount,
            days
          );

          return `🔄 *Recurring Subscription Created On-Chain!*\n\n` +
            `⚡ *Amount:* $${intent.amount} USDC\n` +
            `👤 *Recipient:* ${intent.recipient}\n` +
            `⏱️ *Frequency:* Every ${days} days\n` +
            `🔑 *Status:* Cleared via 7-day Session Key\n\n` +
            `👉 [❌ Cancel Subscription](${getAppBaseUrl()}/subscriptions?action=cancel&id=${sub.id})`;
        } catch (err: any) {
          this.logger.warn(`Direct subscription creation failed: ${err.message}`);
        }
      }
    }

    const link = this.generateSignedDeepLink('/subscriptions', { recipient: intent.recipient, amount: intent.amount });

    return `🔄 *Recurring Payment Subscription Configured!*\n\n` +
      `Send *${intent.amount} USDC* every ${days} days to ${intent.recipient}.\n\n` +
      `👉 [🔑 Mint Session Key & Activate](${getAppBaseUrl()}/keys?mint=true)\n` +
      `👉 [📱 Manage Subscriptions](${link})`;
  }

  getPostPaymentNudgeMessage(senderHandle: string, amount: number, userAddress: string): { text: string; actionButtons: any[] } {
    return {
      text: `🎉 You received **${amount} USDC** from ${senderHandle}!\nWould you like to earn verified AI yield on it?`,
      actionButtons: [
        { text: '💰 Save All', url: this.generateSignedDeepLink('/save-yield', { amount, address: userAddress }) },
        { text: '🪙 Save Half', url: this.generateSignedDeepLink('/save-yield', { amount: (amount / 2).toFixed(2), address: userAddress }) },
        { text: '❌ Dismiss', action: 'DISMISS' }
      ]
    };
  }

  private async handleTokensCommand(payload: SocialMessagePayload): Promise<string> {
    const user = await this.resolveCurrentUser(payload);
    if (!user) {
      const onboardLink = this.generateSignedDeepLink('/onboard', { platform: payload.platform, platformId: payload.platformId, username: payload.username });
      return `⚠️ *Please onboard first to view and manage watched tokens.*\n\n👉 [Complete Onboarding](${onboardLink})`;
    }

    const customTokens = await this.userTokensService.listForUser(user.id);
    const builtIns = Object.values(SUPPORTED_TOKENS).filter((t) => t.address && t.address !== '0x0000000000000000000000000000000000000000');

    let msg = `🪙 *Watched Tokens & Assets*\n\n`;
    msg += `*Verified Protocol Assets:*\n`;
    for (const t of builtIns) {
      const shortAddr = t.address.slice(0, 6) + '...' + t.address.slice(-4);
      msg += `• *${t.symbol}* (${t.name}) — \`${shortAddr}\` ✅\n`;
    }

    if (customTokens.length > 0) {
      msg += `\n*Your Custom Watched Tokens:*\n`;
      for (const t of customTokens) {
        const shortAddr = t.address.slice(0, 6) + '...' + t.address.slice(-4);
        msg += `• *${t.symbol}* (${t.name}, ${t.decimals} dec) — \`${shortAddr}\` ⚠️ Unverified\n`;
      }
    } else {
      msg += `\n_You have no custom tokens added yet._\n`;
    }

    msg += `\n💡 *Commands:*\n` +
      `• \`/addtoken 0x...\` — Watch any ERC-20 token contract\n` +
      `• \`/removetoken 0x...\` — Stop watching a token\n` +
      `• \`/pay 10 <SYMBOL_OR_ADDR> @user\` — Send any watched token\n\n` +
      `👉 [➕ Watch Custom Token](${getAppBaseUrl()}/tokens?action=add)`;

    return msg;
  }

  private async handleAddTokenCommand(payload: SocialMessagePayload, intent: ParsedIntent): Promise<string> {
    const user = await this.resolveCurrentUser(payload);
    if (!user) {
      const onboardLink = this.generateSignedDeepLink('/onboard', { platform: payload.platform, platformId: payload.platformId, username: payload.username });
      return `⚠️ *Please onboard first to watch custom tokens.*\n\n👉 [Complete Onboarding](${onboardLink})`;
    }

    const tokenAddress = intent.adminArgs?.tokenAddress || (intent as any).tokenAddress;
    if (!tokenAddress || !ethers.isAddress(tokenAddress)) {
      return `⚠️ *Invalid Token Address*\n\nPlease specify a valid ERC-20 contract address.\n\nUsage: \`/addtoken 0x1234...abcd\``;
    }

    try {
      const result = await this.userTokensService.addToken(user.id, tokenAddress);
      const isBuiltIn = Object.values(SUPPORTED_TOKENS).some(
        (b) => b.address?.toLowerCase() === tokenAddress.toLowerCase()
      );

      const status = isBuiltIn ? '✅ *Verified Protocol Asset*' : '⚠️ *Unverified Custom Token*';

      return `🎉 *Token Added to Watchlist!*\n\n` +
        `🪙 *Symbol:* ${result.symbol}\n` +
        `📝 *Name:* ${result.name}\n` +
        `🔢 *Decimals:* ${result.decimals}\n` +
        `📍 *Contract:* \`${result.address}\`\n` +
        `🛡️ *Status:* ${status}\n\n` +
        `⚡ *Real-Time Watching Enabled:*\n` +
        `• Incoming deposits for this token will be credited automatically.\n` +
        `• You can now send, request, or create envelopes using *${result.symbol}* or \`${result.address.slice(0, 6)}...${result.address.slice(-4)}\`.\n` +
        `• Daily balance reconciliation will keep your vault balances in sync.`;
    } catch (err: any) {
      return `❌ *Failed to add token:* ${err.message || 'Could not read ERC-20 metadata from contract'}`;
    }
  }

  private async handleRemoveTokenCommand(payload: SocialMessagePayload, intent: ParsedIntent): Promise<string> {
    const user = await this.resolveCurrentUser(payload);
    if (!user) return `⚠️ *User not found.*`;

    const tokenAddress = intent.adminArgs?.tokenAddress || (intent as any).tokenAddress;
    if (!tokenAddress || !ethers.isAddress(tokenAddress)) {
      return `⚠️ *Invalid Token Address*\n\nUsage: \`/removetoken 0x1234...abcd\``;
    }

    try {
      await this.userTokensService.removeToken(user.id, tokenAddress);
      return `🗑️ *Token removed from your watchlist.* Incoming transfers for this token will no longer be tracked.`;
    } catch (err: any) {
      return `❌ *Failed to remove token:* ${err.message}`;
    }
  }

  private formatAmbiguousTokenPrompt(
    payload: SocialMessagePayload,
    intent: ParsedIntent,
    candidates: TokenInfo[],
  ): string {
    const symbol = intent.unsupportedToken || intent.tokenSymbol || 'that token';
    const amount = intent.amount || 0;
    const recipient = intent.recipient || '';

    let text = `⚠️ *Multiple Watched Tokens Found for "${symbol}"*\n\n` +
      `You are watching multiple custom tokens claiming the symbol *${symbol}*. Please select the exact contract address:\n\n`;

    candidates.forEach((cand, idx) => {
      text += `${idx + 1}. *${cand.name}* (\`${cand.symbol}\`)\n` +
        `   📍 Contract: \`${cand.address}\` (${cand.decimals} decimals)\n\n`;
    });

    text += `💡 *To proceed, specify the contract address directly:*\n`;
    if (intent.action === 'PAY') {
      text += `\`/pay ${amount} ${candidates[0].address} ${recipient ? `@${recipient}` : ''}\``;
    } else if (intent.action === 'REQUEST') {
      text += `\`/request ${amount} ${candidates[0].address} ${recipient ? `@${recipient}` : ''}\``;
    } else if (intent.action === 'ENVELOPE') {
      text += `\`/envelope ${amount} ${candidates[0].address} ${intent.claimsCount || 5}\``;
    } else {
      text += `Use the token's full contract address in your command.`;
    }

    return text;
  }

  private solanaFeatureUnavailable(feature: string): string {
    return `ℹ️ *${feature} are not yet available in the native Solana build.*\n\n` +
      `Today this build supports passkey vaults, bounded sessions, SOL balance visibility, and USDC transfers.`;
  }

  private async handleLeaderboardCommand(payload: SocialMessagePayload): Promise<string> {
    const link = this.generateSignedDeepLink('/leaderboard', { platform: payload.platform });
    const user = await this.resolveCurrentUser(payload);

    const userIdentifier = user ? user.id : payload.platformId;
    const rankInfo = await this.badgesService.getUserRank(userIdentifier);
    const leaderboard = await this.badgesService.getLeaderboard(3);

    let rankingsBlock = '';
    const medals = ['🥇', '🥈', '🥉'];
    leaderboard.rankings.forEach((r, idx) => {
      rankingsBlock += `${medals[idx] || '⭐'} ${idx + 1}. ${r.handle} (${r.reputationPoints} pts)\n`;
    });

    return `🏆 *VeriAgent Pay Global Leaderboard*\n\n` +
      `👤 *Your Rank:* #${rankInfo.globalRank} out of ${leaderboard.totalUsers} users (${rankInfo.percentile})\n` +
      `⭐ *Reputation:* ${rankInfo.reputationPoints} Pts\n\n` +
      `${rankingsBlock}\n` +
      `🔗 Open full leaderboard & rankings:\n${link}`;
  }

  private async handleBadgesCommand(payload: SocialMessagePayload): Promise<string> {
    const link = this.generateSignedDeepLink('/badges', { platform: payload.platform });
    const user = await this.resolveCurrentUser(payload);

    const userIdentifier = user ? user.id : payload.platformId;
    const badgeInfo = await this.badgesService.getUserBadges(userIdentifier);

    let badgeListBlock = '';
    badgeInfo.badges.forEach((b) => {
      badgeListBlock += `${b.unlocked ? '✅' : '🔒'} ${b.name} — ${b.description}\n`;
    });

    return `🎖️ *Your Achievement Badges* (${badgeInfo.totalEarned}/${badgeInfo.badges.length})\n\n` +
      `${badgeListBlock}\n` +
      `🔗 View & Share your dynamic card:\n${link}`;
  }

  /**
   * Lists escrows the sender can still pull back.
   *
   * Platform-agnostic text so every driver renders it identically — per ADR-003
   * drivers stay transport adapters and gain no cancellation logic of their own.
   */
  private async handlePendingCommand(payload: SocialMessagePayload): Promise<string> {
    const user = await this.resolveCurrentUser(payload);
    if (!user) {
      return `⚠️ *No wallet found*\n\nSet up your passkey wallet first, then \`/pending\` will list payments you can cancel.`;
    }

    const pending = await this.escrowService.listCancellable(user.id);
    if (pending.length === 0) {
      return `✅ *No pending payments*\n\nEvery payment you have sent has been claimed or already cancelled.`;
    }

    const lines = pending.map((p) => {
      const target = p.recipient ? `@${String(p.recipient).replace(/^@/, '')}` : 'anyone with the link';
      const note = p.escrowed ? '' : ' _(never reached the chain)_';
      return `• *${p.amount} ${p.token}* → ${target}${note}\n  \`/cancel ${p.code}\``;
    });

    return `⏳ *Pending payments (${pending.length})*\n\n${lines.join('\n')}\n\n` +
      `Cancelling returns the funds to your wallet immediately.`;
  }

  /** Cancels one escrow and returns the funds to the sender. */
  private async handleCancelCommand(payload: SocialMessagePayload, intent: ParsedIntent): Promise<string> {
    const code = intent.code;
    if (!code) {
      return `Usage: \`/cancel <code>\`\n\nRun \`/pending\` to see which payments you can cancel.`;
    }

    const user = await this.resolveCurrentUser(payload);
    if (!user) {
      return `⚠️ *No wallet found*\n\nOnly the sender of a payment can cancel it.`;
    }

    try {
      const result = await this.escrowService.cancelClaimLink(code, user.id);
      const target = result.recipient ? `@${String(result.recipient).replace(/^@/, '')}` : 'the recipient';

      if (!result.refunded) {
        return `✅ *Payment link retired*\n\nThe link for *${result.amount} ${result.token}* to ${target} is no longer claimable. ` +
          `No funds had reached the chain, so nothing was returned.`;
      }

      return `✅ *Payment cancelled*\n\n` +
        `*${result.amount} ${result.token}* has been returned to your wallet.\n` +
        `${target} can no longer claim it.\n\n` +
        `🔗 \`${result.txHash}\``;
    } catch (e: any) {
      this.logger.warn(`Cancel failed for code=${code} by user=${user.id}: ${e.message}`);
      return `⚠️ *Could not cancel*\n\n${toUserMessage(e, 'That payment could not be cancelled.')}`;
    }
  }

  private async handleStatsCommand(payload: SocialMessagePayload): Promise<string> {
    const link = this.generateSignedDeepLink('/badges', { platform: payload.platform });
    const user = await this.resolveCurrentUser(payload);

    const userIdentifier = user ? user.id : payload.platformId;
    const rankInfo = await this.badgesService.getUserRank(userIdentifier);

    let streakDays = 0;
    if (user) {
      const activities = await this.prisma.userActivityLog.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
      });
      const uniqueDays = new Set(
        activities.map((a) => new Date(a.createdAt).toDateString())
      );
      streakDays = uniqueDays.size;
    }

    return `📊 *Your VeriAgent Pay Performance Metrics*\n\n` +
      `🔥 *Savings Streak:* ${streakDays} Days (+${streakDays * 30} Bonus Pts)\n` +
      `⭐ *Reputation Score:* ${rankInfo.reputationPoints} Points\n` +
      `👥 *Friends Referred:* ${rankInfo.totalReferred} Users\n\n` +
      `🔗 Open profile & share metrics:\n${link}`;
  }

  public truncateAddress(addr?: string | null): string {
    if (!addr) return 'Unregistered';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  }

  private formatRelativeDate(date: Date): string {
    const now = Date.now();
    const diffMs = now - new Date(date).getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHrs = Math.floor(diffMin / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    const diffDays = Math.floor(diffHrs / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
}
