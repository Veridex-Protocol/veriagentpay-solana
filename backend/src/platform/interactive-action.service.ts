import { Injectable, Logger, ForbiddenException, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RelayerService } from '../relayer/relayer.service';
import { SplitsService } from '../splits/splits.service';
import { RequestsService } from '../requests/requests.service';
import { EnvelopesService } from '../envelopes/envelopes.service';
import { PoolsService } from '../pools/pools.service';
import { VaultService } from '../vault/vault.service';
import { SubscriptionService } from '../subscription/subscription.service';
import { NOTIFICATION_SERVICE, type UserNotifier } from '../common/service-contracts';
import { getAppBaseUrl } from '../config/app-url.config';
import { INTERACTIVE_ACTION_SECRET } from '../config/secrets';
import { safeEqual } from '../common/crypto.util';
import { toUserMessage } from '../common/user-error.util';
import * as crypto from 'crypto';
import { RedisService } from '../core/redis.service';
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

export interface ActionPayload {
  actionType: 'approve' | 'reject' | 'split_pay';
  requestId: string;
  userId: string;
  amount: number;
  token: string;
  nonce: string;
  expiry: number;
  signature: string;
  splitId?: string;
}

@Injectable()
export class InteractiveActionService {
  private readonly logger = new Logger(InteractiveActionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly relayerService: RelayerService,
    @Inject(forwardRef(() => SplitsService))
    private readonly splitsService: SplitsService,
    @Inject(forwardRef(() => RequestsService))
    private readonly requestsService: RequestsService,
    @Inject(forwardRef(() => EnvelopesService))
    private readonly envelopesService: EnvelopesService,
    @Inject(forwardRef(() => PoolsService))
    private readonly poolsService: PoolsService,
    @Inject(forwardRef(() => VaultService))
    private readonly vaultService: VaultService,
    @Inject(forwardRef(() => SubscriptionService))
    private readonly subscriptionService: SubscriptionService,
    @Inject(NOTIFICATION_SERVICE)
    private readonly notificationService: UserNotifier,
    private readonly redis: RedisService,
  ) {}

  /**
   * Verify HMAC signature on action payload to prevent forgery
   */
  verifyPayload(payload: ActionPayload, invokingUserId: string): boolean {
    const message = `${payload.actionType}:${payload.requestId}:${payload.userId}:${payload.nonce}:${payload.expiry}`;
    const expectedSignature = crypto
      .createHmac('sha256', INTERACTIVE_ACTION_SECRET)
      .update(message)
      .digest('hex');

    // Constant-time: a byte-wise `!==` on a signature is a remotely observable
    // side channel (SEC-054).
    if (!safeEqual(payload.signature, expectedSignature)) {
      this.logger.warn(`Invalid signature for action ${payload.requestId}`);
      return false;
    }

    if (Date.now() > payload.expiry) {
      this.logger.warn(`Expired payload for action ${payload.requestId}`);
      return false;
    }

    if (payload.userId !== invokingUserId) {
      this.logger.warn(`Action ${payload.requestId} invoked by ${invokingUserId}, addressed to ${payload.userId}`);
      return false;
    }

    return true;
  }

  /**
   * Generate signed payload for inline buttons
   * Returns a short action ID (fits in Telegram's 64-byte limit)
   */
  async generatePayload(
    actionType: 'approve' | 'reject',
    requestId: string,
    userId: string,
    amount: number,
    token: string,
  ): Promise<string> {
    const nonce = crypto.randomBytes(8).toString('hex');
    const expiry = Date.now() + CACHE_TTL;

    const message = `${actionType}:${requestId}:${userId}:${nonce}:${expiry}`;
    const signature = crypto
      .createHmac('sha256', INTERACTIVE_ACTION_SECRET)
      .update(message)
      .digest('hex');

    const payload: ActionPayload = {
      actionType,
      requestId,
      userId,
      amount,
      token,
      nonce,
      expiry,
      signature,
    };

    // Generate short action ID (8 characters, fits in Telegram callback_data)
    const actionId = `act_${crypto.randomBytes(4).toString('hex')}`;

    await this.redis.setJson(`ia:payload:${actionId}`, payload, CACHE_TTL);

    return actionId;
  }

