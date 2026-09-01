import { Injectable, Inject, forwardRef, Logger, OnModuleInit } from '@nestjs/common';
import { PlatformService, SocialMessagePayload } from '../platform.service';
import { ShortLinksService } from '../../shortlinks/shortlinks.service';
import { getAppBaseUrl } from '../../config/app-url.config';
import { PlatformUiAdapter } from '../platform-ui.adapter';
import { sanitizeOutboundMessage } from '../../common/user-error.util';
import { isPlatformEnabled } from '../../config/platforms.config';

export interface SlackCommandPayload {
  command: string;
  text: string;
  user_id: string;
  user_name: string;
  channel_id: string;
  trigger_id: string;
}

export interface SlackViewSubmissionPayload {
  type: 'view_submission';
  user: { id: string; username: string };
  view: {
    state: {
      values: {
        recipient_block: { recipient_input: { value: string } };
        amount_block: { amount_input: { value: string } };
        token_block?: { token_input?: { selected_option?: { value: string } } };
        note_block?: { note_input?: { value: string } };
      };
    };
  };
}

/**
 * Supported commands via /veriagent-pay slash command:
 * - /veriagent-pay - Opens payment modal
 * - /veriagent-pay start - Start VeriAgent Pay Dashboard
 * - /veriagent-pay wallet - Open wallet dashboard
 * - /veriagent-pay dashboard - Open web dashboard and manage session keys
 * - /veriagent-pay balance - View token balances
 * - /veriagent-pay history - View recent transactions
 * - /veriagent-pay pay 50 @alice USDC - Send money
 * - /veriagent-pay request 25 @bob USDC - Request money
 * - /veriagent-pay contacts - View frequent contacts
 * - /veriagent-pay save 100 USDC - Deposit to vault
 * - /veriagent-pay split 120 @bob @charlie - Split a bill
 * - /veriagent-pay envelope 50 5 - Send red envelope
 * - /veriagent-pay referral - Refer friends & earn points
 * - /veriagent-pay help - Get help
 */
@Injectable()
export class SlackBotDriver implements OnModuleInit {
  private readonly logger = new Logger(SlackBotDriver.name);

  constructor(
    @Inject(forwardRef(() => PlatformService))
    private readonly platformService: PlatformService,
    private readonly shortLinksService?: ShortLinksService
  ) {}

  onModuleInit() {
    if (!isPlatformEnabled('slack')) {
      this.logger.log('slack is not in ENABLED_PLATFORMS; driver not registered.');
      return;
    }
    this.platformService.registerDriver('slack', this);
  }

  buildSplitBlockKitCard(split: any, appUrl: string) {
    return PlatformUiAdapter.toSlack({
      title: `📊 Bill Split: ${split.description || 'Group Split'}`,
      body: `*Total Bill:* $${split.totalAmount} ${split.token || 'USDC'}\n*Collection:* ${split.participants?.filter((p: any) => p.hasPaid).length || 0} of ${split.participants?.length || 1} paid`,
      buttons: [
        [
          { label: `💳 Pay Share ($${(split.yourShare || 0).toFixed(2)})`, callbackId: `split:pay:${split.id}`, style: 'primary' },
          { label: '📊 View Details', url: `${appUrl}/splits/${split.id}`, style: 'secondary' },
        ],
      ],
    });
  }

