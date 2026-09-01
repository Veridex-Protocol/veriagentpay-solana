import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ethers } from 'ethers';
import { PrismaService } from '../prisma/prisma.service';

import { createBotChainProvider } from '../common/rpc-provider.helper';

const BALANCE_OF_ABI = ['function balanceOf(address) view returns (uint256)'];

/**
 * Refreshes cached balances for user-added tokens, daily, from chain.
 *
 * Why balances rather than deposit history
 *
 *   The deposit listener discards transfers of tokens it cannot identify, so a
 *   token added on Tuesday has no record of what arrived on Monday. Those
 *   entries are deliberately not backfilled: we did not observe them with
 *   enough information to describe them, and inventing ledger rows from a
 *   later balance would produce history that never happened.
 *
 *   Reading the balance sidesteps the question. It is authoritative regardless
 *   of what history we hold, so a user who adds a token they have held for
 *   months sees the right number immediately — they just do not see a deposit
 *   feed for the period before we were watching, which is honest.
 *
 *   From the add onward the listener credits deposits normally, so this is a
 *   safety net and a display convenience, not the primary path.
 */
@Injectable()
export class TokenBalanceReconciliationCron {
  private readonly logger = new Logger(TokenBalanceReconciliationCron.name);
  private readonly provider = createBotChainProvider();

  /** Bounds concurrent RPC calls; the node is shared with the payment path. */
  private readonly batchSize = Number(process.env.TOKEN_BALANCE_BATCH || 20);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async reconcile(): Promise<void> {
    await this.run();
  }

  /**
   * @returns Counts for logging and for the manual trigger.
   * @dev Separated from the schedule so it can be invoked directly — after a
   *      bulk import, or to verify behaviour — without waiting for 3am.
   */
  async run(): Promise<{ checked: number; updated: number; failed: number }> {
    const rows = await this.prisma.userToken.findMany({
      where: { removedAt: null },
      select: {
        id: true,
        address: true,
        symbol: true,
        lastBalanceRaw: true,
        user: { select: { smartWallet: { select: { address: true } } } },
      },
    });

    // A user without a deployed wallet has nothing to read.
    const pending = rows.filter((row) => row.user?.smartWallet?.address);
    let updated = 0;
    let failed = 0;

    for (let i = 0; i < pending.length; i += this.batchSize) {
      const batch = pending.slice(i, i + this.batchSize);

      await Promise.all(
        batch.map(async (row) => {
          const wallet = row.user!.smartWallet!.address;
          try {
            const erc20 = new ethers.Contract(row.address, BALANCE_OF_ABI, this.provider);
            const balance: bigint = await erc20.balanceOf(wallet);
            const raw = balance.toString();

            // Skip the write when nothing moved. Most tokens are idle most
            // days, and this keeps the daily churn proportional to real
            // activity rather than to the size of the table.
            if (raw === row.lastBalanceRaw) return;

            await this.prisma.userToken.update({
              where: { id: row.id },
              data: { lastBalanceRaw: raw, balanceSyncedAt: new Date() },
            });
            updated++;
          } catch (err: any) {
            // One unreachable or non-conforming contract must not stop the
            // sweep — a user can add any address, including a broken one.
            failed++;
            this.logger.warn(
              `Balance read failed for ${row.symbol} (${row.address}): ${err.message}`,
            );
          }
        }),
      );
    }

    this.logger.log(
      `Token balance reconciliation: ${pending.length} checked, ${updated} updated, ${failed} failed.`,
    );
    return { checked: pending.length, updated, failed };
  }
}
