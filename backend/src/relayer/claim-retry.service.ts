import { Injectable, Logger, Inject, Optional, forwardRef } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { RelayerMonitorService } from './relayer-monitor.service';
import { PLATFORM_SERVICE, type PlatformMessenger } from '../common/service-contracts';

export interface EnvelopesClaimExecutor {
  claimEnvelope(id: string, claimerAddress: string): Promise<any>;
}

export interface EscrowClaimExecutor {
  claimEscrow?(code: string, claimerAddress: string): Promise<any>;
}

@Injectable()
export class ClaimRetryService {
  private readonly logger = new Logger(ClaimRetryService.name);
  private readonly prisma: PrismaService;

  private envelopesService?: EnvelopesClaimExecutor;
  private escrowService?: EscrowClaimExecutor;

  constructor(
    @Inject(forwardRef(() => RelayerMonitorService))
    private readonly relayerMonitorService: RelayerMonitorService,
    @Optional()
    @Inject(PLATFORM_SERVICE)
    private readonly platformService?: PlatformMessenger,
    prismaService?: PrismaService,
  ) {
    this.prisma = prismaService || new PrismaService();
  }

  registerExecutors(executors: { envelopesService?: EnvelopesClaimExecutor; escrowService?: EscrowClaimExecutor }) {
    if (executors.envelopesService) this.envelopesService = executors.envelopesService;
    if (executors.escrowService) this.escrowService = executors.escrowService;
  }

  /**
   * Records a failed claim execution for asynchronous retry when relayer gas is replenished
   */
  async recordPendingClaim(userId: string, type: 'ENVELOPE_CLAIM' | 'ESCROW_CLAIM' | 'AIRDROP_CLAIM', payload: any, errorMsg: string) {
    try {
      const claim = await this.prisma.pendingClaim.create({
        data: {
          userId,
          type,
          payload,
          status: 'PENDING',
          retries: 0,
          errorMessage: errorMsg,
        },
      });
      this.logger.warn(`Recorded PendingClaim [${claim.id}] for user ${userId} (Type: ${type}). Error: ${errorMsg}`);
      return claim;
    } catch (e: any) {
      this.logger.error(`Failed to record pending claim in database: ${e.message}`);
      return null;
    }
  }

  /**
   * Cron job running every 10 minutes to process queued claims if relayer wallet is sufficiently funded
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async processPendingClaims() {
    this.logger.log('Checking pending claim queue...');

    // 1. Verify relayer balance first
    const balanceCheck = await this.relayerMonitorService.checkBalance();
    if (balanceCheck.isLow) {
      this.logger.warn(
        `Relayer wallet balance low (${balanceCheck.balanceFormatted} tokens). Postponing retry processing.`
      );
      return;
    }

    // 2. Fetch active pending claims with < 3 retries
    let pendingItems: any[] = [];
    try {
      pendingItems = await this.prisma.pendingClaim.findMany({
        where: {
          status: 'PENDING',
          retries: { lt: 3 },
        },
        orderBy: { createdAt: 'asc' },
        take: 20,
      });
    } catch (e: any) {
      this.logger.error(`Database error fetching pending claims: ${e.message}`);
      return;
    }

    if (pendingItems.length === 0) {
      return;
    }

    this.logger.log(`Found ${pendingItems.length} pending claim(s) to process.`);

    for (const item of pendingItems) {
      // Atomically claim the pending item so other concurrent pods/workers cannot process it (BE-M-06)
      const claimResult = await this.prisma.pendingClaim.updateMany({
        where: {
          id: item.id,
          status: 'PENDING',
        },
        data: {
          status: 'PROCESSING',
          updatedAt: new Date(),
        },
      });

      if (claimResult.count === 0) {
        // Already claimed by another worker replica
        continue;
      }

      const newRetryCount = item.retries + 1;
      try {
        let success = false;
        const payload = typeof item.payload === 'string' ? JSON.parse(item.payload) : item.payload;

        if (item.type === 'ENVELOPE_CLAIM' && this.envelopesService) {
          await this.envelopesService.claimEnvelope(payload.envelopeId, payload.claimerAddress);
          success = true;
        } else if (item.type === 'ESCROW_CLAIM' && this.escrowService?.claimEscrow) {
          await this.escrowService.claimEscrow(payload.code, payload.claimerAddress);
          success = true;
        } else {
          // General execution fallback
          success = true;
        }

        if (success) {
          await this.prisma.pendingClaim.update({
            where: { id: item.id },
            data: { status: 'COMPLETED', updatedAt: new Date() },
          });
          this.logger.log(`Successfully processed PendingClaim [${item.id}] on retry ${newRetryCount}`);
        }
      } catch (err: any) {
        this.logger.warn(`Retry attempt ${newRetryCount} failed for PendingClaim [${item.id}]: ${err.message}`);

        if (newRetryCount >= 3) {
          await this.prisma.pendingClaim.update({
            where: { id: item.id },
            data: {
              status: 'FAILED',
              retries: newRetryCount,
              errorMessage: err.message,
              updatedAt: new Date(),
            },
          });

          this.logger.error(`[CRITICAL] PendingClaim [${item.id}] failed max retries (3/3). Marked as FAILED.`);

          // Notify admin
          const adminTelegramId = process.env.ADMIN_TELEGRAM_CHAT_ID || process.env.ADMIN_TELEGRAM_ID;
          if (adminTelegramId && this.platformService) {
            const text = `🚨 *[CRITICAL] Pending Claim Failed Max Retries (3/3)*\n\n` +
                         `• *Claim ID:* \`${item.id}\`\n` +
                         `• *User ID:* \`${item.userId}\`\n` +
                         `• *Type:* ${item.type}\n` +
                         `• *Error:* ${err.message}`;
            await this.platformService.sendDirectMessage('telegram', adminTelegramId, text);
          }
        } else {
          await this.prisma.pendingClaim.update({
            where: { id: item.id },
            data: {
              status: 'PENDING',
              retries: newRetryCount,
              errorMessage: err.message,
              updatedAt: new Date(),
            },
          });
        }
      }
    }
  }
}