  async handleBlockAction(payload: any): Promise<{ responseText: string; blocks?: any[] }> {
    const userSlackId = payload.user?.id;
    const username = payload.user?.username || payload.user?.name;
    const action = payload.actions?.[0];
    const callbackId = action?.value || action?.action_id;

    if (!callbackId) return { responseText: 'No action found' };

    const user = await this.platformService.resolveCurrentUser({ platform: 'slack', platformId: userSlackId, username });
    if (!user) {
      return { responseText: '⚠️ Please set up your wallet first.' };
    }

    const cb = callbackId.replace(/^env_/, 'env:').replace(/^split_/, 'split:').replace(/^req_/, 'req:').replace(/^pool_/, 'pool:');
    const parts = cb.split(':');
    const domain = parts[0];
    const act = parts[1];
    const entityId = parts[2];
    const extra = parts[3];

    let actionResult: any = { success: false, message: 'Unknown action' };
    const interactiveActionService = this.platformService.getInteractiveActionService?.();

    if (interactiveActionService) {
      // Pool action flow: deposit/request/invite → show user's pools as buttons
      if (callbackId.startsWith('pool_action:')) {
        const subAction = callbackId.split(':')[1];
        const pools = await interactiveActionService.getUserPools(user.id);

        if (!pools || pools.length === 0) {
          return { responseText: '❌ You are not a member of any pools yet.\n\n👉 Create a pool or ask to be invited!' };
        }

        let title = '';
        const buttons: any[][] = [];

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
          title = '💳 Select a pool to settle your active loan:';
          pools.forEach((p: any) => {
            buttons.push([{ label: `💳 ${p.name}`, callbackId: `pool:repay_select:${p.id}`, style: 'primary' }]);
          });
        } else if (subAction === 'invite') {
          title = '👥 Select a pool to invite members:';
          pools.forEach((p: any) => {
            buttons.push([{ label: `${p.name} (${p.members?.length || 0} members)`, callbackId: `pool:inv_select:${p.id}`, style: 'secondary' }]);
          });
        }

        const slackPayload = PlatformUiAdapter.toSlack({ title, body: title, buttons });
        return { responseText: title, blocks: slackPayload.blocks };
      }

      if (domain === 'req') {
        if (act === 'pay') actionResult = await interactiveActionService.handleRequestPaymentAction(entityId, user.id);
        else if (act === 'decline') actionResult = await interactiveActionService.handleRequestDeclineAction(entityId, user.id);
        else if (act === 'nudge') actionResult = await interactiveActionService.handleRequestNudgeAction(entityId, user.id);
      } else if (domain === 'split') {
        if (act === 'pay' || act === 'pay_share') actionResult = await interactiveActionService.handleSplitPaymentAction(entityId, user.id);
        else if (act === 'ping') actionResult = await interactiveActionService.handleSplitPingAction(entityId, user.id);
      } else if (domain === 'env') {
        if (act === 'claim') actionResult = await interactiveActionService.handleEnvelopeClaimAction(entityId, user.id);
        else if (act === 'cancel' || act === 'refund') actionResult = await interactiveActionService.handleEnvelopeCancelAction(entityId, user.id);
      } else if (domain === 'vault') {
        if (act === 'save' || act === 'deposit') {
          actionResult = await interactiveActionService.handleVaultDepositAction(user.id, parseFloat(entityId || '50'));
        } else if (act === 'withdraw') {
          actionResult = await interactiveActionService.handleVaultWithdrawAction(user.id, parseFloat(entityId || '50'));
        }
      } else if (domain === 'sub') {
        if (act === 'cancel') {
          actionResult = await interactiveActionService.handleSubscriptionCancelAction(entityId, user.id);
        }
      } else if (domain === 'pool') {
        if (act === 'dep_select' || act === 'req_select' || act === 'repay_select') {
          const isDeposit = act === 'dep_select';
          const isRepay = act === 'repay_select';
          const slackPayload = PlatformUiAdapter.toSlack({
            title: isDeposit ? '💰 Select Deposit Amount' : isRepay ? '💳 Select Repay Amount' : '📥 Select Loan Amount',
            body: isDeposit ? 'Choose a preset deposit amount:' : isRepay ? 'Choose loan repayment amount:' : 'Choose a preset loan request amount:',
            buttons: isDeposit ? [
              [
                { label: '💵 $10', callbackId: `pool:dep_amt:${entityId}:10`, style: 'primary' },
                { label: '💵 $50', callbackId: `pool:dep_amt:${entityId}:50`, style: 'primary' },
                { label: '💵 $100', callbackId: `pool:dep_amt:${entityId}:100`, style: 'primary' },
              ]
            ] : isRepay ? [
              [
                { label: '💳 Settle Full ($50)', callbackId: `pool:repay_amt:${entityId}:loan:50`, style: 'primary' },
                { label: '💵 $25', callbackId: `pool:repay_amt:${entityId}:loan:25`, style: 'primary' },
              ]
            ] : [
              [
                { label: '📥 $50', callbackId: `pool:req_amt:${entityId}:50`, style: 'primary' },
                { label: '📥 $100', callbackId: `pool:req_amt:${entityId}:100`, style: 'primary' },
                { label: '📥 $250', callbackId: `pool:req_amt:${entityId}:250`, style: 'primary' },
              ]
            ]
          });
          return { responseText: isDeposit ? 'Select Deposit Amount' : isRepay ? 'Select Repay Amount' : 'Select Loan Amount', blocks: slackPayload.blocks };
        } else if (act === 'dep_amt') {
          actionResult = await interactiveActionService.handlePoolDepositAction(entityId, user.id, parseFloat(extra));
        } else if (act === 'req_amt') {
          actionResult = await interactiveActionService.handlePoolRequestAction(entityId, user.id, parseFloat(extra));
        } else if (act === 'repay_amt') {
          const amount = parseFloat(parts[4] || extra || '50');
          actionResult = await interactiveActionService.handlePoolRepayAction(entityId, extra, user.id, amount);
        } else if (act === 'vote_yes' || act === 'approve') {
          actionResult = await interactiveActionService.handlePoolVoteAction(entityId, extra, user.id, true);
        } else if (act === 'vote_no' || act === 'reject') {
          actionResult = await interactiveActionService.handlePoolVoteAction(entityId, extra, user.id, false);
        }
      } else if (domain === 'ref') {
        if (act === 'copy') {
          return { responseText: `📋 *Invite Code:* \`${entityId}\` (Copied to Clipboard)` };
        } else if (act === 'leaderboard') {
          const leaderboardText = await this.platformService.handleSocialMessage({ platform: 'slack', platformId: userSlackId, username, text: '/leaderboard' });
          const slackPayload = PlatformUiAdapter.toSlack({ body: leaderboardText });
          return { responseText: leaderboardText, blocks: slackPayload.blocks };
        } else if (act === 'refresh') {
          const stats = await this.platformService.referralService.getUserReferralStats(user.id);
          const refCard = PlatformUiAdapter.toReferralCard({
            code: stats.code || user.username || user.slackId || user.id.slice(0, 8),
            shareUrl: stats.shareUrl,
            totalReferrals: stats.totalReferrals,
            totalPoints: stats.totalPoints,
            qrImageUrl: `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(stats.shareUrl)}`,
          });
          return { responseText: refCard.caption, blocks: refCard.slackPayload.blocks };
        }
      }
    }

