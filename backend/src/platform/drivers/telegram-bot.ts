import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Inject, forwardRef } from '@nestjs/common';
import { PlatformService, SocialMessagePayload } from '../platform.service';
import { BotSessionService } from '../sessions/bot-session.service';
import { NlpService } from '../../nlp/nlp.service';
import { IdentityService } from '../../identity/identity.service';
import { ShortLinksService } from '../../shortlinks/shortlinks.service';
import { EscrowService } from '../../escrow/escrow.service';
import { ContactsService } from '../../contacts/contacts.service';
import { getAppBaseUrl } from '../../config/app-url.config';
import { BotQueueService } from '../bot-queue.service';
import { HotStateService } from '../../core/hot-state.service';
import { InteractiveActionService } from '../interactive-action.service';
import { ConversationStateService } from '../conversation-state.service';
import { PlatformUiAdapter } from '../platform-ui.adapter';
import axios, { AxiosInstance } from 'axios';
import * as http from 'http';
import * as https from 'https';
import { isProvisionalPlatformId } from '../../config/provisional-identity';
import { RedisService } from '../../core/redis.service';
import { sanitizeOutboundMessage } from '../../common/user-error.util';
import { TELEGRAM_WEBHOOK_SECRET } from '../../config/secrets';
import {
  PendingTelegramLink,
  normalizeTelegramUsername,
  pendingTelegramLinkKey,
} from '../../account/telegram-link-state';

export interface TelegramBotCommands {
  command: string;
  description: string;
}

export const TELEGRAM_BOT_COMMANDS: TelegramBotCommands[] = [
  { command: 'start', description: 'Start VeriAgent Pay Dashboard & Wallet' },
  { command: 'wallet', description: 'Open wallet dashboard & passkey controls' },
  { command: 'dashboard', description: 'Open the VeriAgent Pay web dashboard' },
  { command: 'balance', description: 'View your SOL and USDC balances on Solana' },
  { command: 'history', description: 'View recent transactions & activity history' },
  { command: 'pay', description: 'Send money: /pay 50 USDC @alice' },
  { command: 'request', description: 'Request money: /request 25 USDC @bob' },
  { command: 'contacts', description: 'View your frequent contacts' },
  { command: 'save', description: 'Deposit to yield vault: /save 100 USDC' },
  { command: 'split', description: 'Split a bill: /split 120 @bob @charlie' },
  { command: 'envelope', description: 'Send a red envelope: /envelope 50 5' },
  { command: 'referral', description: 'Refer friends & earn VERI points' },
  { command: 'help', description: 'Get help and natural language examples' },
];

export const PERSISTENT_REPLY_KEYBOARD = {
  keyboard: [
    [{ text: '💸 Send' }, { text: '📥 Request' }, { text: '📜 History' }],
    [{ text: '🏦 Vaults' }, { text: '🧧 Envelopes' }, { text: '👥 Pools' }],
    [{ text: '💳 Wallet' }, { text: 'ℹ️ Help' }],
  ],
  resize_keyboard: true,
  one_time_keyboard: false,
};

const TELEGRAM_API_BASE_URL = process.env.TELEGRAM_API_BASE_URL || 'https://api.telegram.org';

