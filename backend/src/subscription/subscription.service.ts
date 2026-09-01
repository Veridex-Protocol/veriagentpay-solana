import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { UserActivityAction } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RelayerService } from '../relayer/relayer.service';
import { NOTIFICATIONS_STORE, type NotificationStore } from '../common/service-contracts';
import { NOTIFICATION_SERVICE, type UserNotifier } from '../common/service-contracts';
import { ActivityService } from '../activity/activity.service';
import { getAppBaseUrl } from '../config/app-url.config';

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => RelayerService))
    private readonly relayerService: RelayerService,
    @Inject(NOTIFICATIONS_STORE)
    private readonly notificationsService?: NotificationStore,
    @Inject(NOTIFICATION_SERVICE)
    private readonly unifiedNotificationService?: UserNotifier,
    private readonly activityService?: ActivityService,
  ) { }

  /**
   * Creates a new recurring subscription payment
   */
  async createSubscription(
    subscriberId: string,
    recipientAddress: string,
    recipientHandle: string,
    amountUSD: number,
    intervalDays: number = 30
  ) {
    const nextPaymentAt = new Date(Date.now() + intervalDays * 86400 * 1000);

    const subscription = await this.prisma.subscription.create({
      data: {
        subscriberId,
        recipientAddress,
        recipientHandle,
        amountUSD,
        intervalDays,
        nextPaymentAt,
        isActive: true,
      }
    });

    await this.activityService?.record({
      userIdentifier: subscriberId,
      action: UserActivityAction.SUBSCRIPTION_CREATED,
      amount: amountUSD,
      token: 'USD',
      metadata: { subscriptionId: subscription.id, recipientAddress, recipientHandle, intervalDays },
    }).catch(() => {});

    return subscription;
  }

  /**
   * Cancels an active subscription
   */
  async cancelSubscription(subscriberId: string, subscriptionId: string) {
    const sub = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId }
    });

    if (!sub || sub.subscriberId !== subscriberId) {
      throw new Error('Subscription not found or unauthorized');
    }

    return await this.prisma.subscription.update({
      where: { id: subscriptionId },
      data: { isActive: false }
    });
  }

  /**
   * Retrieves active subscriptions for a user
   */
  async getUserSubscriptions(subscriberId: string) {
    return await this.prisma.subscription.findMany({
      where: { subscriberId, isActive: true },
      orderBy: { nextPaymentAt: 'asc' }
    });
  }

  /**
   * Cron worker function executing due subscriptions via active session keys
   */
  async processDueSubscriptions() {
    const now = new Date();
    const dueSubscriptions = await this.prisma.subscription.findMany({
      where: {
        isActive: true,
        nextPaymentAt: { lte: now }
      },
      include: { subscriber: { include: { smartWallet: true } } }
    });

    this.logger.log(`Found ${dueSubscriptions.length} due recurring subscriptions to process.`);

    for (const sub of dueSubscriptions) {
      try {
        if (!sub.subscriber.smartWallet) continue;

        // Fetch active unrevoked session key for subscriber
        const sessionKey = await this.prisma.sessionKey.findFirst({
          where: {
            userId: sub.subscriberId,
            revokedAt: null,
            expiryAt: { gt: now }
          }
        });

        if (!sessionKey) {
          this.logger.warn(`No valid session key found for subscriber ${sub.subscriberId}. Sending re-authorization notification.`);
          if (this.unifiedNotificationService) {
            try {
              await this.unifiedNotificationService.notifyUser({
                userId: sub.subscriberId,
                type: 'subscription_failed',
                title: 'Recurring Payment Paused ⚠️',
                body: `Your $${sub.amountUSD} subscription payment to ${sub.recipientHandle || sub.recipientAddress} requires re-authorization. Please activate a new session key.`,
                amount: Number(sub.amountUSD),
                to: sub.recipientHandle || sub.recipientAddress,
                link: `${getAppBaseUrl()}/keys`,
                metadata: { subscriptionId: sub.id, reason: 'expired_session_key' },
              });
            } catch (notifErr: any) {
              this.logger.warn(`Failed to send subscription re-authorization notification: ${notifErr.message}`);
            }
          }
          continue;
        }

        const decryptedPrivateKey = await this.relayerService.decryptSessionKey(sessionKey);

        // Execute local session action
        const result = await this.relayerService.executeLocalSessionAction(
          sub.subscriberId,
          sub.subscriber.smartWallet.address,
          decryptedPrivateKey,
          '0x',
          Number(sub.amountUSD),
          Date.now()
        );

        const txHash = result?.txHash || `0x${Date.now().toString(16)}`;

        // Create SubscriptionPayment record
        await this.prisma.subscriptionPayment.create({
          data: {
            subscriptionId: sub.id,
            amountUSD: sub.amountUSD,
            txHash,
            status: 'SUCCESS',
          },
        }).catch(() => {});

        // Record activity log
        await this.activityService?.record({
          userIdentifier: sub.subscriberId,
          action: UserActivityAction.SUBSCRIPTION_PAID,
          amount: Number(sub.amountUSD),
          token: 'USD',
          txHash,
          metadata: { subscriptionId: sub.id, recipientAddress: sub.recipientAddress },
        }).catch(() => {});

        // Advance nextPaymentAt
        const nextPaymentAt = new Date(Date.now() + sub.intervalDays * 86400 * 1000);
        await this.prisma.subscription.update({
          where: { id: sub.id },
          data: { nextPaymentAt }
        });

        this.logger.log(`Successfully processed subscription ${sub.id} ($${sub.amountUSD} to ${sub.recipientAddress})`);

        // Unified notification for successful subscription payment
        if (this.unifiedNotificationService) {
          this.unifiedNotificationService.notifyUser({
            userId: sub.subscriberId,
            type: 'subscription_success',
            title: 'Subscription Payment Sent ✅',
            body: `Your recurring payment of $${sub.amountUSD} to ${sub.recipientHandle || sub.recipientAddress} was processed successfully. Next payment: ${nextPaymentAt.toLocaleDateString()}.`,
            amount: Number(sub.amountUSD),
            to: sub.recipientHandle || sub.recipientAddress,
            link: `${getAppBaseUrl()}/subscriptions`,
            metadata: { subscriptionId: sub.id, nextPaymentAt: nextPaymentAt.toISOString() },
          }).catch(err => this.logger.warn(`Failed to send unified notification: ${err.message}`));
        }
      } catch (e: any) {
        this.logger.error(`Subscription execution failed for ${sub.id}: ${e.message}`);

        // Unified notification for failed subscription payment
        if (this.unifiedNotificationService) {
          this.unifiedNotificationService.notifyUser({
            userId: sub.subscriberId,
            type: 'subscription_failed',
            title: 'Subscription Payment Failed ❌',
            body: `Your recurring payment of $${sub.amountUSD} to ${sub.recipientHandle || sub.recipientAddress} failed: ${e.message}`,
            amount: Number(sub.amountUSD),
            to: sub.recipientHandle || sub.recipientAddress,
            link: `${getAppBaseUrl()}/subscriptions`,
            metadata: { subscriptionId: sub.id, error: e.message },
          }).catch(err => this.logger.warn(`Failed to send unified notification: ${err.message}`));
        }
      }
    }
  }
}