    const responseText = actionResult.message || 'Action processed';
    const slackPayload = PlatformUiAdapter.toSlack({ body: responseText });
    return { responseText, blocks: slackPayload.blocks };
  }

  async sendEphemeralMessage(channelId: string, userId: string, text: string, blocks?: any[]): Promise<void> {
    const safeText = sanitizeOutboundMessage(text);
    const botToken = process.env.SLACK_BOT_TOKEN;

    if (!botToken) {
      this.logger.warn('SLACK_BOT_TOKEN not configured, skipping Slack ephemeral message');
      return;
    }

    try {
      const payloadBlocks = blocks || PlatformUiAdapter.toSlack({ body: safeText }).blocks;
      const response = await fetch('https://slack.com/api/chat.postEphemeral', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${botToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          channel: channelId,
          user: userId,
          text: safeText,
          blocks: payloadBlocks,
        }),
      });

      if (!response.ok) {
        throw new Error(`Slack API error: ${response.statusText}`);
      }
    } catch (error: any) {
      this.logger.error(`Failed to send Slack ephemeral message: ${error.message}`);
    }
  }

  async sendMessage(userId: string, text: string): Promise<void> {
    const safeText = sanitizeOutboundMessage(text);
    const botToken = process.env.SLACK_BOT_TOKEN;

    if (!botToken) {
      this.logger.warn('SLACK_BOT_TOKEN not configured, skipping Slack DM');
      return;
    }

    try {
      const slackPayload = PlatformUiAdapter.toSlack({ body: safeText });

      const response = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${botToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          channel: userId,
          text: safeText,
          blocks: slackPayload.blocks,
        }),
      });

      if (!response.ok) {
        throw new Error(`Slack API error: ${response.statusText}`);
      }

      const data = await response.json();
      if (!data.ok) {
        throw new Error(`Slack API error: ${data.error}`);
      }
    } catch (error: any) {
      this.logger.error(`Failed to send Slack message: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generates Slack Block Kit message with WebAuthn PWA authorization link
   */
  async buildBlockKitPaymentLink(amount: string, recipient: string, memo: string, sender: string): Promise<any> {
    const baseUrl = getAppBaseUrl();
    let code = `s_${Date.now().toString(36)}`;

    if (this.shortLinksService) {
      try {
        const link = await this.shortLinksService.create({
          kind: 'pay',
          amount: parseFloat(amount) || 0,
          token: 'USDC',
          fromUser: sender,
          platform: 'slack',
          toAddress: recipient,
        });
        code = link.code;
      } catch (err: any) {
        // If link creation fails, retry once
        this.logger.warn(`Short link creation failed, retrying: ${err.message}`);
        try {
          const retryLink = await this.shortLinksService.create({
            kind: 'pay',
            amount: parseFloat(amount) || 0,
            token: 'USDC',
            fromUser: sender,
            platform: 'slack',
            toAddress: recipient,
          });
          code = retryLink.code;
        } catch (retryErr: any) {
          this.logger.error(`Short link creation failed after retry: ${retryErr.message}`);
          throw new Error('Failed to create payment link. Please try again.');
        }
      }
    }

    const claimUrl = `${baseUrl}/c/${code}`;

    return {
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `💸 *VeriAgent Pay Payment Link Created*\n\n*Amount:* $${amount} USDC\n*To:* ${recipient}\n*From:* @${sender}${memo ? `\n*Note:* ${memo}` : ''}`
          }
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: '🔐 Claim & Sign with Passkey'
              },
              url: claimUrl,
              style: 'primary'
            }
          ]
        }
      ]
    };
  }

  /**
   * Constructs Slack Bolt view modal payload for views.open API
   */
  getPaymentModal(triggerId: string) {
    return {
      trigger_id: triggerId,
      view: {
        type: 'modal',
        callback_id: 'payment_modal_submit',
        title: { type: 'plain_text', text: 'VeriAgent Pay' },
        submit: { type: 'plain_text', text: 'Generate Sign Link' },
        close: { type: 'plain_text', text: 'Cancel' },
        blocks: [
          {
            type: 'input',
            block_id: 'recipient_block',
            label: { type: 'plain_text', text: 'Recipient (@username or wallet address)' },
            element: { type: 'plain_text_input', action_id: 'recipient_input', placeholder: { type: 'plain_text', text: '@alice' } }
          },
          {
            type: 'input',
            block_id: 'amount_block',
            label: { type: 'plain_text', text: 'Amount' },
            element: { type: 'plain_text_input', action_id: 'amount_input', placeholder: { type: 'plain_text', text: '50.00' } }
          },
          {
            type: 'input',
            block_id: 'token_block',
            label: { type: 'plain_text', text: 'Token' },
            element: {
              type: 'static_select',
              action_id: 'token_input',
              initial_option: {
                text: { type: 'plain_text', text: 'USDC' },
                value: 'USDC',
              },
              options: [
                { text: { type: 'plain_text', text: 'USDC' }, value: 'USDC' },
                { text: { type: 'plain_text', text: 'USDT' }, value: 'USDT' },
                { text: { type: 'plain_text', text: 'BOT' }, value: 'BOT' },
              ],
            },
          },
          {
            type: 'input',
            block_id: 'note_block',
            optional: true,
            label: { type: 'plain_text', text: 'Payment Note / Memo' },
            element: { type: 'plain_text_input', action_id: 'note_input', placeholder: { type: 'plain_text', text: 'Dinner split' } }
          }
        ]
      }
    };
  }

  /**
   * Handle incoming Slack Slash Command /veriagent-pay
   */
  async handleSlashCommand(payload: SlackCommandPayload): Promise<{ responseText: string; modal?: any }> {
    const text = payload.text.trim();

    if (!text) {
      // Return modal configuration if command text is empty
      return {
        responseText: 'Opening VeriAgent Pay Modal...',
        modal: this.getPaymentModal(payload.trigger_id)
      };
    }

    // Parse command: /veriagent-pay <subcommand> <args>
    const parts = text.split(/\s+/);
    const subcommand = parts[0].toLowerCase();

    // Map Slack subcommands to standard command format
    let commandText = text;
    if (!text.startsWith('/')) {
      // Add / prefix for standard commands
      if (['start', 'wallet', 'dashboard', 'balance', 'history', 'pay', 'request', 'contacts', 'save', 'split', 'envelope', 'pools', 'pool', 'referral', 'help'].includes(subcommand)) {
        commandText = `/${text}`;
      } else {
        // Default to pay command if no recognized subcommand
        commandText = `/pay ${text}`;
      }
    }

    const socialPayload: SocialMessagePayload = {
      platform: 'slack',
      platformId: payload.user_id,
      platformGroupId: payload.channel_id,
      username: payload.user_name,
      text: commandText,
    };

    if (subcommand === 'referral' || text.startsWith('/referral') || text.startsWith('/invite')) {
      const user = await this.platformService.resolveCurrentUser(socialPayload);
      if (user) {
        const stats = await this.platformService.referralService.getUserReferralStats(user.id);
        const refCard = PlatformUiAdapter.toReferralCard({
          code: stats.code || user.username || user.slackId || user.id.slice(0, 8),
          shareUrl: stats.shareUrl,
          totalReferrals: stats.totalReferrals,
          totalPoints: stats.totalPoints,
          qrImageUrl: `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(stats.shareUrl)}`,
        });
        return { responseText: refCard.caption, modal: undefined };
      }
    }

    const responseText = await this.platformService.handleSocialMessage(socialPayload);

    // For pools command, return with action buttons
    const isPoolsCommand = subcommand === 'pools' || subcommand === 'pool';
    if (isPoolsCommand) {
      const slackPayload = PlatformUiAdapter.toSlack({
        body: responseText,
        buttons: [
          [
            { label: '💰 Deposit', callbackId: 'pool_action:deposit', style: 'primary' },
            { label: '📥 Request Loan', callbackId: 'pool_action:request', style: 'primary' },
            { label: '👥 Invite Members', callbackId: 'pool_action:invite', style: 'secondary' },
          ],
        ],
      });
      return { responseText, blocks: slackPayload.blocks } as any;
    }

    return { responseText };
  }

  /**
   * Handle Slack Modal View Submissions
   */
  async handleViewSubmission(payload: SlackViewSubmissionPayload): Promise<{ responseText: string }> {
    const values = payload.view.state.values;
    const rawRecipient = String(values.recipient_block.recipient_input.value || '').trim();
    const amount = values.amount_block.amount_input.value;
    const token = values.token_block?.token_input?.selected_option?.value || 'USDC';
    const memo = values.note_block?.note_input?.value || '';

    // Parser grammar is /pay <amount> <token> <@recipient> — the token slot must
    // be present, otherwise the recipient is read as the token.
    const recipient = rawRecipient.startsWith('@') ? rawRecipient : `@${rawRecipient}`;
    const text = `/pay ${amount} ${token} ${recipient} ${memo}`.trim();

    const socialPayload: SocialMessagePayload = {
      platform: 'slack',
      platformId: payload.user.id,
      username: payload.user.username,
      text,
    };

    const responseText = await this.platformService.handleSocialMessage(socialPayload);
    return { responseText };
  }
}
