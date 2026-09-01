import { Injectable, Logger, OnModuleInit, Inject, forwardRef } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PLATFORM_SERVICE, type PlatformMessenger } from '../common/service-contracts';
import { SolanaChainService } from '../chains/solana/solana-chain.service';

@Injectable()
export class RelayerMonitorService implements OnModuleInit {
  private readonly logger = new Logger(RelayerMonitorService.name);

  private readonly minThresholdSol = parseFloat(process.env.RELAYER_MIN_BALANCE_SOL || '0.05');
  private lastAlertSentAt: number = 0;
  private lastCheckedBalanceNum: number = 0;
  private cachedStatus: { healthy: boolean; address: string; balance: string; isLow: boolean } = {
    healthy: true,
    address: '',
    balance: '0.0',
    isLow: false,
  };

  constructor(
    private readonly solana: SolanaChainService,
    @Inject(PLATFORM_SERVICE)
    private readonly platformService?: PlatformMessenger
  ) {}

  async onModuleInit() {
    this.logger.log('Initializing Relayer Wallet Gas Monitor...');
    await this.checkBalance();
  }

  /**
   * Periodic hourly check of relayer wallet gas balance
   */
  @Cron(CronExpression.EVERY_HOUR)
  async handleHourlyBalanceCheck() {
    this.logger.log('Executing hourly relayer gas balance check...');
    await this.checkBalance();
  }

  public getRelayerStatus() {
    return this.cachedStatus;
  }

  /**
   * Checks relayer wallet native gas balance with 6-hour alert throttling (P2-16)
   */
  async checkBalance(): Promise<{ address: string; balanceFormatted: string; isLow: boolean }> {
    try {
      const balance = await this.solana.getFeePayerBalance();
      const address = balance.address;
      const balanceFormatted = balance.sol;
      const balanceNum = parseFloat(balanceFormatted);
      const isLow = balanceNum < this.minThresholdSol;

      this.cachedStatus = {
        healthy: !isLow,
        address,
        balance: balanceFormatted,
        isLow,
      };

      if (isLow) {
        this.logger.error(
          `[CRITICAL] Solana fee payer (${address}) balance LOW: ${balanceFormatted} SOL (Threshold: ${this.minThresholdSol} SOL). Sponsored execution at risk!`
        );

        const now = Date.now();
        const sixHoursMs = 6 * 60 * 60 * 1000;
        const balanceDroppedSignificantly = balanceNum < this.lastCheckedBalanceNum * 0.5;

        // Fix: P2-16 Throttle alerts to 1 per 6 hours unless balance dropped significantly
        if (now - this.lastAlertSentAt >= sixHoursMs || balanceDroppedSignificantly) {
          this.lastAlertSentAt = now;
          this.lastCheckedBalanceNum = balanceNum;

          const adminTelegramId = process.env.ADMIN_TELEGRAM_CHAT_ID || process.env.ADMIN_TELEGRAM_ID;
          if (adminTelegramId && this.platformService) {
            const alertText = `🚨 *[CRITICAL] VeriAgent Pay Relayer Gas Low*\n\n` +
                              `• *Relayer Address:* \`${address}\`\n` +
                              `• *Current Balance:* ${balanceFormatted} SOL\n` +
                              `• *Minimum Required:* ${this.minThresholdSol} SOL\n\n` +
                              `⚠️ Please top up relayer wallet to ensure user claims and UserOps continue operating.`;
            await this.platformService.sendDirectMessage('telegram', adminTelegramId, alertText);
          }
        }
      } else {
        this.logger.log(`Relayer wallet (${address}) operational gas balance: ${balanceFormatted} native tokens.`);
      }

      return { address, balanceFormatted, isLow };
    } catch (e: any) {
      const errString = `${e.message || ''} ${e.code || ''}`.toLowerCase();
      const isUnavailable = errString.includes('timeout') || errString.includes('etimedout') || errString.includes('econnreset') || errString.includes('503') || errString.includes('service temporarily unavailable') || errString.includes('server_error');
      if (isUnavailable) {
        this.logger.warn(`RPC endpoint temporarily unavailable when querying relayer balance (${e.message}). Using last known cached balance (${this.cachedStatus.balance} tokens).`);
      } else {
        this.logger.error(`Failed to query relayer wallet balance: ${e.message}`);
      }
      return {
        address: this.cachedStatus.address,
        balanceFormatted: this.cachedStatus.balance,
        isLow: this.cachedStatus.isLow,
      };
    }
  }
}
