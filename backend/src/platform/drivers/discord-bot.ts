import { Injectable, Inject, forwardRef, Logger, OnModuleInit } from '@nestjs/common';
import { PlatformService, SocialMessagePayload } from '../platform.service';
import { PlatformUiAdapter, GenericButton } from '../platform-ui.adapter';
import { sanitizeOutboundMessage } from '../../common/user-error.util';
import { isPlatformEnabled } from '../../config/platforms.config';

export interface DiscordSlashCommand {
  name: string;
  description: string;
  options?: any[];
}

export const DISCORD_SLASH_COMMANDS: DiscordSlashCommand[] = [
  {
    name: 'start',
    description: 'Start VeriAgent Pay Dashboard & Wallet'
  },
  {
    name: 'wallet',
    description: 'Open wallet dashboard & passkey controls'
  },
  {
    name: 'dashboard',
    description: 'Open the VeriAgent Pay web dashboard and manage session keys'
  },
  {
    name: 'balance',
    description: 'View your token balances on BOTChain'
  },
  {
    name: 'history',
    description: 'View recent transactions & activity history'
  },
  {
    name: 'pay',
    description: 'Send money to a Discord user',
    options: [
      { name: 'amount', type: 10, description: 'Amount to send (e.g. 50)', required: true },
      { name: 'user', type: 6, description: 'Recipient user', required: true },
      { name: 'token', type: 3, description: 'Token (USDC, USDT, BOT)', required: false }
    ]
  },
  {
    name: 'request',
    description: 'Request money from a Discord user',
    options: [
      { name: 'amount', type: 10, description: 'Amount to request', required: true },
      { name: 'user', type: 6, description: 'User to request from', required: true },
      { name: 'token', type: 3, description: 'Token (USDC, USDT, BOT)', required: false }
    ]
  },
  {
    name: 'contacts',
    description: 'View your frequent contacts'
  },
  {
    name: 'save',
    description: 'Deposit to yield vault',
    options: [
      { name: 'amount', type: 10, description: 'Amount to save (e.g. 100)', required: true },
      { name: 'token', type: 3, description: 'Token (USDC, USDT)', required: false }
    ]
  },
  {
    name: 'split',
    description: 'Split a bill with server members',
    options: [
      { name: 'amount', type: 10, description: 'Total bill amount', required: true },
      { name: 'users', type: 3, description: 'Mention users to split with', required: true }
    ]
  },
  {
    name: 'envelope',
    description: 'Send a red envelope (lucky money)',
    options: [
      { name: 'amount', type: 10, description: 'Total amount to give away', required: true },
      { name: 'slots', type: 4, description: 'Number of people who can claim', required: true }
    ]
  },
  {
    name: 'referral',
    description: 'Refer friends & earn VERI points'
  },
  {
    name: 'pools',
    description: 'View group pools & credit lines'
  },
  {
    name: 'help',
    description: 'Get help and natural language examples'
  }
];

/**
 * Driver representing Discord Application Slash Commands and Gateway Messages
 */
@Injectable()
export class DiscordBotDriver implements OnModuleInit {
  private readonly logger = new Logger(DiscordBotDriver.name);
  constructor(
    @Inject(forwardRef(() => PlatformService))
    private readonly platformService: PlatformService
  ) {}

  onModuleInit() {
    if (!isPlatformEnabled('discord')) {
      this.logger.log('discord is not in ENABLED_PLATFORMS; driver not registered.');
      return;
    }
    this.platformService.registerDriver('discord', this);
  }

