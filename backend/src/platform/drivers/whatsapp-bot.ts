import { Injectable, Inject, forwardRef, Logger, OnModuleInit } from '@nestjs/common';
import { PlatformService, SocialMessagePayload } from '../platform.service';
import { ContactsService } from '../../contacts/contacts.service';
import { getWhatsAppInteractiveListMenu, getWhatsAppButtonConfirmation } from '../templates/whatsapp-templates';
import { PlatformUiAdapter } from '../platform-ui.adapter';
import { sanitizeOutboundMessage } from '../../common/user-error.util';
import { isPlatformEnabled } from '../../config/platforms.config';

/**
 * Supported WhatsApp commands (mirroring Telegram command set):
 * - /start - Start VeriAgent Pay Dashboard
 * - /wallet - Open wallet dashboard
 * - /dashboard - Open web dashboard and manage session keys
 * - /balance - View token balances
 * - /history - View recent transactions
 * - /pay 50 USDC @alice - Send money
 * - /request 25 USDC @bob - Request money
 * - /contacts - View frequent contacts
 * - /save 100 USDC - Deposit to vault
 * - /split 120 @bob @charlie - Split a bill
 * - /envelope 50 5 - Send red envelope
 * - /referral - Refer friends & earn points
 * - /help or menu - Get help
 */
@Injectable()
export class WhatsAppBotDriver implements OnModuleInit {
  private readonly logger = new Logger(WhatsAppBotDriver.name);
  constructor(
    @Inject(forwardRef(() => PlatformService))
    private readonly platformService: PlatformService,
    private readonly contactsService: ContactsService,
  ) {}

  onModuleInit() {
    if (!isPlatformEnabled('whatsapp')) {
      this.logger.log('whatsapp is not in ENABLED_PLATFORMS; driver not registered.');
      return;
    }
    this.platformService.registerDriver('whatsapp', this);
  }