@Injectable()
export class TelegramBotDriver implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramBotDriver.name);
  private isPolling = false;
  private pollingOffset = 0;
  private readonly httpClient: AxiosInstance;
  private readonly pollingClient: AxiosInstance;

  constructor(
    @Inject(forwardRef(() => PlatformService))
    private readonly platformService: PlatformService,
    private readonly sessionService: BotSessionService,
    private readonly nlpService: NlpService,
    private readonly identityService: IdentityService,
    private readonly shortLinksService: ShortLinksService,
    private readonly escrowService: EscrowService,
    private readonly contactsService: ContactsService,
    private readonly botQueueService: BotQueueService,
    private readonly interactiveActionService: InteractiveActionService,
    private readonly conversationStateService: ConversationStateService,
    private readonly redis: RedisService,
    @Inject(forwardRef(() => HotStateService))
    private readonly hotStateService?: HotStateService
  ) {
    // HTTP Keep-Alive & Connection Pooling for outbound Telegram API calls
    const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 100, maxFreeSockets: 20 });
    const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 100, maxFreeSockets: 20 });

    this.httpClient = axios.create({
      baseURL: TELEGRAM_API_BASE_URL,
      timeout: 5000,
      httpAgent,
      httpsAgent,
    });

    // Separate client for long-polling with a 35s timeout (Telegram long-poll is 30s)
    this.pollingClient = axios.create({
      baseURL: TELEGRAM_API_BASE_URL,
      timeout: 35000,
      httpAgent,
      httpsAgent,
    });
  }

  async onModuleInit() {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      this.logger.warn('TELEGRAM_BOT_TOKEN not provided. Telegram bot integration dormant.');
      return;
    }

    const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL;

    this.logger.log('Initializing Telegram Bot Driver (Connection Pooled HTTP & Async Queues)...');
    await this.setBotCommands(token);
    this.platformService.registerDriver('telegram', this);

    if (webhookUrl) {
      // PRODUCTION: Set webhook so Telegram pushes updates to our public endpoint
      await this.setWebhook(token, webhookUrl);
      this.logger.log(`Telegram webhook set to: ${webhookUrl}`);
    } else {
      // LOCAL DEV: Delete any existing webhook and start long-polling loop.
      // Guard with a Redis lock so two server instances don't both long-poll the
      // same token — Telegram returns 409 and one of them swallows every update.
      const lockAcquired = await this.redis.claimOnce('telegram:polling-lock', 120);
      if (!lockAcquired) {
        this.logger.warn(
          'Another instance already holds the Telegram polling lock. Skipping poll start to avoid 409 conflict.',
        );
        return;
      }
      await this.deleteWebhook(token);
      this.isPolling = true;
      this.startPollingLoop(token);
      this.logger.log('Telegram long-polling loop started (local development mode).');
    }
  }

  private async setWebhook(token: string, url: string) {
    try {
      await this.httpClient.post(`/bot${token}/setWebhook`, {
        url,
        allowed_updates: ['message', 'callback_query'],
        ...(TELEGRAM_WEBHOOK_SECRET ? { secret_token: TELEGRAM_WEBHOOK_SECRET } : {}),
      });
    } catch (err: any) {
      this.logger.error(`Failed to set Telegram webhook: ${err.message}`);
    }
  }

  private async deleteWebhook(token: string) {
    try {
      await this.httpClient.post(`/bot${token}/deleteWebhook`, { drop_pending_updates: true });
    } catch (err: any) {
      this.logger.warn(`Failed to clear Telegram webhook: ${err.message}`);
    }
  }

  onModuleDestroy() {
    this.isPolling = false;
    this.logger.log('Telegram polling stopped.');
  }

  private async setBotCommands(token: string) {
    try {
      await this.httpClient.post(`/bot${token}/setMyCommands`, {
        commands: TELEGRAM_BOT_COMMANDS,
      });
    } catch (err: any) {
      this.logger.warn(`Failed to set Telegram commands menu: ${err.message}`);
    }
  }

  // ─── LONG-POLLING LOOP (LOCAL DEV) ──────────────────────────────────────────

  private async startPollingLoop(token: string) {
    while (this.isPolling) {
      try {
        const res = await this.pollingClient.post(`/bot${token}/getUpdates`, {
          offset: this.pollingOffset,
          timeout: 30,
          allowed_updates: ['message', 'callback_query'],
        });

        // Refresh the distributed lock so it doesn't expire mid-session.
        // Telegram long-poll takes up to 30s, so a 120s TTL refreshed here
        // keeps the lock alive as long as this instance is actively polling.
        await this.redis.setValue('telegram:polling-lock', '1', 120);

        const updates = res.data?.result || [];

        for (const update of updates) {
          // Advance offset so Telegram doesn't resend this update
          this.pollingOffset = update.update_id + 1;

          // Process each update asynchronously (don't block the polling loop)
          this.processUpdate(update).catch((err) => {
            this.logger.error(`Error processing update ${update.update_id}: ${err.message}`);
          });
        }
      } catch (err: any) {
        if (this.isPolling) {
          this.logger.warn(`Polling error (will retry in 2s): ${err.message}`);
          await this.sleep(2000);
        }
      }
    }
  }

  /**
   * Process a single Telegram update from the polling loop.
   * Reuses the same tiered logic as the webhook handler, but
   * sends the response directly since there's no HTTP response to return.
   */
  private async processUpdate(update: any): Promise<void> {
    // Deduplication guard: skip already-processed updates
    const updateId = update.update_id;
    if (!(await this.redis.claimOnce(`webhook:telegram:${updateId}`, 24 * 60 * 60))) {
      this.logger.debug(`[Dedup] Skipping already-processed update ${updateId}`);
      return;
    }

    const startNs = process.hrtime.bigint();

    // Handle callback queries (inline button clicks) separately
    if (update.callback_query) {
      await this.handleCallbackQuery(update.callback_query);
      return;
    }

    const message = update.message;
    if (!message) return;

    const from = update.message?.from;
    const text = update.message?.text || '';
    if (!from || !text) return;

    const chatId = message.chat?.id.toString();
    const payload: SocialMessagePayload = {
      platform: 'telegram',
      platformId: from.id.toString(),
      platformGroupId: message.chat?.type !== 'private' ? chatId : undefined,
      username: from.username || from.first_name || from.id.toString(),
      text,
    };

    const normalizedText = text.trim().toLowerCase();
    const firstWord = normalizedText.split(/\s+/)[0].split('@')[0];

    // Check if user has active interactive conversation flow pending
    const convState = this.conversationStateService.getState('telegram', from.id.toString());
    if (convState && !text.startsWith('/')) {
      await this.handleConversationInput(chatId, from.id.toString(), message.message_id, text, convState);
      return;
    }
    if (text.startsWith('/')) {
      this.conversationStateService.clearState('telegram', from.id.toString());
    }

    // FAST-PATH: Contact picker for "Send" button or bare /pay
    if (await this.showContactPicker(chatId, from.id.toString(), text)) return;

    // FAST-PATH: Instant /start handling. Hot state first, DB only on a miss.
    if (firstWord === '/start') {
      const firstName = from.first_name || from.username || 'there';
      const platformId = from.id.toString();
      const username = from.username || firstName;

      // `/start ref_VERI-ABC123` carries referral + campaign attribution.
      const startPayload = text.trim().split(/\s+/)[1] || '';

      // `/start verify_110998` is the one-tap version of `/verify 110998`,
      // sent to someone who created their wallet on the web and is connecting
      // Telegram to it. Handled before the welcome flow because that flow
      // would otherwise create or greet an account instead of linking this one.
      if (/^verify_[A-Za-z0-9]+$/.test(startPayload)) {
        const linkResult = await this.platformService.redeemLinkCode(
          payload,
          startPayload.slice('verify_'.length),
        );
        await this.sendMessage(chatId, linkResult);
        return;
      }

      const attribution = this.parseStartPayload(startPayload);

      // Telegram's immutable numeric id is the account identity. Usernames can
      // change and caches can contain provisional/counterfactual mappings, so
      // neither may choose the wallet shown by /start.
      const resolvedUser = await this.platformService.resolveCurrentUser(payload);
      const address = resolvedUser?.smartWallet?.address || null;
      if (address) {
        this.hotStateService?.setHandleMapping(platformId, address);
      }

      if (!address) {
        const pendingLink = await this.getPendingTelegramLink(from.username);
        if (pendingLink) {
          const walletLabel = pendingLink.walletAddress
            ? `…${pendingLink.walletAddress.slice(-8)}`
            : 'your existing web wallet';
          await this.sendMessageWithMarkup(
            chatId,
            `🔗 *Connect your existing VeriAgent wallet?*\n\n` +
              `A web account requested to link this Telegram username.\n\n` +
              `💳 *Wallet:* \`${walletLabel}\`\n\n` +
              `Only continue if you started this request from the web app.`,
            {
              inline_keyboard: [[
                {
                  text: '✅ Connect Existing Wallet',
                  callback_data: `link_existing:${pendingLink.code}`,
                },
              ]],
            },
          );
          return;
        }

        const onboardUrl = this.platformService.generateSignedDeepLink('/onboard', {
          platform: 'telegram',
          chatId,
          platformId,
          username,
          // Attribution rides along outside the signed param set.
          ...(attribution.referralCode ? { ref: attribution.referralCode } : {}),
          ...(attribution.src ? { src: attribution.src } : {}),
          ...(attribution.campaign ? { campaign: attribution.campaign } : {}),
        });

        const responseText = `👋 Hello *${firstName}*!\n\n` +
          (attribution.referralCode
            ? `A friend invited you — your welcome bonus is waiting.\n\n`
            : '') +
          `Send money like a text, earn like an AI. Set up your passkey wallet to get started.`;

        // Must use a plain url button (opens the device browser), NOT web_app.
        // web_app opens Telegram's embedded webview which cannot perform
        // WebAuthn / passkey ceremonies — navigator.credentials is unavailable
        // or restricted in that context. The device browser has full access
        // to the platform authenticator (Face ID, Touch ID, etc.).
        const inlineKeyboard = {
          inline_keyboard: [[
            { text: '🔐 Create Passkey Wallet', url: onboardUrl },
          ]],
        };

        await this.sendMessageWithMarkup(chatId, responseText, inlineKeyboard);
        this.trackDeepLinkClick(attribution);
      } else {
        // Already onboarded — attribute the click, but never re-award.
        await this.applyAttributionForExistingUser(platformId, from.username, attribution);
        const responseText = `👋 Welcome back, *${firstName}*!\n\n` +
          `Your VeriAgent Pay Smart Wallet is active and ready on Solana.\n\n` +
          `💳 *Smart Account Address:*\n\`${address}\`\n\n` +
          `Use the menu below or type commands to start sending payments!`;

        await this.sendMessageWithMarkup(chatId, responseText, PERSISTENT_REPLY_KEYBOARD);
      }
      return;
    }

    // FAST-PATH: Intercept referral command to send native QR Photo Card
    if (firstWord === '/referral' || firstWord === '/invite' || normalizedText === '🎁 refer & earn') {
      const user = await this.platformService.resolveCurrentUser(payload);
      if (user) {
        const stats = await this.platformService.referralService.getUserReferralStats(user.id);
        const refCode = stats.code || user.username || user.telegramId || user.id.slice(0, 8);
        const refCard = PlatformUiAdapter.toReferralCard({
          code: refCode,
          shareUrl: stats.shareUrl,
          totalReferrals: stats.totalReferrals,
          totalPoints: stats.totalPoints,
          qrImageUrl: `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(stats.shareUrl)}`,
        });

        await this.sendPhoto(chatId, refCard.qrImageUrl, refCard.caption, refCard.telegramKeyboard);
        return;
      }
    }

    // Match slash commands by first word, keyboard buttons by full text
    const TIER0_SLASH = new Set(['/help', '/wallet', '/dashboard', '/balance', '/contacts', '/referral', '/invite', '/leaderboard', '/badges', '/stats']);
    const TIER0_KEYBOARD = new Set(['💳 wallet', '📥 request', '🏦 vaults', '🏦 group pools', '🧧 envelopes', '🧧 red envelope', '👥 pools', '🎯 save ai', '🎁 refer & earn', '🏆 leaderboard', '🎖️ badges', 'ℹ️ help']);
    const isTier0Instant = TIER0_SLASH.has(firstWord) || TIER0_KEYBOARD.has(normalizedText);

    // TIER 0: Instant response (<10ms)
    if (isTier0Instant) {
      const responseText = await this.platformService.handleSocialMessage(payload);

      // For pools menu, append interactive action buttons
      const isPoolsCommand = firstWord === '/pools' || firstWord === '/pool' || normalizedText === '👥 pools' || normalizedText === '🏦 group pools';
      let sentMsg: any = null;

      if (isPoolsCommand) {
        const poolActionButtons = {
          inline_keyboard: [
            [
              { text: '💰 Deposit', callback_data: 'pool_action:deposit' },
              { text: '📥 Request Loan', callback_data: 'pool_action:request' },
            ],
            [
              { text: '💳 Repay Loan', callback_data: 'pool_action:repay' },
              { text: '👥 Invite Members', callback_data: 'pool_action:invite' },
            ],
            [
              { text: '➕ Create Pool', callback_data: 'pool_create' },
            ],
          ],
        };
        sentMsg = await this.sendMessageWithMarkup(chatId, responseText, poolActionButtons);
      } else {
        sentMsg = await this.sendMessageWithMarkup(chatId, responseText);
      }

      // Group Chat Financial Privacy: Auto-delete balance/wallet/history after 45s in groups
      const isGroupChat = chatId.startsWith('-');
      const isSensitivePrivateCmd = firstWord === '/balance' || firstWord === '/wallet' || firstWord === '/history' || firstWord === '/keys';
      if (isGroupChat && isSensitivePrivateCmd && sentMsg?.message_id) {
        this.scheduleAutoDelete(chatId, sentMsg.message_id, 45000);
      }

      const elapsedMs = Number(process.hrtime.bigint() - startNs) / 1e6;
      this.logger.log(`[Tier 0 Instant] Processed "${normalizedText}" in ${elapsedMs.toFixed(2)}ms`);
      return;
    }

    // TIER 1 & 2: Send "Processing..." placeholder, then execute async and edit
    const placeholderText = firstWord.startsWith('/')
      ? `⏳ *Processing ${firstWord}...*`
      : `🧠 *Analyzing your message...*`;

    const ackResult = await this.sendMessageWithMarkup(chatId, placeholderText, null);
    const ackMessageId = ackResult?.message_id;

    this.botQueueService.enqueue({
      platform: 'telegram',
      chatId,
      text,
      payload,
      messageId: ackMessageId,
      handler: async (job) => {
        const jobStartNs = process.hrtime.bigint();
        const finalResponse = await this.platformService.handleSocialMessage(job.payload);

        if (job.messageId) {
          await this.editMessageText(job.chatId, job.messageId, finalResponse);
        } else {
          await this.sendMessageWithMarkup(job.chatId, finalResponse);
        }

        const isGroupChat = job.chatId.startsWith('-');
        const isSensitiveCmd = job.text.startsWith('/balance') || job.text.startsWith('/wallet') || job.text.startsWith('/history') || job.text.startsWith('/keys');
        if (isGroupChat && isSensitiveCmd && job.messageId) {
          this.scheduleAutoDelete(job.chatId, job.messageId, 45000);
        }

        const jobElapsedMs = Number(process.hrtime.bigint() - jobStartNs) / 1e6;
        this.logger.log(`[Tier 1/2 Async] Command completed in ${jobElapsedMs.toFixed(2)}ms`);
      },
    });
  }

  // ─── CALLBACK QUERY HANDLER ──────────────────────────────────────────────────

  /**
   * Handle inline button callbacks (approve/reject payment requests)
   */
  private async handleCallbackQuery(callbackQuery: any): Promise<void> {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return;

    const chatId = callbackQuery.message.chat.id.toString();
    const messageId = callbackQuery.message.message_id;
    const callbackData = callbackQuery.data;

    try {
      const fromPlatformId = callbackQuery.from.id.toString();
      const fromUsername = callbackQuery.from.username || callbackQuery.from.first_name;
      const user = await this.platformService.resolveCurrentUser({ platform: 'telegram', platformId: fromPlatformId, username: fromUsername });

      const cb = callbackData.replace(/^env:/, 'env_').replace(/^split:/, 'split_').replace(/^req:/, 'req_').replace(/^pool:/, 'pool_');

      if (cb.startsWith('link_existing:')) {
        const code = cb.slice('link_existing:'.length);
        if (!/^\d{6}$/.test(code)) {
          await this.httpClient.post(`/bot${token}/answerCallbackQuery`, {
            callback_query_id: callbackQuery.id,
            text: 'This wallet link is invalid. Request a new one from the web app.',
            show_alert: true,
          });
          return;
        }

        const payload: SocialMessagePayload = {
          platform: 'telegram',
          platformId: fromPlatformId,
          username: fromUsername,
          text: `/verify ${code}`,
        };
        const result = await this.platformService.redeemLinkCode(payload, code);
        const linked = result.includes('Successfully Linked') || result.includes('already linked');
        if (linked && callbackQuery.from.username) {
          await this.redis
            .del(pendingTelegramLinkKey(callbackQuery.from.username))
            .catch(() => undefined);
        }
        await this.httpClient.post(`/bot${token}/answerCallbackQuery`, {
          callback_query_id: callbackQuery.id,
          text: linked ? 'Existing wallet connected' : 'Wallet link could not be completed',
          show_alert: !linked,
        });
        await this.editMessageText(chatId, messageId, result);
        return;
      }

      // Interactive pool actions flow
      if (cb.startsWith('pool_action:')) {
        if (!user) {
          await this.httpClient.post(`/bot${token}/answerCallbackQuery`, {
            callback_query_id: callbackQuery.id,
            text: 'Please set up your wallet first',
            show_alert: true,
          });
          return;
        }

        const parts = cb.split(':');
        const subAction = parts[1]; // deposit, request, or invite

        await this.httpClient.post(`/bot${token}/answerCallbackQuery`, { callback_query_id: callbackQuery.id });

        // Fetch user's pools
        const pools = await this.interactiveActionService.getUserPools(user.id);

        if (!pools || pools.length === 0) {
          await this.sendMessage(chatId, '❌ You are not a member of any pools yet.\n\n👉 Create a pool or ask to be invited!');
          return;
        }

        // Show pool selection buttons
        let actionText = '';
        const buttons: any[][] = [];

        if (subAction === 'deposit') {
          actionText = '💰 *Select a pool to deposit funds:*';
          pools.forEach((p: any) => {
            buttons.push([{ text: `${p.name} (${p.poolBalance || 0} ${p.token})`, callback_data: `pool_dep_select:${p.id}` }]);
          });
        } else if (subAction === 'request') {
          actionText = '📥 *Select a pool to request a loan:*';
          pools.forEach((p: any) => {
            buttons.push([{ text: `${p.name} (${p.poolBalance || 0} ${p.token})`, callback_data: `pool_req_select:${p.id}` }]);
          });
        } else if (subAction === 'repay') {
          actionText = '💳 *Select a pool to settle your active loan:*';
          pools.forEach((p: any) => {
            buttons.push([{ text: `💳 ${p.name}`, callback_data: `pool_repay_select:${p.id}` }]);
          });
        } else if (subAction === 'invite') {
          actionText = '👥 *Select a pool to invite members:*';
          pools.forEach((p: any) => {
            buttons.push([{ text: `${p.name} (${p.members?.length || 0} members)`, callback_data: `pool_inv_select:${p.id}` }]);
          });
        }

        buttons.push([{ text: '« Back to Pools', callback_data: 'pool_hub' }]);

        await this.httpClient.post(`/bot${token}/editMessageText`, {
          chat_id: chatId,
          message_id: messageId,
          text: actionText,
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: buttons },
        });
        return;
      }

      if (cb.startsWith('pool_repay_select:')) {
        const poolId = cb.split(':')[1];
        await this.httpClient.post(`/bot${token}/answerCallbackQuery`, { callback_query_id: callbackQuery.id });
        const pools = await this.interactiveActionService.getUserPools(user.id);
        const p = pools.find((x: any) => x.id === poolId);
        const activeLoans = p?.loans?.filter((l: any) => l.borrowerId === user.id && (l.status === 'ACTIVE' || l.status === 'APPROVED' || l.status === 'DISBURSED')) || [];
        const loan = activeLoans[0];
        const loanId = loan?.id || 'active';
        const loanAmount = loan?.amount || 50;

        this.conversationStateService.setState('telegram', fromPlatformId, {
          step: 'AWAITING_POOL_REPAY_AMOUNT',
          poolId,
          loanId,
          messageIdsToCleanup: [messageId],
        });

        const keyboard = [
          [{ text: `💳 Settle Full ($${loanAmount})`, callback_data: `pool_repay_amt:${poolId}:${loanId}:${loanAmount}` }],
          [{ text: '💵 $25', callback_data: `pool_repay_amt:${poolId}:${loanId}:25` }, { text: '💵 $50', callback_data: `pool_repay_amt:${poolId}:${loanId}:50` }],
          [{ text: '« Back to Pools', callback_data: 'pool_hub' }],
        ];
        await this.editMessageText(chatId, messageId, `💳 *Repay Pool Loan (${p?.name || 'Pool'})*\n\nSelect a repayment amount below or reply with a custom amount (e.g. \`${loanAmount}\`):`, { inline_keyboard: keyboard });
        return;
      }

      if (cb.startsWith('pool_repay_amt:')) {
        const [, poolId, loanId, amtStr] = cb.split(':');
        const amount = parseFloat(amtStr);
        await this.httpClient.post(`/bot${token}/answerCallbackQuery`, { callback_query_id: callbackQuery.id, text: '⚡ Settling loan via Session Key...' });
        this.conversationStateService.clearState('telegram', fromPlatformId);
        const result = await this.interactiveActionService.handlePoolRepayAction(poolId, loanId, user.id, amount);
        await this.editMessageText(chatId, messageId, result.message, result.deepLink ? {
          inline_keyboard: [[{ text: '🔐 Authorize in App', url: result.deepLink }]]
        } : undefined);
        return;
      }

      if (cb.startsWith('pool_create_tok:')) {
        const tokenChoice = cb.split(':')[1] || 'USDC';
        await this.httpClient.post(`/bot${token}/answerCallbackQuery`, { callback_query_id: callbackQuery.id });
        const curState = this.conversationStateService.getState('telegram', fromPlatformId);
        this.conversationStateService.setState('telegram', fromPlatformId, {
          step: 'AWAITING_POOL_CREATE_TARGET',
          data: { ...(curState?.data || {}), token: tokenChoice },
          messageIdsToCleanup: curState?.messageIdsToCleanup || [messageId],
        });
        await this.editMessageText(chatId, messageId, `🎯 *Set Target TVL Balance for Pool*\n\nToken: *${tokenChoice}*\n\nReply with target amount (e.g. \`1000\`):`);
        return;
      }

      if (cb === 'vault_withdraw_select' || cb.startsWith('vault_withdraw_select')) {
        await this.httpClient.post(`/bot${token}/answerCallbackQuery`, { callback_query_id: callbackQuery.id });
        this.conversationStateService.setState('telegram', fromPlatformId, {
          step: 'AWAITING_VAULT_WITHDRAW_AMOUNT',
          messageIdsToCleanup: [messageId],
        });
        const keyboard = [
          [{ text: '🏧 $25', callback_data: 'vault_withdraw_amt:25' }, { text: '🏧 $50', callback_data: 'vault_withdraw_amt:50' }],
          [{ text: '🏧 $100', callback_data: 'vault_withdraw_amt:100' }, { text: '🏧 $250', callback_data: 'vault_withdraw_amt:250' }],
          [{ text: '« Back', callback_data: '/vaults' }],
        ];
        await this.editMessageText(chatId, messageId, `🏧 *Withdraw from AI Yield Vault*\n\nSelect an amount to withdraw to your Smart Wallet, or reply with a custom amount:`, { inline_keyboard: keyboard });
        return;
      }

      if (cb.startsWith('vault_withdraw_amt:')) {
        const amount = parseFloat(cb.split(':')[1]);
        await this.httpClient.post(`/bot${token}/answerCallbackQuery`, { callback_query_id: callbackQuery.id, text: '⚡ Processing vault withdrawal...' });
        this.conversationStateService.clearState('telegram', fromPlatformId);
        const result = await this.interactiveActionService.handleVaultWithdrawAction(user.id, amount);
        await this.editMessageText(chatId, messageId, result.message, result.deepLink ? {
          inline_keyboard: [[{ text: '🔐 Authorize in App', url: result.deepLink }]]
        } : undefined);
        return;
      }

      if (cb === 'token_add') {
        await this.httpClient.post(`/bot${token}/answerCallbackQuery`, { callback_query_id: callbackQuery.id });
        this.conversationStateService.setState('telegram', fromPlatformId, {
          step: 'AWAITING_CUSTOM_TOKEN_ADDRESS',
          messageIdsToCleanup: [messageId],
        });
        await this.editMessageText(chatId, messageId, `🪙 *Watch Custom Token*\n\nReply with the ERC-20 contract address on BOTChain (e.g. \`0x1234...abcd\`):`, {
          inline_keyboard: [[{ text: '« Cancel', callback_data: '/tokens' }]]
        });
        return;
      }

      if (cb.startsWith('pool_dep_select:')) {
        const poolId = cb.split(':')[1];
        await this.httpClient.post(`/bot${token}/answerCallbackQuery`, { callback_query_id: callbackQuery.id });
        this.conversationStateService.setState('telegram', fromPlatformId, {
          step: 'AWAITING_DEPOSIT_AMOUNT',
          poolId,
          messageIdsToCleanup: [messageId],
        });
        const keyboard = [
          [{ text: '💵 $10', callback_data: `pool_dep_amt:${poolId}:10` }, { text: '💵 $50', callback_data: `pool_dep_amt:${poolId}:50` }],
          [{ text: '💵 $100', callback_data: `pool_dep_amt:${poolId}:100` }, { text: '💵 $250', callback_data: `pool_dep_amt:${poolId}:250` }],
          [{ text: '« Back to Pools', callback_data: 'pool_hub' }],
        ];
        await this.editMessageText(chatId, messageId, `💰 *Deposit Funds to Pool*\n\nSelect a preset amount below or reply with a custom amount (e.g. \`75\`):`, { inline_keyboard: keyboard });
        return;
      }

      if (cb.startsWith('pool_req_select:')) {
        const poolId = cb.split(':')[1];
        await this.httpClient.post(`/bot${token}/answerCallbackQuery`, { callback_query_id: callbackQuery.id });
        this.conversationStateService.setState('telegram', fromPlatformId, {
          step: 'AWAITING_REQUEST_AMOUNT',
          poolId,
          messageIdsToCleanup: [messageId],
        });
        const keyboard = [
          [{ text: '📥 $50', callback_data: `pool_req_amt:${poolId}:50` }, { text: '📥 $100', callback_data: `pool_req_amt:${poolId}:100` }],
          [{ text: '📥 $250', callback_data: `pool_req_amt:${poolId}:250` }, { text: '📥 $500', callback_data: `pool_req_amt:${poolId}:500` }],
          [{ text: '« Back to Pools', callback_data: 'pool_hub' }],
        ];
        // Quoted before the amount is picked — after the fact it is news, not
        // information the borrower can act on.
        const termsNote = await this.interactiveActionService.getLoanTermsNote();
        await this.editMessageText(chatId, messageId, `📥 *Request Credit Line*\n\nSelect a preset loan amount below or reply with a custom amount (e.g. \`150\`):\n\n${termsNote}`, { inline_keyboard: keyboard });
        return;
      }

      if (cb.startsWith('pool_inv_select:')) {
        const poolId = cb.split(':')[1];
        await this.httpClient.post(`/bot${token}/answerCallbackQuery`, { callback_query_id: callbackQuery.id });
        this.conversationStateService.setState('telegram', fromPlatformId, {
          step: 'AWAITING_INVITE_MEMBERS',
          poolId,
          messageIdsToCleanup: [messageId],
        });
        await this.editMessageText(chatId, messageId, `👥 *Invite Members to Pool*\n\nReply to this message with username(s) to invite (e.g. \`@alice, @bob\`):`, { inline_keyboard: [[{ text: '« Back to Pools', callback_data: 'pool_hub' }]] });
        return;
      }

      if (cb.startsWith('pool_dep_amt:')) {
        const [, poolId, amtStr] = cb.split(':');
        const amount = parseFloat(amtStr);
        await this.httpClient.post(`/bot${token}/answerCallbackQuery`, { callback_query_id: callbackQuery.id, text: '⚡ Processing deposit...' });
        this.conversationStateService.clearState('telegram', fromPlatformId);
        const result = await this.interactiveActionService.handlePoolDepositAction(poolId, user.id, amount);
        await this.editMessageText(chatId, messageId, result.message, result.deepLink ? {
          inline_keyboard: [[{ text: '🔐 Authorize in App', url: result.deepLink }]]
        } : undefined);
        return;
      }

      if (cb.startsWith('pool_req_amt:')) {
        const [, poolId, amtStr] = cb.split(':');
        const amount = parseFloat(amtStr);
        await this.httpClient.post(`/bot${token}/answerCallbackQuery`, { callback_query_id: callbackQuery.id, text: '⚡ Requesting loan...' });
        this.conversationStateService.clearState('telegram', fromPlatformId);
        const result = await this.interactiveActionService.handlePoolRequestAction(poolId, user.id, amount);
        await this.editMessageText(chatId, messageId, result.message);
        return;
      }

      if (cb.startsWith('vault_save:')) {
        const amount = parseFloat(cb.split(':')[1]);
        await this.httpClient.post(`/bot${token}/answerCallbackQuery`, { callback_query_id: callbackQuery.id, text: '⚡ Processing vault deposit...' });
        const result = await this.interactiveActionService.handleVaultDepositAction(user.id, amount);
        await this.editMessageText(chatId, messageId, result.message, result.deepLink ? {
          inline_keyboard: [[{ text: '🔐 Authorize in App', url: result.deepLink }]]
        } : undefined);
        return;
      }

      if (cb.startsWith('env_create:')) {
        const parts = cb.split(':');
        const amount = parseFloat(parts[1]);
        const slots = parseInt(parts[2]);
        await this.httpClient.post(`/bot${token}/answerCallbackQuery`, { callback_query_id: callbackQuery.id, text: '🧧 Dropping red envelope...' });
        const result = await this.interactiveActionService.handleEnvelopeCreateAction(user.id, amount, slots);
        await this.editMessageText(chatId, messageId, result.message);
        return;
      }

      if (cb.startsWith('req_quick:')) {
        const amount = parseFloat(cb.split(':')[1]);
        await this.httpClient.post(`/bot${token}/answerCallbackQuery`, { callback_query_id: callbackQuery.id });
        this.conversationStateService.setState('telegram', fromPlatformId, {
          step: 'AWAITING_REQUEST_AMOUNT',
          poolId: '',
          amount,
          messageIdsToCleanup: [messageId],
        });
        await this.editMessageText(chatId, messageId, `📥 *Request $${amount} USDC*\n\nReply to this message with username to request from (e.g. \`@alice\`):`);
        return;
      }

      if (cb.startsWith('req_pay:') || cb.startsWith('req_decline:') || cb.startsWith('req_nudge:') ||
          cb.startsWith('split_pay:') || cb.startsWith('split_ping:') ||
          cb.startsWith('env_claim:') || cb.startsWith('env_cancel:') || cb.startsWith('env_hub') ||
          cb.startsWith('pool_vote_yes:') || cb.startsWith('pool_vote_no:') || cb.startsWith('pool_req:') ||
          cb.startsWith('pool_dep:') || cb.startsWith('pool_hub') || cb.startsWith('claim_escrow:') || cb.startsWith('ref:')) {

        if (!user) {
          await this.httpClient.post(`/bot${token}/answerCallbackQuery`, {
            callback_query_id: callbackQuery.id,
            text: 'Please set up your wallet first',
            show_alert: true,
          });
          return;
        }

        const parts = cb.split(':');
        const action = parts[0];

        if (action === 'pool_req') {
          const pools = await this.interactiveActionService.getUserPools(user.id);
          const p = pools.find((x: any) => x.id === parts[1]);
          await this.httpClient.post(`/bot${token}/answerCallbackQuery`, { callback_query_id: callbackQuery.id });
          this.conversationStateService.setState('telegram', fromPlatformId, {
            step: 'AWAITING_REQUEST_AMOUNT',
            poolId: parts[1],
            messageIdsToCleanup: [messageId],
          });
          const keyboard = [
            [{ text: '📥 $50', callback_data: `pool_req_amt:${parts[1]}:50` }, { text: '📥 $100', callback_data: `pool_req_amt:${parts[1]}:100` }],
            [{ text: '📥 $250', callback_data: `pool_req_amt:${parts[1]}:250` }, { text: '📥 $500', callback_data: `pool_req_amt:${parts[1]}:500` }],
            [{ text: '« Back to Pools', callback_data: 'pool_hub' }],
          ];
          const termsNote = await this.interactiveActionService.getLoanTermsNote();
          await this.editMessageText(chatId, messageId, `📥 *Request Credit Line (${p?.name || 'Pool'})*\n\nSelect a preset loan amount below or reply with a custom amount:\n\n${termsNote}`, { inline_keyboard: keyboard });
          return;
        } else if (action === 'pool_dep') {
          const pools = await this.interactiveActionService.getUserPools(user.id);
          const p = pools.find((x: any) => x.id === parts[1]);
          await this.httpClient.post(`/bot${token}/answerCallbackQuery`, { callback_query_id: callbackQuery.id });
          this.conversationStateService.setState('telegram', fromPlatformId, {
            step: 'AWAITING_DEPOSIT_AMOUNT',
            poolId: parts[1],
            messageIdsToCleanup: [messageId],
          });
          const keyboard = [
            [{ text: '💵 $10', callback_data: `pool_dep_amt:${parts[1]}:10` }, { text: '💵 $50', callback_data: `pool_dep_amt:${parts[1]}:50` }],
            [{ text: '💵 $100', callback_data: `pool_dep_amt:${parts[1]}:100` }, { text: '💵 $250', callback_data: `pool_dep_amt:${parts[1]}:250` }],
            [{ text: '« Back to Pools', callback_data: 'pool_hub' }],
          ];
          await this.editMessageText(chatId, messageId, `💰 *Deposit Funds (${p?.name || 'Pool'})*\n\nSelect a preset amount below or reply with a custom amount:`, { inline_keyboard: keyboard });
          return;
        } else if (action === 'pool_create') {
          await this.httpClient.post(`/bot${token}/answerCallbackQuery`, { callback_query_id: callbackQuery.id });
          this.conversationStateService.setState('telegram', fromPlatformId, {
            step: 'AWAITING_POOL_CREATE_NAME',
            messageIdsToCleanup: [messageId],
          });
          await this.editMessageText(chatId, messageId, `🏦 *Create Group Lending Pool*\n\nReply with the name of your new pool (e.g. \`Builders Fund\`):`, {
            inline_keyboard: [[{ text: '« Cancel', callback_data: 'pool_hub' }]]
          });
          return;
        } else if (action === 'pool_hub') {
          await this.httpClient.post(`/bot${token}/answerCallbackQuery`, { callback_query_id: callbackQuery.id, text: 'Opening Pools Hub...' });
          this.conversationStateService.clearState('telegram', fromPlatformId);
          const poolsText = await this.platformService.handleSocialMessage({ platform: 'telegram', platformId: fromPlatformId, username: fromUsername, text: '/pools' });
          const poolHubButtons = {
            inline_keyboard: [
              [
                { text: '💰 Deposit', callback_data: 'pool_action:deposit' },
                { text: '📥 Request Loan', callback_data: 'pool_action:request' },
              ],
              [
                { text: '💳 Repay Loan', callback_data: 'pool_action:repay' },
                { text: '👥 Invite Members', callback_data: 'pool_action:invite' },
              ],
              [
                { text: '➕ Create Pool', callback_data: 'pool_create' },
              ],
            ],
          };
          await this.editMessageText(chatId, messageId, poolsText, poolHubButtons);
          return;
        } else if (action === 'claim_escrow') {
          await this.httpClient.post(`/bot${token}/answerCallbackQuery`, { callback_query_id: callbackQuery.id, text: '⚡ Claiming Escrow via Session Key...' });
          const claimText = await this.platformService.handleSocialMessage({ platform: 'telegram', platformId: fromPlatformId, username: fromUsername, text: `/claim ${parts[1]}` });
          await this.sendMessageWithMarkup(chatId, claimText);
          return;
        }

        if (action === 'ref') {
          const refSub = parts[1];
          if (refSub === 'copy') {
            await this.httpClient.post(`/bot${token}/answerCallbackQuery`, {
              callback_query_id: callbackQuery.id,
              text: `📋 Code: ${parts[2]} (Copied to Clipboard)`,
              show_alert: true,
            });
            return;
          } else if (refSub === 'leaderboard') {
            await this.httpClient.post(`/bot${token}/answerCallbackQuery`, { callback_query_id: callbackQuery.id, text: 'Loading Leaderboard...' });
            const leaderboardText = await this.platformService.handleSocialMessage({ platform: 'telegram', platformId: fromPlatformId, username: fromUsername, text: '/leaderboard' });
            await this.sendMessageWithMarkup(chatId, leaderboardText);
            return;
          } else if (refSub === 'refresh') {
            await this.httpClient.post(`/bot${token}/answerCallbackQuery`, { callback_query_id: callbackQuery.id, text: 'Refreshing referral stats...' });
            const refText = await this.platformService.handleSocialMessage({ platform: 'telegram', platformId: fromPlatformId, username: fromUsername, text: '/referral' });
            await this.sendMessageWithMarkup(chatId, refText);
            return;
          }
        }

        // Instant tap feedback
        await this.httpClient.post(`/bot${token}/answerCallbackQuery`, {
          callback_query_id: callbackQuery.id,
          text: '⚡ Processing via Session Key...',
        });

        let result: any = { success: false, message: 'Unknown action' };

        if (action === 'req_pay') result = await this.interactiveActionService.handleRequestPaymentAction(parts[1], user.id);
        else if (action === 'req_decline') result = await this.interactiveActionService.handleRequestDeclineAction(parts[1], user.id);
        else if (action === 'req_nudge') result = await this.interactiveActionService.handleRequestNudgeAction(parts[1], user.id);
        else if (action === 'split_pay') result = await this.interactiveActionService.handleSplitPaymentAction(parts[1], user.id);
        else if (action === 'split_ping') result = await this.interactiveActionService.handleSplitPingAction(parts[1], user.id);
        else if (action === 'env_claim') result = await this.interactiveActionService.handleEnvelopeClaimAction(parts[1], user.id);
        else if (action === 'env_cancel') result = await this.interactiveActionService.handleEnvelopeCancelAction(parts[1], user.id);
        else if (action === 'env_hub') {
          const menuText = await this.platformService.handleSocialMessage({ platform: 'telegram', platformId: fromPlatformId, username: fromUsername, text: '/envelopes' });
          await this.editMessageText(chatId, messageId, menuText);
          return;
        }
        else if (action === 'pool_vote_yes') result = await this.interactiveActionService.handlePoolVoteAction(parts[1], parts[2], user.id, true);
        else if (action === 'pool_vote_no') result = await this.interactiveActionService.handlePoolVoteAction(parts[1], parts[2], user.id, false);
        else if (action === 'env_create') {
          // "Pay it forward" — run the pre-filled envelope command for the user.
          const amount = parts[1] || '5';
          const claims = parts[3] || '5';
          const createText = await this.platformService.handleSocialMessage({
            platform: 'telegram',
            platformId: fromPlatformId,
            username: fromUsername,
            text: `/envelope ${amount} ${claims}`,
          });
          this.platformService.funnelEvents
            ?.trackPayItForward(user.id, parts[2] || 'unknown')
            .catch(() => undefined);
          await this.sendMessage(chatId, createText);
          await this.httpClient.post(`/bot${token}/answerCallbackQuery`, {
            callback_query_id: callbackQuery.id,
            text: '🧧 Creating your envelope',
          });
          return;
        }

        if (result.success) {
          // Surface any follow-up quick actions (e.g. "pay it forward").
          const followUpKeyboard = result.buttons
            ? {
                inline_keyboard: result.buttons.map((row: any[]) =>
                  row.map((btn) => ({ text: btn.label, callback_data: btn.callbackId })),
                ),
              }
            : { inline_keyboard: [] };

          await this.editMessageText(
            chatId,
            messageId,
            result.message,
            followUpKeyboard
          );

          await this.httpClient.post(`/bot${token}/answerCallbackQuery`, {
            callback_query_id: callbackQuery.id,
            text: '✅ Success',
          });
        } else if (result.reason === 'BIOMETRICS_REQUIRED' || result.deepLink) {
          await this.editMessageText(
            chatId,
            messageId,
            callbackQuery.message.text + '\n\n⚠️ ' + result.message,
            {
              inline_keyboard: [[
                { text: '🔐 Open App for Auth', url: result.deepLink }
              ]]
            }
          );

          await this.httpClient.post(`/bot${token}/answerCallbackQuery`, {
            callback_query_id: callbackQuery.id,
            text: result.message,
            show_alert: true,
          });
        } else {
          await this.editMessageText(chatId, messageId, callbackQuery.message.text + '\n\n⚠️ ' + (result.message || 'Action failed'));
        }
        return;
      }
      
      // ... [remainder of method]
    } catch (err: any) {
      this.logger.error(`Callback error: ${err.message}`);

      // If it's not an interactive action payload, process as regular command
      if (callbackData.startsWith('/')) {
        const payload: SocialMessagePayload = {
          platform: 'telegram',
          platformId: callbackQuery.from.id.toString(),
          platformGroupId: callbackQuery.message.chat.type !== 'private' ? chatId : undefined,
          username: callbackQuery.from.username || callbackQuery.from.first_name || callbackQuery.from.id.toString(),
          text: callbackData,
        };

        const responseText = await this.platformService.handleSocialMessage(payload);
        await this.sendMessageWithMarkup(chatId, responseText);
      }

      await this.httpClient.post(`/bot${token}/answerCallbackQuery`, {
        callback_query_id: callbackQuery.id,
        text: 'Action failed. Please try again.',
        show_alert: true,
      });
    }
  }

  // ─── OUTBOUND TELEGRAM API ──────────────────────────────────────────────────

  private extractInlineButtons(text: string): { cleanText: string; inlineKeyboard: any[][] } {
    const inlineRows: any[] = [];
    const lines = text.split('\n');
    const cleanLines: string[] = [];

    for (const line of lines) {
      const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s\)]+)\)/g;
      let match;
      let hasLinksOnLine = false;
      const rowButtons: any[] = [];

      while ((match = linkRegex.exec(line)) !== null) {
        hasLinksOnLine = true;
        const label = match[1].trim();
        const rawUrl = match[2].trim();

        let callbackData: string | null = null;
        try {
          const parsedUrl = new URL(rawUrl);
          const pathname = parsedUrl.pathname;
          const searchParams = parsedUrl.searchParams;

          const action = searchParams.get('action');
          const loan = searchParams.get('loan');
          const vote = searchParams.get('vote');

          if (pathname.includes('/requests')) {
            const reqId = pathname.includes('/requests/') ? pathname.split('/requests/')[1]?.split('?')[0] : null;
            if (reqId) {
              if (action === 'pay') callbackData = `req_pay:${reqId}`;
              else if (action === 'decline') callbackData = `req_decline:${reqId}`;
              else if (action === 'nudge') callbackData = `req_nudge:${reqId}`;
            } else if (action === 'req_quick') {
              const amount = searchParams.get('amount');
              callbackData = `req_quick:${amount || 25}`;
            }
          } else if (pathname.includes('/save-yield') || pathname.includes('/vaults')) {
            if (action === 'save') {
              const amount = searchParams.get('amount');
              callbackData = `vault_save:${amount || 50}`;
            } else if (action === 'withdraw') {
              const amount = searchParams.get('amount');
              callbackData = amount ? `vault_withdraw_amt:${amount}` : `vault_withdraw_select`;
            }
          } else if (pathname.includes('/tokens')) {
            if (action === 'add') callbackData = 'token_add';
          } else if (pathname.includes('/envelopes')) {
            const envId = pathname.includes('/envelopes/') ? pathname.split('/envelopes/')[1]?.split('?')[0] : null;
            if (envId) {
              if (action === 'claim') callbackData = `env_claim:${envId}`;
              else if (action === 'cancel') callbackData = `env_cancel:${envId}`;
            } else if (action === 'env_create') {
              const amount = searchParams.get('amount') || '10';
              const slots = searchParams.get('slots') || '5';
              callbackData = `env_create:${amount}:${slots}`;
            }
          } else if (pathname.includes('/splits/')) {
            const splitId = pathname.split('/splits/')[1]?.split('?')[0];
            if (splitId) {
              if (action === 'pay') callbackData = `split_pay:${splitId}`;
              else if (action === 'ping') callbackData = `split_ping:${splitId}`;
            }
          } else if (pathname.includes('/pools')) {
            const poolId = pathname.split('/pools/')[1]?.split('?')[0];
            if (poolId) {
              if (loan && vote === 'yes') callbackData = `pool_vote_yes:${poolId}:${loan}`;
              else if (loan && vote === 'no') callbackData = `pool_vote_no:${poolId}:${loan}`;
              else if (action === 'request') callbackData = `pool_req:${poolId}`;
              else if (action === 'deposit') callbackData = `pool_dep:${poolId}`;
              else callbackData = `pool_hub`;
            } else if (action === 'create') {
              callbackData = `pool_create`;
            } else {
              callbackData = `pool_hub`;
            }
          } else if (pathname.includes('/c/')) {
            const code = pathname.split('/c/')[1]?.split('?')[0];
            if (code) callbackData = `claim_escrow:${code}`;
          }
        } catch (e) {
          // Skip invalid URL
        }

        if (callbackData) {
          rowButtons.push({ text: label, callback_data: callbackData });
        } else if (rawUrl.includes('t.me/share') || rawUrl.includes('wa.me/')) {
          rowButtons.push({ text: label, url: rawUrl });
        }
      }

      if (hasLinksOnLine && rowButtons.length > 0) {
        while (rowButtons.length > 0) {
          inlineRows.push(rowButtons.splice(0, 2));
        }
      } else {
        cleanLines.push(line);
      }
    }

    const cleanText = cleanLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    return { cleanText: cleanText || text, inlineKeyboard: inlineRows };
  }

  async sendPhoto(chatId: string, photoUrl: string, caption: string, replyMarkup?: any): Promise<any> {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return null;
    const safeCaption = sanitizeOutboundMessage(caption);

    try {
      const res = await this.httpClient.post(`/bot${token}/sendPhoto`, {
        chat_id: chatId,
        photo: photoUrl,
        caption: safeCaption,
        parse_mode: 'Markdown',
        reply_markup: replyMarkup ? { inline_keyboard: replyMarkup } : undefined,
      });
      return res.data?.result;
    } catch (err: any) {
      this.logger.warn(`Failed to send Telegram photo: ${err.message}. Retrying via sendMessage.`);
      return await this.sendMessageWithMarkup(chatId, safeCaption, replyMarkup ? { inline_keyboard: replyMarkup } : undefined);
    }
  }

  async sendMessage(chatId: string, text: string): Promise<any> {
    return this.sendMessageWithMarkup(chatId, text);
  }

  async sendMessageWithMarkup(chatId: string, text: string, replyMarkup?: any): Promise<any> {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      this.logger.warn('TELEGRAM_BOT_TOKEN not set. Cannot send message.');
      return null;
    }
    if (isProvisionalPlatformId(chatId)) {
      // No chat exists until this account's owner messages the bot. Retrying
      // would only produce `chat not found` twice per attempt.
      this.logger.debug(`Skipping Telegram send to unclaimed account ${chatId}.`);
      return null;
    }

    const safeText = sanitizeOutboundMessage(text);
    let targetText = safeText;
    let finalMarkup = replyMarkup;

    if (!replyMarkup) {
      const extracted = this.extractInlineButtons(safeText);
      if (extracted.inlineKeyboard.length > 0) {
        targetText = extracted.cleanText;
        finalMarkup = { inline_keyboard: extracted.inlineKeyboard };
      } else {
        finalMarkup = PERSISTENT_REPLY_KEYBOARD;
      }
    }

    const startNs = process.hrtime.bigint();
    try {
      const res = await this.httpClient.post(`/bot${token}/sendMessage`, {
        chat_id: chatId,
        text: targetText,
        parse_mode: 'Markdown',
        reply_markup: finalMarkup === null ? undefined : finalMarkup,
      });
      const elapsedMs = Number(process.hrtime.bigint() - startNs) / 1e6;
      this.logger.debug(`[Telegram API] sendMessage to ${chatId} in ${elapsedMs.toFixed(2)}ms`);
      return res.data?.result;
    } catch (err: any) {
      const errDetail = err.response?.data?.description || err.message;
      this.logger.warn(`Failed to send Telegram message with Markdown to ${chatId}: ${errDetail}. Retrying as plain text.`);
      try {
        const plainText = targetText.replace(/[_*`\[\]()]/g, '');
        const res = await this.httpClient.post(`/bot${token}/sendMessage`, {
          chat_id: chatId,
          text: plainText,
          reply_markup: finalMarkup === null ? undefined : finalMarkup,
        });
        return res.data?.result;
      } catch (fallbackErr: any) {
        const fbDetail = fallbackErr.response?.data?.description || fallbackErr.message;
        this.logger.error(`Failed to send Telegram message fallback to ${chatId}: ${fbDetail}`);
        return null;
      }
    }
  }

  async sendMessageWithInlineKeyboard(chatId: string, text: string, inlineKeyboardRows: any[]): Promise<any> {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return null;
    if (isProvisionalPlatformId(chatId)) {
      this.logger.debug(`Skipping Telegram send to unclaimed account ${chatId}.`);
      return null;
    }

    const safeText = sanitizeOutboundMessage(text);
    try {
      const res = await this.httpClient.post(`/bot${token}/sendMessage`, {
        chat_id: chatId,
        text: safeText,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: inlineKeyboardRows,
        },
      });
      return res.data?.result;
    } catch (err: any) {
      const errDetail = err.response?.data?.description || err.message;
      this.logger.warn(`Failed to send Telegram message with inline keyboard with Markdown to ${chatId}: ${errDetail}. Retrying as plain text.`);
      try {
        const plainText = safeText.replace(/[_*`\[\]()]/g, '');
        const res = await this.httpClient.post(`/bot${token}/sendMessage`, {
          chat_id: chatId,
          text: plainText,
          reply_markup: {
            inline_keyboard: inlineKeyboardRows,
          },
        });
        return res.data?.result;
      } catch (fallbackErr: any) {
        const fbDetail = fallbackErr.response?.data?.description || fallbackErr.message;
        this.logger.error(`Failed to send Telegram message with inline keyboard fallback to ${chatId}: ${fbDetail}`);
        return null;
      }
    }
  }

  /**
   * Parses a Telegram `/start` payload into referral + campaign attribution.
   *
   * Telegram restricts the payload to `A-Za-z0-9_-`, so codes arrive with
   * underscores in place of the usual separators.
   *
   * Recognised forms:
   *   `ref_VERI-ABC123`         → referral
   *   `activate_web`            → web landing page funnel
   *   `hk2026`                  → named campaign
   */
  private parseStartPayload(payload: string): {
    referralCode?: string;
    src?: string;
    campaign?: string;
  } {
    const raw = (payload || '').trim();
    if (!raw) return { src: 'telegram_direct' };

    if (raw.startsWith('ref_')) {
      const code = raw.slice(4).trim().toUpperCase();
      // Guard against a malformed payload producing an empty code.
      if (!code) return { src: 'telegram_direct' };
      return { referralCode: code, src: 'telegram', campaign: 'referral' };
    }

    if (raw === 'activate_web') {
      return { src: 'web', campaign: 'activate_landing' };
    }

    return { src: 'telegram', campaign: raw.slice(0, 64) };
  }

  /**
   * Database fallback for wallet lookup when hot state has no entry.
   * Returns the smart wallet address, or null when the user is genuinely new.
   */
  private async resolveWalletFromDatabase(
    platformId: string,
    telegramUsername?: string,
  ): Promise<string | null> {
    try {
      const cleanUsername = telegramUsername?.replace(/^@/, '');
      const user = await this.platformService.prisma.user.findFirst({
        where: {
          OR: [
            { telegramId: platformId },
            ...(cleanUsername ? [{ username: cleanUsername }] : []),
          ],
        },
        include: { smartWallet: true },
      });

      const address = user?.smartWallet?.address || null;
      if (address) {
        // Repopulate the cache so subsequent messages skip the DB.
        this.hotStateService?.setHandleMapping(platformId, address);
        if (cleanUsername) this.hotStateService?.setHandleMapping(cleanUsername, address);
      }
      return address;
    } catch (error: any) {
      this.logger.error(`Wallet DB fallback failed for ${platformId}: ${error.message}`);
      return null;
    }
  }

  /** Records a deep-link click without blocking the reply. */
  private trackDeepLinkClick(attribution: { referralCode?: string; src?: string; campaign?: string }) {
    this.platformService.funnelEvents
      ?.trackCampaignClicked({
        src: attribution.src,
        campaign: attribution.campaign,
        platform: 'telegram',
      })
      .catch(() => undefined);
  }

  /**
   * Attributes a referral for a user who already has a wallet. Safe to call
   * repeatedly — `processReferral` rejects duplicates and self-referrals.
   */
  private async applyAttributionForExistingUser(
    platformId: string,
    telegramUsername: string | undefined,
    attribution: { referralCode?: string; src?: string; campaign?: string },
  ) {
    try {
      const cleanUsername = telegramUsername?.replace(/^@/, '');
      const user = await this.platformService.prisma.user.findFirst({
        where: {
          OR: [
            { telegramId: platformId },
            ...(cleanUsername ? [{ username: cleanUsername }] : []),
          ],
        },
        select: { id: true },
      });
      if (!user) {
        this.trackDeepLinkClick(attribution);
        return;
      }

      await this.platformService.funnelEvents?.trackCampaignClicked(
        { src: attribution.src, campaign: attribution.campaign, platform: 'telegram' },
        user.id,
      );

      if (attribution.campaign === 'hk2026') {
        await this.platformService.badgesService?.awardHk2026PioneerBadge(
          user.id,
          'telegram_deeplink',
        );
      }

      if (attribution.referralCode) {
        await this.platformService.referralService.processReferral(
          attribution.referralCode,
          user.id,
          { src: attribution.src, campaign: attribution.campaign },
        );
      }
    } catch (error: any) {
      this.logger.warn(`Campaign attribution failed for ${platformId}: ${error.message}`);
    }
  }

  async sendOnboardingSuccess(chatId: string, walletAddress: string): Promise<void> {
    const appBaseUrl = getAppBaseUrl();

    const text = `✅ *Wallet Created Successfully!*\n\n` +
      `💳 *Smart Account:*\n\`${walletAddress}\`\n\n` +
      `🔑 *One step remains: authorize a Session Key*\n` +
      `Use your passkey to authorize the seven-day key with a $100 daily limit. ` +
      `Only then can chat payments run without another biometric prompt.`;

    const inlineKeyboard = [
      [
        {
          text: '🔑 Authorize Session Key',
          url: `${appBaseUrl}/keys?platform=telegram&chatId=${chatId}&mint=true`,
        },
      ],
    ];

    await this.sendMessageWithInlineKeyboard(chatId, text, inlineKeyboard);

    await this.sendMessageWithMarkup(
      chatId,
      `🚀 *VeriAgent Pay Menu Activated!*\nSelect an action below or type commands directly:`,
      PERSISTENT_REPLY_KEYBOARD
    );
  }

  async sendCommunityInvite(chatId: string): Promise<void> {
    const text = `🌐 *Join the VeriAgent Pay Community!*\n\n` +
      `Get updates, tips, and connect with other users. Ask questions, share feedback, and stay in the loop on new features.`;

    const inlineKeyboard = [
      [
        {
          text: '💬 Join Community',
          url: 'https://t.me/VeriagentPay',
        },
      ],
    ];

    await this.sendMessageWithInlineKeyboard(chatId, text, inlineKeyboard);
  }

  async sendClaimNotification(
    targetId: string,
    senderHandle: string,
    amount: number,
    tokenSymbol: string,
    claimCode: string,
    claimUrl?: string
  ): Promise<void> {
    const appBaseUrl = getAppBaseUrl();
    const url = claimUrl || `${appBaseUrl}/claim?code=${claimCode}`;

    const text = `🔔 *@${senderHandle}* sent you *${amount} ${tokenSymbol}*! Claim it now.\n\n` +
      `Your funds are locked safely in escrow on BOTChain. Click below to claim your transfer.`;

    const inlineKeyboard = [
      [
        {
          text: `🎁 Claim ${amount} ${tokenSymbol}`,
          url,
        },
      ],
    ];

    await this.sendMessageWithInlineKeyboard(targetId, text, inlineKeyboard);
  }

  async editMessageText(chatId: string, messageId: number | string, text: string, replyMarkup?: any): Promise<void> {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return;

    const safeText = sanitizeOutboundMessage(text);
    let targetText = safeText;
    let finalMarkup = replyMarkup;

    if (!replyMarkup) {
      const extracted = this.extractInlineButtons(safeText);
      if (extracted.inlineKeyboard.length > 0) {
        targetText = extracted.cleanText;
        finalMarkup = { inline_keyboard: extracted.inlineKeyboard };
      }
    }

    const startNs = process.hrtime.bigint();
    try {
      await this.httpClient.post(`/bot${token}/editMessageText`, {
        chat_id: chatId,
        message_id: messageId,
        text: targetText,
        parse_mode: 'Markdown',
        ...(finalMarkup ? { reply_markup: finalMarkup } : {}),
      });
      const elapsedMs = Number(process.hrtime.bigint() - startNs) / 1e6;
      this.logger.debug(`[Telegram API] editMessageText ${messageId} in ${elapsedMs.toFixed(2)}ms`);
    } catch (err: any) {
      const errDetail = err.response?.data?.description || err.message || '';

      if (errDetail.includes('message is not modified')) {
        return;
      }

      if (errDetail.includes("message can't be edited")) {
        this.logger.debug(`Telegram message ${messageId} cannot be edited, sending new message fallback.`);
        await this.sendMessageWithMarkup(chatId, safeText, replyMarkup);
        return;
      }

      this.logger.warn(`Failed to edit Telegram message ${messageId} with Markdown: ${errDetail}. Retrying as plain text.`);
      try {
        const plainText = targetText.replace(/[_*`\[\]()]/g, '');
        await this.httpClient.post(`/bot${token}/editMessageText`, {
          chat_id: chatId,
          message_id: messageId,
          text: plainText,
          ...(finalMarkup ? { reply_markup: finalMarkup } : {}),
        });
      } catch (fallbackErr: any) {
        const fbDetail = fallbackErr.response?.data?.description || fallbackErr.message || '';
        if (fbDetail.includes('message is not modified')) return;
        if (fbDetail.includes("message can't be edited")) {
          await this.sendMessageWithMarkup(chatId, safeText, replyMarkup);
          return;
        }
        this.logger.warn(`Could not edit Telegram message ${messageId}: ${fbDetail}`);
      }
    }
  }

  // ─── WEBHOOK HANDLER (PRODUCTION) ──────────────────────────────────────────

  /**
   * Accepts an authenticated Telegram update without holding the webhook open
   * while database lookups and Bot API replies complete.
   */
  acceptWebhookUpdate(update: any): void {
    setImmediate(() => {
      this.processUpdate(update).catch((err: any) => {
        this.logger.error(
          `Error processing webhook update ${update?.update_id ?? 'unknown'}: ${err.message}`,
          err.stack,
        );
      });
    });
  }

  /**
   * Called by PlatformController when Telegram POSTs to /api/platform/telegram/webhook.
   * In production with TELEGRAM_WEBHOOK_URL set, this is the entry point.
   */
  async handleWebhookUpdate(update: any): Promise<{ responseText?: string; replyMarkup?: any }> {
    const startNs = process.hrtime.bigint();

    // Deduplication guard: skip already-processed webhook updates
    const updateId = update.update_id;
    if (updateId) {
      if (!(await this.redis.claimOnce(`webhook:telegram:${updateId}`, 24 * 60 * 60))) {
        this.logger.debug(`[Dedup] Skipping already-processed webhook update ${updateId}`);
        return {};
      }
    }

    const message = update.message || update.callback_query?.message;
    if (!message) return {};

    const from = update.message?.from || update.callback_query?.from;
    const text = update.message?.text || update.callback_query?.data || '';
    if (!from || !text) return {};

    const chatId = message.chat?.id.toString();
    const payload: SocialMessagePayload = {
      platform: 'telegram',
      platformId: from.id.toString(),
      platformGroupId: message.chat?.type !== 'private' ? chatId : undefined,
      username: from.username || from.first_name || from.id.toString(),
      text,
    };

    const normalizedText = text.trim().toLowerCase();
    const firstWord = normalizedText.split(/\s+/)[0].split('@')[0];

    // FAST-PATH: Contact picker for "Send" button or bare /pay (webhook)
    if (await this.showContactPicker(chatId, from.id.toString(), text)) {
      return {};
    }

    // FAST-PATH: Instant <50ms /start handling with zero synchronous DB writes
    if (firstWord === '/start') {
      const firstName = from.first_name || from.username || 'there';
      const platformId = from.id.toString();
      const username = from.username || firstName;

      const resolvedUser = await this.platformService.resolveCurrentUser(payload);
      const address = resolvedUser?.smartWallet?.address || null;
      if (address) {
        this.hotStateService?.setHandleMapping(platformId, address);
      }

      if (!address) {
        const appBaseUrl = getAppBaseUrl();
        const onboardUrl = this.platformService.generateSignedDeepLink('/onboard', {
          platform: 'telegram', chatId, platformId, username,
        });

        const responseText = `👋 Hello *${firstName}*!\n\n` +
          `Send money like a text, earn like an AI. Set up your passkey wallet to get started.`;

        const inlineKeyboard = {
          inline_keyboard: [
            [
              {
                text: '🔐 Create Passkey Wallet',
                url: onboardUrl,
              },
            ],
          ],
        };

        return { responseText, replyMarkup: inlineKeyboard };
      } else {
        const responseText = `👋 Welcome back, *${firstName}*!\n\n` +
          `Your VeriAgent Pay Smart Wallet is active and ready on BOTChain.\n\n` +
          `💳 *Smart Account Address:*\n\`${address}\`\n\n` +
          `Use the menu below or type commands like \`/pay 50 USDC @alice\` to get started.`;

        return { responseText, replyMarkup: PERSISTENT_REPLY_KEYBOARD };
      }
    }

    // Match slash commands by first word, keyboard buttons by full text
    const TIER0_SLASH = new Set(['/help', '/wallet', '/dashboard', '/balance', '/contacts', '/referral', '/invite', '/leaderboard', '/badges', '/stats']);
    const TIER0_KEYBOARD = new Set(['💳 wallet', '📥 request', '🏦 vaults', '🏦 group pools', '🧧 envelopes', '🧧 red envelope', '👥 pools', '🎯 save ai', '🎁 refer & earn', '🏆 leaderboard', '🎖️ badges', 'ℹ️ help']);
    const isTier0Instant = TIER0_SLASH.has(firstWord) || TIER0_KEYBOARD.has(normalizedText);

    // TIER 0: Direct instant response
    if (isTier0Instant) {
      const responseText = await this.platformService.handleSocialMessage(payload);
      const elapsedMs = Number(process.hrtime.bigint() - startNs) / 1e6;
      this.logger.log(`[Tier 0 Instant] Processed ${firstWord} in ${elapsedMs.toFixed(2)}ms`);
      return { responseText, replyMarkup: PERSISTENT_REPLY_KEYBOARD };
    }

    // TIER 1 & 2: Acknowledge immediately, process in background
    setImmediate(async () => {
      const placeholderText = firstWord.startsWith('/')
        ? `⏳ *Processing ${firstWord}...*`
        : `🧠 *Analyzing natural language prompt with Gemini AI...*`;

      const ackResult = await this.sendMessageWithMarkup(chatId, placeholderText, null);
      const ackMessageId = ackResult?.message_id;

      this.botQueueService.enqueue({
        platform: 'telegram',
        chatId,
        text,
        payload,
        messageId: ackMessageId,
        handler: async (job) => {
          const finalResponse = await this.platformService.handleSocialMessage(job.payload);
          if (job.messageId) {
            await this.editMessageText(job.chatId, job.messageId, finalResponse);
          } else {
            await this.sendMessageWithMarkup(job.chatId, finalResponse);
          }
        },
      });
    });

    const elapsedMs = Number(process.hrtime.bigint() - startNs) / 1e6;
    this.logger.log(`[Webhook 200 ACK] Acknowledged in ${elapsedMs.toFixed(2)}ms`);
    return {};
  }

  // ─── UTILITIES ──────────────────────────────────────────────────────────────

  private async showContactPicker(chatId: string, userId: string, text: string): Promise<boolean> {
    const normalizedText = text.trim().toLowerCase();
    const firstWord = normalizedText.split(/\s+/)[0].split('@')[0];
    const tokenCount = text.trim().split(/\s+/).length;

    const isSendButton = normalizedText === '💸 send';
    const isBarePay = firstWord === '/pay' && tokenCount < 3;

    if (!isSendButton && !isBarePay) return false;

    const suggestions = await this.contactsService.getPaySuggestions(userId, 5);
    if (suggestions.length > 0) {
      const buttons = suggestions.map((s) => ([{
        text: `@${s.identifier} (${s.sendCount}x)`,
        callback_data: `/pay 0 USDC @${s.identifier}`,
      }]));
      buttons.push([{ text: '❌ Cancel', callback_data: '/help' }]);
      await this.sendMessageWithInlineKeyboard(
        chatId,
        `💸 *Send Money*\n\nPick a contact or type the full command:\n\`/pay <amount> <token> @recipient\``,
        buttons,
      );
    } else {
      await this.sendMessageWithMarkup(
        chatId,
        `💸 *Send Money*\n\nUsage: \`/pay 50 USDC @alice\`\nOr type: "send 50 USDC to @alice"`,
      );
    }
    return true;
  }

  async deleteMessage(chatId: string, messageId: number | string): Promise<void> {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return;
    try {
      await this.httpClient.post(`/bot${token}/deleteMessage`, {
        chat_id: chatId,
        message_id: messageId,
      });
    } catch (err: any) {
      this.logger.debug(`Failed to delete message ${messageId}: ${err.message}`);
    }
  }

  private scheduleAutoDelete(chatId: string, messageId: number | string, delayMs: number = 45000): void {
    setTimeout(async () => {
      await this.deleteMessage(chatId, messageId);
    }, delayMs);
  }

  private async handleConversationInput(
    chatId: string,
    platformId: string,
    userMessageId: number,
    text: string,
    state: any,
  ): Promise<void> {
    const user = await this.platformService.resolveCurrentUser({ platform: 'telegram', platformId });
    if (!user) {
      this.conversationStateService.clearState('telegram', platformId);
      await this.sendMessage(chatId, '⚠️ Wallet required. Please register first.');
      return;
    }

    if (state.step === 'AWAITING_DEPOSIT_AMOUNT') {
      const amount = parseFloat(text);
      if (isNaN(amount) || amount <= 0) {
        await this.sendMessage(chatId, '❌ Invalid amount. Please enter a valid number (e.g. 50):');
        return;
      }
      const cleanupIds = this.conversationStateService.clearState('telegram', platformId);
      cleanupIds.forEach((id) => this.deleteMessage(chatId, id));
      this.deleteMessage(chatId, userMessageId);

      const result = await this.interactiveActionService.handlePoolDepositAction(state.poolId, user.id, amount);
      if (result.success) {
        await this.sendMessageWithMarkup(chatId, result.message);
      } else {
        await this.sendMessageWithMarkup(chatId, result.message, result.deepLink ? {
          inline_keyboard: [[{ text: '🔐 Authorize in App', url: result.deepLink }]]
        } : undefined);
      }
    } else if (state.step === 'AWAITING_REQUEST_AMOUNT') {
      const amount = parseFloat(text);
      if (isNaN(amount) || amount <= 0) {
        await this.sendMessage(chatId, '❌ Invalid amount. Please enter a valid number (e.g. 100):');
        return;
      }
      const cleanupIds = this.conversationStateService.clearState('telegram', platformId);
      cleanupIds.forEach((id) => this.deleteMessage(chatId, id));
      this.deleteMessage(chatId, userMessageId);

      const result = await this.interactiveActionService.handlePoolRequestAction(state.poolId, user.id, amount);
      await this.sendMessageWithMarkup(chatId, result.message);
    } else if (state.step === 'AWAITING_INVITE_MEMBERS') {
      const members = text.split(/[\s,]+/).map((m) => m.trim()).filter((m) => m.length > 0);
      if (members.length === 0) {
        await this.sendMessage(chatId, '❌ Please enter at least one handle (e.g. @alice):');
        return;
      }
      const cleanupIds = this.conversationStateService.clearState('telegram', platformId);
      cleanupIds.forEach((id) => this.deleteMessage(chatId, id));
      this.deleteMessage(chatId, userMessageId);

      const result = await this.interactiveActionService.handlePoolInviteAction(state.poolId, user.id, members);
      await this.sendMessageWithMarkup(chatId, result.message);
    } else if (state.step === 'AWAITING_VAULT_DEPOSIT_AMOUNT') {
      const amount = parseFloat(text);
      if (isNaN(amount) || amount <= 0) {
        await this.sendMessage(chatId, '❌ Invalid amount. Please enter a valid number (e.g. 50):');
        return;
      }
      const cleanupIds = this.conversationStateService.clearState('telegram', platformId);
      cleanupIds.forEach((id) => this.deleteMessage(chatId, id));
      this.deleteMessage(chatId, userMessageId);

      const result = await this.interactiveActionService.handleVaultDepositAction(user.id, amount);
      await this.sendMessageWithMarkup(chatId, result.message, result.deepLink ? {
        inline_keyboard: [[{ text: '🔐 Authorize in App', url: result.deepLink }]]
      } : undefined);
    } else if (state.step === 'AWAITING_VAULT_WITHDRAW_AMOUNT') {
      const amount = parseFloat(text);
      if (isNaN(amount) || amount <= 0) {
        await this.sendMessage(chatId, '❌ Invalid amount. Please enter a valid number (e.g. 50):');
        return;
      }
      const cleanupIds = this.conversationStateService.clearState('telegram', platformId);
      cleanupIds.forEach((id) => this.deleteMessage(chatId, id));
      this.deleteMessage(chatId, userMessageId);

      const result = await this.interactiveActionService.handleVaultWithdrawAction(user.id, amount);
      await this.sendMessageWithMarkup(chatId, result.message, result.deepLink ? {
        inline_keyboard: [[{ text: '🔐 Authorize in App', url: result.deepLink }]]
      } : undefined);
    } else if (state.step === 'AWAITING_POOL_REPAY_AMOUNT') {
      const amount = parseFloat(text);
      if (isNaN(amount) || amount <= 0) {
        await this.sendMessage(chatId, '❌ Invalid amount. Please enter a valid number (e.g. 50):');
        return;
      }
      const cleanupIds = this.conversationStateService.clearState('telegram', platformId);
      cleanupIds.forEach((id) => this.deleteMessage(chatId, id));
      this.deleteMessage(chatId, userMessageId);

      const result = await this.interactiveActionService.handlePoolRepayAction(state.poolId || '', state.loanId || '', user.id, amount);
      await this.sendMessageWithMarkup(chatId, result.message, result.deepLink ? {
        inline_keyboard: [[{ text: '🔐 Authorize in App', url: result.deepLink }]]
      } : undefined);
    } else if (state.step === 'AWAITING_POOL_CREATE_NAME') {
      const name = text.trim();
      if (!name) {
        await this.sendMessage(chatId, '❌ Pool name cannot be empty. Please enter a name:');
        return;
      }
      this.deleteMessage(chatId, userMessageId);
      this.conversationStateService.setState('telegram', platformId, {
        step: 'AWAITING_POOL_CREATE_TOKEN',
        data: { name },
        messageIdsToCleanup: state.messageIdsToCleanup || [],
      });
        const keyboard = [
          [{ text: 'USDC', callback_data: 'pool_create_tok:USDC' }],
        ];
      await this.sendMessageWithInlineKeyboard(chatId, `🏦 *Pool: "${name}"*\n\nSelect pool base token:`, keyboard);
    } else if (state.step === 'AWAITING_POOL_CREATE_TOKEN') {
      const token = text.trim().toUpperCase() || 'USDC';
      this.deleteMessage(chatId, userMessageId);
      this.conversationStateService.setState('telegram', platformId, {
        step: 'AWAITING_POOL_CREATE_TARGET',
        data: { ...(state.data || {}), token },
        messageIdsToCleanup: state.messageIdsToCleanup || [],
      });
      await this.sendMessage(chatId, `🎯 *Set Target TVL Balance for Pool*\n\nToken: *${token}*\n\nReply with target amount (e.g. \`1000\`):`);
    } else if (state.step === 'AWAITING_POOL_CREATE_TARGET') {
      const targetAmount = parseFloat(text) || 1000;
      const cleanupIds = this.conversationStateService.clearState('telegram', platformId);
      cleanupIds.forEach((id) => this.deleteMessage(chatId, id));
      this.deleteMessage(chatId, userMessageId);

      const name = state.data?.name || 'Group Pool';
      const token = state.data?.token || 'USDC';
      const result = await this.interactiveActionService.handlePoolCreateAction(user.id, name, token, targetAmount);
      await this.sendMessageWithMarkup(chatId, result.message);
    } else if (state.step === 'AWAITING_CUSTOM_TOKEN_ADDRESS') {
      const tokenAddress = text.trim();
      const cleanupIds = this.conversationStateService.clearState('telegram', platformId);
      cleanupIds.forEach((id) => this.deleteMessage(chatId, id));
      this.deleteMessage(chatId, userMessageId);

      const addResponse = await this.platformService.handleSocialMessage({
        platform: 'telegram',
        platformId,
        username: user.username || platformId,
        text: `/addtoken ${tokenAddress}`,
      });
      await this.sendMessageWithMarkup(chatId, addResponse);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async getPendingTelegramLink(username?: string): Promise<PendingTelegramLink | null> {
    if (!username) return null;
    const key = pendingTelegramLinkKey(normalizeTelegramUsername(username));
    const pending = await this.redis.getJson<PendingTelegramLink>(key).catch(() => null);
    if (!pending) return null;
    if (Date.parse(pending.expiresAt) <= Date.now()) {
      await this.redis.del(key).catch(() => undefined);
      return null;
    }
    return pending;
  }
}