  buildSplitEmbedCard(split: any, appUrl: string) {
    return PlatformUiAdapter.toDiscord({
      title: `📊 Bill Split: ${split.description || 'Group Split'}`,
      body: `*Total Bill:* $${split.totalAmount} ${split.token || 'USDC'}\n*Participants:* ${split.participants?.length || 1}\n*Collection:* ${split.participants?.filter((p: any) => p.hasPaid).length || 0} of ${split.participants?.length || 1} paid`,
      buttons: [
        [
          { label: `💳 Pay Share ($${(split.yourShare || 0).toFixed(2)})`, callbackId: `split:pay:${split.id}`, style: 'primary' },
          { label: '📊 View Details', url: `${appUrl}/splits/${split.id}`, style: 'secondary' },
        ],
      ],
    });
  }

  async sendMessage(userId: string, text: string): Promise<void> {
    const safeText = sanitizeOutboundMessage(text);
    const botToken = process.env.DISCORD_BOT_TOKEN;
    if (!botToken) {
      this.logger.warn('DISCORD_BOT_TOKEN not configured, skipping Discord DM');
      return;
    }

    try {
      // Create DM channel
      const dmResponse = await fetch('https://discord.com/api/v10/users/@me/channels', {
        method: 'POST',
        headers: {
          'Authorization': `Bot ${botToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ recipient_id: userId }),
      });

      if (!dmResponse.ok) {
        throw new Error(`Failed to create DM channel: ${dmResponse.statusText}`);
      }

      const dmChannel = await dmResponse.json();

      // Convert any text markdown links to native Discord component cards
      const discordPayload = PlatformUiAdapter.toDiscord({ body: safeText });

      // Send message to DM channel
      const msgResponse = await fetch(`https://discord.com/api/v10/channels/${dmChannel.id}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bot ${botToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: discordPayload.embeds[0]?.description || text,
          embeds: discordPayload.embeds,
          components: discordPayload.components,
        }),
      });

      if (!msgResponse.ok) {
        throw new Error(`Failed to send Discord DM: ${msgResponse.statusText}`);
      }
    } catch (error: any) {
      this.logger.error(`Failed to send Discord message: ${error.message}`);
      throw error;
    }
  }

  getSlashCommands() {
    return DISCORD_SLASH_COMMANDS;
  }

  /**
   * Converts a Discord slash-command interaction into the canonical text form
   * the shared command parser expects.
   *
   * Discord delivers options as an unordered, named list, and USER options
   * carry a raw snowflake rather than a handle. Joining values positionally
   * produced `/pay 50 <snowflake> USDC`, which made the parser read the
   * snowflake as the token and silently fall back to USDC — so `/pay` with
   * USDT or BOT sent the wrong asset. Building by name fixes that.
   */
  static buildCommandText(data: any): string {
    const name = data?.name;
    if (!name) return '';

    const options: any[] = data.options || [];
    const byName = new Map<string, any>(options.map((o) => [o.name, o.value]));

    /** Discord USER options resolve to a snowflake; prefix so handles match. */
    const mention = (value: unknown): string => {
      const raw = String(value ?? '').trim();
      if (!raw) return '';
      return raw.startsWith('@') || raw.startsWith('<@') ? raw : `@${raw}`;
    };

    switch (name) {
      case 'pay':
      case 'request': {
        const amount = byName.get('amount');
        const token = byName.get('token') || 'USDC';
        const user = mention(byName.get('user'));
        // Parser grammar: /pay <amount> <token> <@recipient>
        return `/${name} ${amount} ${token} ${user}`.trim();
      }
      case 'envelope': {
        const amount = byName.get('amount');
        const slots = byName.get('slots');
        return `/envelope ${amount} ${slots}`.trim();
      }
      case 'save': {
        const amount = byName.get('amount');
        const token = byName.get('token') || 'USDC';
        return `/save ${amount} ${token}`.trim();
      }
      case 'split': {
        const amount = byName.get('amount');
        const users = String(byName.get('users') ?? '')
          .split(/[\s,]+/)
          .filter(Boolean)
          .map(mention)
          .join(' ');
        return `/split ${amount} ${users}`.trim();
      }
      default: {
        // Commands without options, or ones whose declaration order already
        // matches the parser grammar.
        const positional = options.map((o) => o.value).join(' ');
        return `/${name} ${positional}`.trim();
      }
    }
  }

  /**
   * Handle Discord Interaction (Slash Command or Button Click) or Gateway Message
   */
  async handleDiscordMessage(messageOrInteraction: any): Promise<{ response: string; embed?: any; components?: any[]; channelId: string; flags?: number }> {
    const type = messageOrInteraction.type;
    const isSlash = Boolean(type === 2);
    const isComponent = Boolean(type === 3); // Button click interaction
    const author = (isSlash || isComponent) ? messageOrInteraction.member?.user || messageOrInteraction.user : messageOrInteraction.author;
    const channelId = messageOrInteraction.channel_id;

    if (isComponent) {
      const customId = messageOrInteraction.data?.custom_id || '';
      const user = await this.platformService.resolveCurrentUser({ platform: 'discord', platformId: author.id, username: author.username });

      if (!user) {
        return { response: '⚠️ Please set up your wallet first.', channelId, flags: 64 };
      }

      const cb = customId.replace(/^env_/, 'env:').replace(/^split_/, 'split:').replace(/^req_/, 'req:').replace(/^pool_/, 'pool:').replace(/^vault_/, 'vault:').replace(/^sub_/, 'sub:');
      const parts = cb.split(':');
      const domain = parts[0];
      const action = parts[1];
      const entityId = parts[2];
      const extra = parts[3];

      let actionResult: any = { success: false, message: 'Unknown action' };
      const interactiveActionService = this.platformService.getInteractiveActionService?.();

      if (interactiveActionService) {
        // Pool action flow: deposit/request/repay/invite → show user's pools as buttons
        if (customId.startsWith('pool_action:')) {
          const subAction = customId.split(':')[1];
          const pools = await interactiveActionService.getUserPools(user.id);

          if (!pools || pools.length === 0) {
            return { response: '❌ You are not a member of any pools yet.\n\n👉 Create a pool or ask to be invited!', channelId, flags: 64 };
          }

          let title = '';
          const buttons: GenericButton[][] = [];

          if (subAction === 'deposit') {
            title = '💰 Select a pool to deposit funds:';
            pools.forEach((p: any) => {
              buttons.push([{ label: `${p.name} (${p.poolBalance || 0} ${p.token})`, callbackId: `pool:dep_select:${p.id}`, style: 'primary' }]);
            });
          } else if (subAction === 'request') {
            title = '📥 Select a pool to request a loan:';
            pools.forEach((p: any) => {
              buttons.push([{ label: `${p.name} (${p.poolBalance || 0} ${p.token})`, callbackId: `pool:req_select:${p.id}`, style: 'primary' }]);
            });
          } else if (subAction === 'repay') {
            title = '💳 Select a pool to repay your active loan:';
            pools.forEach((p: any) => {
              buttons.push([{ label: `💳 ${p.name}`, callbackId: `pool:repay_select:${p.id}`, style: 'primary' }]);
            });
          } else if (subAction === 'invite') {
            title = '👥 Select a pool to invite members:';
            pools.forEach((p: any) => {
              buttons.push([{ label: `${p.name} (${p.members?.length || 0} members)`, callbackId: `pool:inv_select:${p.id}`, style: 'secondary' }]);
            });
          }

          const card = PlatformUiAdapter.toDiscord({ title, body: title, buttons });
          return { response: title, embed: card.embeds[0], components: card.components, channelId, flags: 64 };
        }

        if (domain === 'req') {
          if (action === 'pay') actionResult = await interactiveActionService.handleRequestPaymentAction(entityId, user.id);
          else if (action === 'decline') actionResult = await interactiveActionService.handleRequestDeclineAction(entityId, user.id);
          else if (action === 'nudge') actionResult = await interactiveActionService.handleRequestNudgeAction(entityId, user.id);
        } else if (domain === 'split') {
          if (action === 'pay' || action === 'pay_share') actionResult = await interactiveActionService.handleSplitPaymentAction(entityId, user.id);
          else if (action === 'ping') actionResult = await interactiveActionService.handleSplitPingAction(entityId, user.id);
        } else if (domain === 'env') {
          if (action === 'claim') actionResult = await interactiveActionService.handleEnvelopeClaimAction(entityId, user.id);
          else if (action === 'cancel' || action === 'refund') actionResult = await interactiveActionService.handleEnvelopeCancelAction(entityId, user.id);
        } else if (domain === 'vault') {
          if (action === 'save' || action === 'deposit') {
            actionResult = await interactiveActionService.handleVaultDepositAction(user.id, parseFloat(entityId || '50'));
          } else if (action === 'withdraw') {
            actionResult = await interactiveActionService.handleVaultWithdrawAction(user.id, parseFloat(entityId || '50'));
          }
        } else if (domain === 'sub') {
          if (action === 'cancel') {
            actionResult = await interactiveActionService.handleSubscriptionCancelAction(entityId, user.id);
          }
        } else if (domain === 'pool') {
          if (action === 'dep_select' || action === 'req_select' || action === 'repay_select') {
            const isDeposit = action === 'dep_select';
            const isRepay = action === 'repay_select';
            const title = isDeposit ? '💰 Select Deposit Amount' : isRepay ? '💳 Select Repay Amount' : '📥 Select Loan Amount';
            const body = isDeposit ? 'Choose a preset deposit amount:' : isRepay ? 'Choose loan amount to repay:' : 'Choose a preset loan request amount:';
            const buttons: GenericButton[][] = isDeposit ? [
              [
                { label: '💵 $10', callbackId: `pool:dep_amt:${entityId}:10`, style: 'primary' },
                { label: '💵 $50', callbackId: `pool:dep_amt:${entityId}:50`, style: 'primary' },
              ],
              [
                { label: '💵 $100', callbackId: `pool:dep_amt:${entityId}:100`, style: 'primary' },
                { label: '💵 $250', callbackId: `pool:dep_amt:${entityId}:250`, style: 'primary' },
              ],
            ] : isRepay ? [
              [
                { label: '💳 Settle Full ($50)', callbackId: `pool:repay_amt:${entityId}:loan:50`, style: 'primary' },
                { label: '💵 $25', callbackId: `pool:repay_amt:${entityId}:loan:25`, style: 'primary' },
              ],
            ] : [
              [
                { label: '📥 $50', callbackId: `pool:req_amt:${entityId}:50`, style: 'primary' },
                { label: '📥 $100', callbackId: `pool:req_amt:${entityId}:100`, style: 'primary' },
              ],
              [
                { label: '📥 $250', callbackId: `pool:req_amt:${entityId}:250`, style: 'primary' },
                { label: '📥 $500', callbackId: `pool:req_amt:${entityId}:500`, style: 'primary' },
              ],
            ];
            const card = PlatformUiAdapter.toDiscord({ title, body, buttons });
            return { response: card.embeds[0].description, embed: card.embeds[0], components: card.components, channelId, flags: 64 };
          } else if (action === 'dep_amt') {
            actionResult = await interactiveActionService.handlePoolDepositAction(entityId, user.id, parseFloat(extra));
          } else if (action === 'req_amt') {
            actionResult = await interactiveActionService.handlePoolRequestAction(entityId, user.id, parseFloat(extra));
          } else if (action === 'repay_amt') {
            const amount = parseFloat(parts[4] || extra || '50');
            actionResult = await interactiveActionService.handlePoolRepayAction(entityId, extra, user.id, amount);
          } else if (action === 'vote_yes' || action === 'approve') {
            actionResult = await interactiveActionService.handlePoolVoteAction(entityId, extra, user.id, true);
          } else if (action === 'vote_no' || action === 'reject') {
            actionResult = await interactiveActionService.handlePoolVoteAction(entityId, extra, user.id, false);
          }
        } else if (domain === 'ref') {
          if (action === 'copy') {
            return { response: `📋 **Invite Code:** \`${entityId}\` (Copied to Clipboard)`, channelId, flags: 64 };
          } else if (action === 'leaderboard') {
            const leaderboardText = await this.platformService.handleSocialMessage({ platform: 'discord', platformId: author.id, username: author.username, text: '/leaderboard' });
            const card = PlatformUiAdapter.toDiscord({ body: leaderboardText });
            return { response: leaderboardText, embed: card.embeds[0], components: card.components, channelId, flags: 64 };
          } else if (action === 'refresh') {
            const stats = await this.platformService.referralService.getUserReferralStats(user.id);
            const refCard = PlatformUiAdapter.toReferralCard({
              code: stats.code || user.username || user.discordId || user.id.slice(0, 8),
              shareUrl: stats.shareUrl,
              totalReferrals: stats.totalReferrals,
              totalPoints: stats.totalPoints,
              qrImageUrl: `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(stats.shareUrl)}`,
            });
            return { response: refCard.caption, embed: refCard.discordPayload.embeds[0], components: refCard.discordPayload.components, channelId, flags: 64 };
          }
        }
      }

      const response = actionResult.message || 'Action processed';
      const card = PlatformUiAdapter.toDiscord({ body: response });
      return { response, embed: card.embeds[0], components: card.components, channelId, flags: 64 };
    }

    let text = messageOrInteraction.content || '';
    if (isSlash) {
      text = DiscordBotDriver.buildCommandText(messageOrInteraction.data);
    }

    if (!text) return { response: '', channelId };

    const payload: SocialMessagePayload = {
      platform: 'discord',
      platformId: author.id,
      platformGroupId: channelId,
      username: author.username,
      text,
    };

    const isPrivateCommand =
      text.startsWith('/balance') ||
      text.startsWith('/wallet') ||
      text.startsWith('/history') ||
      text.startsWith('/keys') ||
      text.startsWith('/onboard') ||
      text.startsWith('/verify');

    if (text.startsWith('/referral') || text.startsWith('/invite')) {
      const user = await this.platformService.resolveCurrentUser(payload);
      if (user) {
        const stats = await this.platformService.referralService.getUserReferralStats(user.id);
        const refCard = PlatformUiAdapter.toReferralCard({
          code: stats.code || user.username || user.discordId || user.id.slice(0, 8),
          shareUrl: stats.shareUrl,
          totalReferrals: stats.totalReferrals,
          totalPoints: stats.totalPoints,
          qrImageUrl: `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(stats.shareUrl)}`,
        });
        return { response: refCard.caption, embed: refCard.discordPayload.embeds[0], components: refCard.discordPayload.components, channelId, flags: isSlash ? 64 : undefined };
      }
    }

    const response = await this.platformService.handleSocialMessage(payload);

    // For pools command, append action buttons
    const isPoolsCommand = text.startsWith('/pools') || text.startsWith('/pool');
    if (isPoolsCommand) {
      const card = PlatformUiAdapter.toDiscord({
        body: response,
        buttons: [
          [
            { label: '💰 Deposit', callbackId: 'pool_action:deposit', style: 'primary' },
            { label: '📥 Request Loan', callbackId: 'pool_action:request', style: 'primary' },
          ],
          [
            { label: '💳 Repay Loan', callbackId: 'pool_action:repay', style: 'primary' },
            { label: '👥 Invite Members', callbackId: 'pool_action:invite', style: 'secondary' },
          ],
        ],
      });
      return { response, embed: card.embeds[0], components: card.components, channelId, flags: (isSlash || isPrivateCommand) ? 64 : undefined };
    }

    const card = PlatformUiAdapter.toDiscord({ body: response });
    return { response, embed: card.embeds[0], components: card.components, channelId, flags: (isSlash || isPrivateCommand) ? 64 : undefined };
  }
}