  /**
   * Handle approve/reject action from chat buttons
   */
  async handleInteractiveAction(actionId: string, invokingUserId: string) {
    // Atomic GETDEL makes an action id single-use across every replica.
    const payload = await this.redis.takeJson<ActionPayload>(`ia:payload:${actionId}`);
    if (!payload) {
      throw new ForbiddenException('Action expired or invalid');
    }

    if (!this.verifyPayload(payload, invokingUserId)) {
      throw new ForbiddenException('Invalid or expired action');
    }

    const ttlSeconds = Math.max(1, Math.ceil((payload.expiry - Date.now()) / 1000));
    if (!(await this.redis.claimOnce(`ia:nonce:${payload.nonce}`, ttlSeconds))) {
      throw new ForbiddenException('Action has already been used');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.userId },
      select: { requireBiometricsAlways: true },
    });

    if (payload.actionType === 'approve') {
      // Check if user requires biometrics
      if (user?.requireBiometricsAlways) {
        return {
          success: false,
          reason: 'BIOMETRICS_REQUIRED',
          message: 'Biometric authentication required. Please open the app.',
          deepLink: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/requests/${payload.requestId}`,
        };
      }

      // Try to find active session key
      const sessionKey = await this.prisma.sessionKey.findFirst({
        where: {
          userId: payload.userId,
          expiryAt: { gt: new Date() },
          revokedAt: null,
          activatedAt: { not: null },
        },
      });

      if (!sessionKey) {
        return {
          success: false,
          reason: 'BIOMETRICS_REQUIRED',
          message: 'No active session key. Please open the app for biometric authorization.',
          deepLink: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/requests/${payload.requestId}`,
        };
      }

      // Check session limits
      if (payload.amount > parseFloat(sessionKey.perTxLimitUSD.toString())) {
        return {
          success: false,
          reason: 'BIOMETRICS_REQUIRED',
          message: 'Amount exceeds session limits. Please open the app for biometric authorization.',
          deepLink: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/requests/${payload.requestId}`,
        };
      }

      try {
        const result = await this.requestsService.payRequest(payload.requestId, payload.userId);
        return {
          success: true,
          message: `✅ Payment request approved and paid!\nTransferred *${payload.amount} ${payload.token}* on-chain.\nTx Hash: \`${result?.txHash || 'Confirmed'}\``,
        };
      } catch (err: any) {
        return {
          success: false,
          reason: 'PAYMENT_FAILED',
          message: `Payment failed: ${toUserMessage(err, 'The payment could not be completed. No funds have left your wallet.')}`,
          deepLink: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/requests/${payload.requestId}?action=pay`,
        };
      }
    } else if (payload.actionType === 'reject') {
      await this.prisma.paymentRequest.update({
        where: { id: payload.requestId },
        data: { status: 'CANCELLED' },
      });

      return {
        success: true,
        message: `❌ Payment request rejected`,
      };
    } else if (payload.actionType === 'split_pay' && payload.splitId) {
      return this.handleSplitPaymentAction(payload.splitId, payload.userId);
    }

    throw new ForbiddenException('Invalid action type');
  }

  async handleSplitPaymentAction(splitId: string, userId: string): Promise<any> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { requireBiometricsAlways: true },
    });

    const appUrl = getAppBaseUrl();

    if (user?.requireBiometricsAlways) {
      return {
        success: false,
        reason: 'BIOMETRICS_REQUIRED',
        message: 'Biometric authentication required to approve split payment.',
        deepLink: `${appUrl}/splits/${splitId}?action=pay`,
      };
    }

    const sessionKey = await this.prisma.sessionKey.findFirst({
      where: {
        userId,
        expiryAt: { gt: new Date() },
        revokedAt: null,
      },
    });

    if (!sessionKey) {
      return {
        success: false,
        reason: 'BIOMETRICS_REQUIRED',
        message: 'No active session key. Please authorize with passkey.',
        deepLink: `${appUrl}/splits/${splitId}?action=pay`,
      };
    }

    try {
      const result = await this.splitsService.paySplit(splitId, userId);
      return {
        success: true,
        message: `✅ Paid! Your share of ${result.amount} for this split has been transferred on-chain.\nTx Hash: ${result.txHash}`,
      };
    } catch (err: any) {
      return {
        success: false,
        reason: 'PAYMENT_FAILED',
        message: `Payment failed: ${toUserMessage(err, 'The payment could not be completed. No funds have left your wallet.')}`,
        deepLink: `${appUrl}/splits/${splitId}?action=pay`,
      };
    }
  }

  async handleRequestPaymentAction(requestId: string, userId: string): Promise<any> {
    const appUrl = getAppBaseUrl();
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { requireBiometricsAlways: true } });
    if (user?.requireBiometricsAlways) {
      return { success: false, reason: 'BIOMETRICS_REQUIRED', message: 'Biometric authentication required.', deepLink: `${appUrl}/requests/${requestId}?action=pay` };
    }
    const sessionKey = await this.prisma.sessionKey.findFirst({
      where: { userId, expiryAt: { gt: new Date() }, revokedAt: null }
    });
    if (!sessionKey) {
      return { success: false, reason: 'BIOMETRICS_REQUIRED', message: 'No active session key. Please authorize with passkey.', deepLink: `${appUrl}/requests/${requestId}?action=pay` };
    }
    try {
      const result = await this.requestsService.payRequest(requestId, userId);
      return { success: true, message: `✅ Request paid! Funds transferred on-chain.\nTx Hash: ${result?.txHash || 'Confirmed'}` };
    } catch (err: any) {
      return { success: false, reason: 'PAYMENT_FAILED', message: `Payment failed: ${toUserMessage(err, 'The payment could not be completed. No funds have left your wallet.')}`, deepLink: `${appUrl}/requests/${requestId}?action=pay` };
    }
  }

  async handleRequestDeclineAction(requestId: string, userId: string): Promise<any> {
    try {
      await this.prisma.paymentRequest.update({
        where: { id: requestId },
        data: { status: 'CANCELLED' }
      });
      return { success: true, message: `❌ Payment request declined.` };
    } catch (err: any) {
      return { success: false, message: `Decline failed: ${toUserMessage(err, 'The request could not be declined.')}` };
    }
  }

  async handleRequestNudgeAction(requestId: string, userId: string): Promise<any> {
    try {
      const request = await this.prisma.paymentRequest.findUnique({ where: { id: requestId } });
      if (!request) return { success: false, message: 'Request not found' };
      if (request.recipientId && this.notificationService) {
        await this.notificationService.notifyUser({
          userId: request.recipientId,
          type: 'split_request',
          title: '🔔 Payment Request Reminder',
          body: `Reminder: You have a pending payment request of ${request.amount} ${request.token}.`,
          link: `${getAppBaseUrl()}/requests/${requestId}`
        });
      }
      return { success: true, message: `🔔 Nudge sent to recipient!` };
    } catch (err: any) {
      return { success: false, message: `Nudge failed: ${toUserMessage(err, 'The reminder could not be sent.')}` };
    }
  }

  async handleSplitPingAction(splitId: string, userId: string): Promise<any> {
    try {
      const split = await this.splitsService.getSplit(splitId);
      const pendingParticipants = split.participants.filter((p: any) => !p.hasPaid);
      for (const p of pendingParticipants) {
        if (p.userId && this.notificationService) {
          await this.notificationService.notifyUser({
            userId: p.userId,
            type: 'split_request',
            title: '📣 Bill Split Reminder',
            body: `Friendly ping! Your share of ${p.shareAmount} ${split.token} for "${split.description || 'Group Split'}" is pending.`,
            link: `${getAppBaseUrl()}/splits/${splitId}`
          });
        }
      }
      return { success: true, message: `📣 Reminder sent to ${pendingParticipants.length} unpaid participant(s)!` };
    } catch (err: any) {
      return { success: false, message: `Ping failed: ${toUserMessage(err, 'The reminder could not be sent.')}` };
    }
  }

  async handleEnvelopeClaimAction(envelopeId: string, userId: string): Promise<any> {
    const appUrl = getAppBaseUrl();
    try {
      const user = await this.prisma.user.findUnique({ where: { id: userId }, include: { smartWallet: true } });
      if (!user?.smartWallet?.address) {
        return { success: false, reason: 'WALLET_REQUIRED', message: 'Smart wallet required.', deepLink: `${appUrl}/envelopes/${envelopeId}` };
      }
      const result: any = await this.envelopesService.claimEnvelope(envelopeId, user.smartWallet.address);
      // The service returns `claimedAmount`; the older `amountClaimed` spelling
      // silently fell through to "your share" on every claim.
      const amount = result.claimedAmount ?? result.amountClaimed;
      const token = result.token || 'USDC';

      let message = `🎁 Red Envelope Claimed! You received ${amount ?? 'your share'} ${token}.`;
      if (result.txHash) message += `\nTx: ${result.txHash}`;

      const payItForward = result.payItForward;
      if (payItForward) {
        message += `\n\n🧧 ${payItForward.prompt}`;
      }

      return {
        success: true,
        message,
        payItForward,
        // Quick-action buttons rendered by each platform driver.
        // Callback grammar is `<action>:<arg1>:<arg2>:…` split on ':'.
        buttons: payItForward
          ? [
              [
                {
                  label: '🧧 Create Your Own Envelope',
                  callbackId: `env_create:${payItForward.suggestedAmount}:${envelopeId}:5`,
                },
              ],
            ]
          : undefined,
      };
    } catch (err: any) {
      return { success: false, message: `Claim failed: ${toUserMessage(err, 'The envelope could not be claimed.')}`, deepLink: `${appUrl}/envelopes/${envelopeId}` };
    }
  }

  async handleEnvelopeCancelAction(envelopeId: string, userId: string): Promise<any> {
    try {
      await this.envelopesService.cancelEnvelope(envelopeId, userId);
      return { success: true, message: `🔄 Red Envelope cancelled. Remaining balance refunded to your wallet!` };
    } catch (err: any) {
      return { success: false, message: `Cancel failed: ${toUserMessage(err, 'That could not be cancelled.')}` };
    }
  }

  async handlePoolVoteAction(poolId: string, loanId: string, userId: string, approve: boolean): Promise<any> {
    try {
      await this.poolsService.voteLoan(poolId, loanId, userId, approve);
      return { success: true, message: approve ? `👍 Vote APPROVE recorded!` : `👎 Vote REJECT recorded!` };
    } catch (err: any) {
      return { success: false, message: `Vote failed: ${toUserMessage(err, 'Your vote could not be recorded.')}` };
    }
  }

  async handlePoolDepositAction(poolId: string, userId: string, amount: number): Promise<any> {
    const appUrl = getAppBaseUrl();
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { requireBiometricsAlways: true } });

    if (user?.requireBiometricsAlways) {
      return { success: false, reason: 'BIOMETRICS_REQUIRED', message: 'Biometric authentication required to deposit.', deepLink: `${appUrl}/pools/${poolId}?action=deposit` };
    }

    const sessionKey = await this.prisma.sessionKey.findFirst({
      where: { userId, expiryAt: { gt: new Date() }, revokedAt: null },
    });

    if (!sessionKey) {
      return { success: false, reason: 'BIOMETRICS_REQUIRED', message: 'No active session key. Please authorize with passkey.', deepLink: `${appUrl}/pools/${poolId}?action=deposit` };
    }

    try {
      const result = await this.poolsService.deposit(poolId, userId, amount);
      return {
        success: true,
        message: `✅ *Deposit Successful!*\n\nDeposited *${amount} ${result.token ?? 'USDC'}* to the pool.\nTx: \`${result.txHash || 'Confirmed'}\``,
      };
    } catch (err: any) {
      return { success: false, message: `❌ Deposit failed: ${toUserMessage(err, 'The deposit could not be completed. No funds have left your wallet.')}`, deepLink: `${appUrl}/pools/${poolId}?action=deposit` };
    }
  }

  /**
   * Loan terms for a chat prompt, phrased for a one-line disclosure.
   *
   * @dev Drivers ask before the borrower picks an amount, which is the only
   *      moment the information can change their decision. Read through
   *      `PoolsService` so chat and web quote the same contract-sourced figure.
   */
  async getLoanTermsNote(): Promise<string> {
    try {
      const { originationFeeBps } = await this.poolsService.getLoanTerms();
      return `_A ${originationFeeBps / 100}% origination fee is deducted on payout — you receive that much less, and repay the full amount._`;
    } catch {
      return '';
    }
  }

  async handlePoolRequestAction(poolId: string, userId: string, amount: number, purpose?: string): Promise<any> {
    const appUrl = getAppBaseUrl();
    try {
      const result = await this.poolsService.requestLoan(poolId, userId, {
        amount,
        purpose: purpose || undefined,
        durationDays: 30,
      });
      // The fee is deducted on disbursement, so the borrower receives less than
      // they asked for while still owing the full amount. Saying so here is the
      // only chance they get in chat — the web form shows a breakdown, this
      // path used to show none. The token comes from the pool, not a hardcoded
      // "USDC": pools are created in USDT too, and naming the wrong one turns a
      // disclosure into misinformation.
      const fee = result.originationFee ?? 0;
      const token = result.token ?? 'USDC';
      const feePct = (result.loanTerms?.originationFeeBps ?? 250) / 100;

      return {
        success: true,
        message:
          `✅ *Loan Request Submitted!*\n\n` +
          `Requested *${amount} ${token}* from the pool.\n` +
          `Purpose: ${purpose || 'Not specified'}\n\n` +
          `💵 You receive *${result.amountReceived?.toFixed(2) ?? amount} ${token}* ` +
          `after the ${feePct}% origination fee (−${fee.toFixed(2)} ${token}).\n` +
          `You repay the full *${amount} ${token}*.\n\n` +
          `Your request is now pending member votes.`,
      };
    } catch (err: any) {
      return { success: false, message: `❌ Request failed: ${toUserMessage(err, 'The loan request could not be created.')}`, deepLink: `${appUrl}/pools/${poolId}` };
    }
  }

  async handlePoolInviteAction(poolId: string, userId: string, members: string[]): Promise<any> {
    try {
      const result = await this.poolsService.inviteMembers(poolId, userId, members);
      return {
        success: true,
        message: `✅ *Invitations Sent!*\n\nInvited *${result.invitedCount}* member(s) to the pool.\n\n📎 Share Link: ${result.inviteLink}`,
      };
    } catch (err: any) {
      return { success: false, message: `❌ Invite failed: ${toUserMessage(err, 'The invite could not be sent.')}` };
    }
  }

  async handleVaultDepositAction(userId: string, amount: number): Promise<any> {
    const appUrl = getAppBaseUrl();
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { requireBiometricsAlways: true } });

    if (user?.requireBiometricsAlways) {
      return { success: false, reason: 'BIOMETRICS_REQUIRED', message: 'Biometric authentication required to deposit.', deepLink: `${appUrl}/save-yield?amount=${amount}` };
    }

    const sessionKey = await this.prisma.sessionKey.findFirst({
      where: { userId, expiryAt: { gt: new Date() }, revokedAt: null, activatedAt: { not: null } },
    });

    if (!sessionKey) {
      return { success: false, reason: 'BIOMETRICS_REQUIRED', message: 'No active session key. Please authorize with passkey.', deepLink: `${appUrl}/keys?mint=true` };
    }

    try {
      const result = await this.vaultService.deposit(userId, 'agent-vault-usdc', amount);
      const txHash = (result as any)?.txHash || (result as any)?.depositRecord?.txHash || 'Confirmed';

      return {
        success: true,
        message: `✅ *Vault Deposit Successful!*\n\nDeposited *${amount} USDC* into AgentVaultV2 on-chain.\nTx Hash: \`${txHash}\``,
      };
    } catch (err: any) {
      return { success: false, message: `❌ Deposit failed: ${toUserMessage(err, 'The deposit could not be completed. No funds have left your wallet.')}`, deepLink: `${appUrl}/save-yield?amount=${amount}` };
    }
  }

  async handleVaultWithdrawAction(userId: string, amount: number): Promise<any> {
    const appUrl = getAppBaseUrl();
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { requireBiometricsAlways: true } });

    if (user?.requireBiometricsAlways) {
      return { success: false, reason: 'BIOMETRICS_REQUIRED', message: 'Biometric authentication required to withdraw.', deepLink: `${appUrl}/save-yield` };
    }

    const sessionKey = await this.prisma.sessionKey.findFirst({
      where: { userId, expiryAt: { gt: new Date() }, revokedAt: null, activatedAt: { not: null } },
    });

    if (!sessionKey) {
      return { success: false, reason: 'BIOMETRICS_REQUIRED', message: 'No active session key. Please authorize with passkey.', deepLink: `${appUrl}/keys?mint=true` };
    }

    try {
      const result = await this.vaultService.withdraw(userId, 'agent-vault-usdc', amount);
      const txHash = (result as any)?.txHash || 'Confirmed';

      return {
        success: true,
        message: `✅ *Vault Withdrawal Successful!*\n\nWithdrew *${amount} USDC* from AgentVaultV2 to your Smart Wallet on-chain.\nTx Hash: \`${txHash}\``,
      };
    } catch (err: any) {
      return { success: false, message: `❌ Withdrawal failed: ${toUserMessage(err, 'The withdrawal could not be completed.')}`, deepLink: `${appUrl}/save-yield` };
    }
  }

  async handlePoolRepayAction(poolId: string, loanId: string, userId: string, amount: number): Promise<any> {
    const appUrl = getAppBaseUrl();
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { requireBiometricsAlways: true } });

    if (user?.requireBiometricsAlways) {
      return { success: false, reason: 'BIOMETRICS_REQUIRED', message: 'Biometric authentication required to repay loan.', deepLink: `${appUrl}/pools/${poolId}` };
    }

    const sessionKey = await this.prisma.sessionKey.findFirst({
      where: { userId, expiryAt: { gt: new Date() }, revokedAt: null, activatedAt: { not: null } },
    });

    if (!sessionKey) {
      return { success: false, reason: 'BIOMETRICS_REQUIRED', message: 'No active session key. Please authorize with passkey.', deepLink: `${appUrl}/keys?mint=true` };
    }

    try {
      const result = await this.poolsService.repayLoan(poolId, loanId, userId, amount);
      return {
        success: true,
        message: `✅ *Loan Repayment Successful!*\n\nRepaid *${amount} USDC* to pool on-chain.\nTx Hash: \`${result?.txHash || 'Confirmed'}\``,
      };
    } catch (err: any) {
      return { success: false, message: `❌ Repayment failed: ${toUserMessage(err, 'The loan repayment could not be completed.')}`, deepLink: `${appUrl}/pools/${poolId}` };
    }
  }

  async handlePoolCreateAction(userId: string, name: string, token: string = 'USDC', targetAmount?: number, members: string[] = []): Promise<any> {
    try {
      const result = await this.poolsService.createPool(userId, {
        name,
        token,
        targetAmount: targetAmount || 1000,
        members,
      });

      const pool = (result as any)?.pool;
      const poolId = (result as any)?.poolId || pool?.id;

      return {
        success: true,
        message: `🎉 *Group Pool Created Successfully!*\n\n` +
          `🏦 *Name:* ${pool?.name || name}\n` +
          `💰 *Token:* ${pool?.token || token}\n` +
          `🎯 *Target TVL:* $${pool?.targetAmount || targetAmount || 1000} ${pool?.token || token}\n` +
          `👥 *Members:* ${pool?.members?.length || 1}\n\n` +
          `👉 [📱 Open Pool Details](${getAppBaseUrl()}/pools/${poolId})`,
      };
    } catch (err: any) {
      return { success: false, message: `❌ Pool creation failed: ${toUserMessage(err, 'The pool could not be created.')}` };
    }
  }

  async handleSubscriptionCancelAction(subscriptionId: string, userId: string): Promise<any> {
    try {
      await this.subscriptionService.cancelSubscription(userId, subscriptionId);
      return {
        success: true,
        message: `✅ *Subscription Cancelled!*\n\nRecurring payment has been stopped.`,
      };
    } catch (err: any) {
      return { success: false, message: `❌ Failed to cancel subscription: ${toUserMessage(err, 'The subscription could not be cancelled.')}` };
    }
  }

  async handleEnvelopeCreateAction(userId: string, amount: number, numRecipients: number): Promise<any> {
    const appUrl = getAppBaseUrl();
    try {
      const result = await this.envelopesService.create(userId, {
        token: 'USDC',
        totalAmount: amount,
        numRecipients,
        type: 'OPEN',
        message: '🧧 Happy Red Envelope!',
      });

      if (result.success || (result as any).envelope) {
        const envId = (result as any).envelope?.id || (result as any).id;
        const link = `${appUrl}/envelopes/${envId}`;
        return {
          success: true,
          message: `🧧 *Red Envelope Created!*\n\nDropped *${amount} USDC* split across *${numRecipients} claim slots*!\n\n👉 [ Claim Red Envelope](${link}?action=claim)`,
        };
      }
      return { success: false, message: `⚠️ ${(result as any).error || 'Failed to create envelope.'}` };
    } catch (err: any) {
      return { success: false, message: `❌ Envelope creation failed: ${toUserMessage(err, 'The envelope could not be created. No funds have left your wallet.')}`, deepLink: `${appUrl}/envelopes` };
    }
  }

  async getUserPools(userId: string): Promise<any[]> {
    try {
      const res = await this.poolsService.findAllForUser(userId);
      return res.pools || [];
    } catch (err: any) {
      this.logger.error(`Failed to get user pools: ${err.message}`);
      return [];
    }
  }
}