  async sendMessage(userId: string, text: string): Promise<void> {
    const safeText = sanitizeOutboundMessage(text);
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (!accessToken || !phoneNumberId) {
      this.logger.warn('WhatsApp credentials not configured, skipping message');
      return;
    }

    try {
      const response = await fetch(`https://graph.facebook.com/v18.0/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: userId,
          type: 'text',
          text: { body: safeText },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`WhatsApp API error: ${errorData.error?.message || response.statusText}`);
      }
    } catch (error: any) {
      this.logger.error(`Failed to send WhatsApp message: ${error.message}`);
      throw error;
    }
  }

  async sendImage(userId: string, imageUrl: string, caption?: string): Promise<void> {
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const safeCaption = caption ? sanitizeOutboundMessage(caption) : '';

    if (!accessToken || !phoneNumberId) {
      this.logger.warn('WhatsApp credentials not configured, skipping image');
      return;
    }

    try {
      const response = await fetch(`https://graph.facebook.com/v18.0/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: userId,
          type: 'image',
          image: {
            link: imageUrl,
            caption: safeCaption,
          },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`WhatsApp API error: ${errorData.error?.message || response.statusText}`);
      }
    } catch (error: any) {
      this.logger.error(`Failed to send WhatsApp image: ${error.message}`);
      throw error;
    }
  }

  async sendTemplate(userId: string, templateName: string, languageCode: string = 'en', components?: any[]): Promise<void> {
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (!accessToken || !phoneNumberId) {
      this.logger.warn('WhatsApp credentials not configured, skipping template');
      return;
    }

    try {
      const response = await fetch(`https://graph.facebook.com/v18.0/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: userId,
          type: 'template',
          template: {
            name: templateName,
            language: { code: languageCode },
            components: components || [],
          },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`WhatsApp API error: ${errorData.error?.message || response.statusText}`);
      }
    } catch (error: any) {
      this.logger.error(`Failed to send WhatsApp template: ${error.message}`);
      throw error;
    }
  }

  getInteractiveMainMenu(recipientPhone: string) {
    return getWhatsAppInteractiveListMenu(recipientPhone);
  }

  getSplitInteractiveMenu(recipientPhone: string, splitId: string, description: string, yourShare: number, token: string) {
    return {
      messaging_product: 'whatsapp',
      to: recipientPhone,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: `📊 *Bill Split: ${description}*\n\nYour Share: *${yourShare.toFixed(2)} ${token}*\n\nTap below to approve and pay your share.` },
        action: {
          buttons: [
            {
              type: 'reply',
              reply: { id: `split_pay_${splitId}`, title: `💳 Pay $${yourShare.toFixed(2)}` }
            }
          ]
        }
      }
    };
  }

  getButtonConfirmation(recipientPhone: string, title: string, bodyText: string, buttons: { id: string; title: string }[]) {
    return getWhatsAppButtonConfirmation(recipientPhone, title, bodyText, buttons);
  }

  async handleIncomingMessage(body: any): Promise<{ replyMessage: string; toPhoneNumber: string; interactivePayload?: any }> {
    const entry = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    const rawFrom = entry?.from || body.From || '';
    let text = entry?.text?.body || entry?.interactive?.list_reply?.id || entry?.interactive?.button_reply?.id || body.Body || '';
    const whatsappId = rawFrom.replace('whatsapp:', '');

    if (!text) {
      return { replyMessage: '', toPhoneNumber: whatsappId };
    }

    if (text === 'menu' || text === 'help') {
      return {
        replyMessage: 'Opening VeriAgent Pay Menu...',
        toPhoneNumber: whatsappId,
        interactivePayload: this.getInteractiveMainMenu(whatsappId)
      };
    }

    // "Send" or bare /pay — show contact suggestion buttons
    const lower = text.trim().toLowerCase();
    if (lower === 'send' || lower === '/pay') {
      const suggestions = await this.contactsService.getPaySuggestions(whatsappId, 3);
      if (suggestions.length > 0) {
        const buttons = suggestions.slice(0, 3).map((s) => ({
          id: `/pay 0 USDC @${s.identifier}`,
          title: `@${s.identifier}`,
        }));
        return {
          replyMessage: '',
          toPhoneNumber: whatsappId,
          interactivePayload: this.getButtonConfirmation(
            whatsappId,
            'Send Money',
            'Pick a recent contact or reply with the full command:\n/pay <amount> <token> @recipient',
            buttons,
          ),
        };
      } else {
        // No contacts found - provide usage instructions
        return {
          replyMessage: 'No recent contacts found.\n\nType recipient handle:\n/pay <amount> <token> @username\n\nExample: /pay 50 USDC @alice',
          toPhoneNumber: whatsappId,
        };
      }
    }

    // Pool action flow: pool_action_deposit, pool_action_request, pool_action_invite
    if (lower.startsWith('pool_action_') || text.startsWith('pool_action:')) {
      const subAction = lower.replace('pool_action_', '').replace('pool_action:', '');
      const user = await this.platformService.resolveCurrentUser({ platform: 'whatsapp', platformId: whatsappId, username: whatsappId });
      if (!user) {
        return { replyMessage: '⚠️ Please set up your wallet first.', toPhoneNumber: whatsappId };
      }

      const interactiveActionService = this.platformService.getInteractiveActionService?.();
      if (!interactiveActionService) {
        return { replyMessage: '❌ Service unavailable.', toPhoneNumber: whatsappId };
      }

      const pools = await interactiveActionService.getUserPools(user.id);
      if (!pools || pools.length === 0) {
        return { replyMessage: '❌ You are not a member of any pools yet.\n\n👉 Create a pool or ask to be invited!', toPhoneNumber: whatsappId };
      }

      // If pools > 3, use List Message; otherwise use 3 reply buttons
      let title = '';
      const buttons: any[][] = [];

      if (subAction === 'deposit') {
        title = '💰 Select a pool to deposit:';
        pools.forEach((p: any) => {
          buttons.push([{ label: `${p.name} (${p.poolBalance || 0} ${p.token})`, callbackId: `pool:dep_select:${p.id}` }]);
        });
      } else if (subAction === 'request') {
        title = '📥 Select a pool for a loan:';
        pools.forEach((p: any) => {
          buttons.push([{ label: `${p.name} (${p.poolBalance || 0} ${p.token})`, callbackId: `pool:req_select:${p.id}` }]);
        });
      } else if (subAction === 'repay') {
        title = '💳 Select a pool to settle your loan:';
        pools.forEach((p: any) => {
          buttons.push([{ label: `💳 ${p.name}`, callbackId: `pool:repay_select:${p.id}` }]);
        });
      } else if (subAction === 'invite') {
        title = '👥 Select a pool to invite to:';
        pools.forEach((p: any) => {
          buttons.push([{ label: `${p.name} (${p.members?.length || 0} members)`, callbackId: `pool:inv_select:${p.id}` }]);
        });
      }

      const waPayload = PlatformUiAdapter.toWhatsApp(whatsappId, { title, body: title, buttons });
      return {
        replyMessage: '',
        toPhoneNumber: whatsappId,
        interactivePayload: waPayload.interactive,
      };
    }

    const cb = text.replace(/^env_/, 'env:').replace(/^split_/, 'split:').replace(/^req_/, 'req:').replace(/^pool_/, 'pool:').replace(/^vault_/, 'vault:').replace(/^sub_/, 'sub:');
    if (cb.startsWith('env:') || cb.startsWith('split:') || cb.startsWith('req:') || cb.startsWith('pool:') || cb.startsWith('vault:') || cb.startsWith('sub:') || cb.startsWith('ref:')) {
      const user = await this.platformService.resolveCurrentUser({ platform: 'whatsapp', platformId: whatsappId, username: whatsappId });
      if (!user) {
        return { replyMessage: '⚠️ Please set up your wallet first.', toPhoneNumber: whatsappId };
      }

      const parts = cb.split(':');
      const domain = parts[0];
      const action = parts[1];
      const entityId = parts[2];
      const extra = parts[3];

      if (domain === 'ref') {
        if (action === 'copy') {
          return { replyMessage: `📋 *Invite Code:* \`${entityId}\` (Copied to Clipboard)`, toPhoneNumber: whatsappId };
        } else if (action === 'leaderboard') {
          const leaderboardText = await this.platformService.handleSocialMessage({ platform: 'whatsapp', platformId: whatsappId, username: whatsappId, text: '/leaderboard' });
          return { replyMessage: leaderboardText, toPhoneNumber: whatsappId };
        } else if (action === 'refresh') {
          const stats = await this.platformService.referralService.getUserReferralStats(user.id);
          const refCard = PlatformUiAdapter.toReferralCard({
            code: stats.code || user.username || user.whatsappId || user.id.slice(0, 8),
            shareUrl: stats.shareUrl,
            totalReferrals: stats.totalReferrals,
            totalPoints: stats.totalPoints,
            qrImageUrl: `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(stats.shareUrl)}`,
          });
          return { replyMessage: '', toPhoneNumber: whatsappId, interactivePayload: refCard.whatsappPayload(whatsappId) };
        }
      }

      let actionResult: any = { success: false, message: 'Unknown action' };
      const interactiveActionService = this.platformService.getInteractiveActionService?.();

      if (interactiveActionService) {
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
          if (action === 'dep_select') {
            return {
              replyMessage: '',
              toPhoneNumber: whatsappId,
              interactivePayload: this.getButtonConfirmation(
                whatsappId,
                '💰 Pool Deposit',
                'Pick a quick deposit amount (or type command: /pool deposit <poolId> <amount>):',
                [
                  { id: `pool:dep_amt:${entityId}:10`, title: '💵 $10' },
                  { id: `pool:dep_amt:${entityId}:50`, title: '💵 $50' },
                  { id: `pool:dep_amt:${entityId}:100`, title: '💵 $100' },
                ]
              )
            };
          } else if (action === 'req_select') {
            return {
              replyMessage: '',
              toPhoneNumber: whatsappId,
              interactivePayload: this.getButtonConfirmation(
                whatsappId,
                '📥 Loan Request',
                'Pick a quick loan amount (or type command: /pool request <poolId> <amount>):',
                [
                  { id: `pool:req_amt:${entityId}:50`, title: '📥 $50' },
                  { id: `pool:req_amt:${entityId}:100`, title: '📥 $100' },
                  { id: `pool:req_amt:${entityId}:250`, title: '📥 $250' },
                ]
              )
            };
          } else if (action === 'repay_select') {
            return {
              replyMessage: '',
              toPhoneNumber: whatsappId,
              interactivePayload: this.getButtonConfirmation(
                whatsappId,
                '💳 Repay Loan',
                'Pick a loan settlement amount:',
                [
                  { id: `pool:repay_amt:${entityId}:loan:50`, title: '💳 Settle Full ($50)' },
                  { id: `pool:repay_amt:${entityId}:loan:25`, title: '💵 $25' },
                  { id: `pool:repay_amt:${entityId}:loan:10`, title: '💵 $10' },
                ]
              )
            };
          } else if (action === 'dep_amt') {
            actionResult = await interactiveActionService.handlePoolDepositAction(entityId, user.id, parseFloat(extra));
          } else if (action === 'req_amt') {
            actionResult = await interactiveActionService.handlePoolRequestAction(entityId, user.id, parseFloat(extra));
          } else if (action === 'repay_amt') {
            const amount = parseFloat(parts[4] || extra || '50');
            actionResult = await interactiveActionService.handlePoolRepayAction(entityId, extra, user.id, amount);
          } else if (action === 'vote_yes' || action === 'approve') actionResult = await interactiveActionService.handlePoolVoteAction(entityId, extra, user.id, true);
          else if (action === 'vote_no' || action === 'reject') actionResult = await interactiveActionService.handlePoolVoteAction(entityId, extra, user.id, false);
        }
      }

      const replyMessage = actionResult.message || 'Action processed';
      return { replyMessage, toPhoneNumber: whatsappId };
    }

    if (lower.startsWith('/referral') || lower.startsWith('/invite') || lower === 'referral' || lower === '🎁 refer & earn') {
      const user = await this.platformService.resolveCurrentUser({ platform: 'whatsapp', platformId: whatsappId, username: whatsappId });
      if (user) {
        const stats = await this.platformService.referralService.getUserReferralStats(user.id);
        const refCard = PlatformUiAdapter.toReferralCard({
          code: stats.code || user.username || user.whatsappId || user.id.slice(0, 8),
          shareUrl: stats.shareUrl,
          totalReferrals: stats.totalReferrals,
          totalPoints: stats.totalPoints,
          qrImageUrl: `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(stats.shareUrl)}`,
        });
        return { replyMessage: '', toPhoneNumber: whatsappId, interactivePayload: refCard.whatsappPayload(whatsappId) };
      }
    }

    const payload: SocialMessagePayload = {
      platform: 'whatsapp',
      platformId: whatsappId,
      username: whatsappId,
      text,
    };

    // For pools command, show interactive buttons
    const isPoolsCommand = lower === '/pools' || lower === '/pool' || lower === 'pools' || lower === '👥 pools' || lower === '🏦 group pools';
    if (isPoolsCommand) {
      const replyMessage = await this.platformService.handleSocialMessage(payload);
      return {
        replyMessage,
        toPhoneNumber: whatsappId,
        interactivePayload: this.getButtonConfirmation(
          whatsappId,
          'Pool Actions',
          `${replyMessage}\n\nChoose an action:`,
          [
            { id: 'pool_action_deposit', title: '💰 Deposit' },
            { id: 'pool_action_request', title: '📥 Request Loan' },
            { id: 'pool_action_invite', title: '👥 Invite' },
          ]
        ),
      };
    }

    const replyMessage = await this.platformService.handleSocialMessage(payload);
    return { replyMessage, toPhoneNumber: whatsappId };
  }
}
