import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ethers } from 'ethers';
import { PrismaService } from '../prisma/prisma.service';
import { createBotChainProvider } from '../common/rpc-provider.helper';

const RECOVERY_EXECUTED_TOPIC = ethers.id('RecoveryExecuted(bytes32,bytes32)');
const CURSOR_NAME = 'vault-recovery';

/**
 * Monitors PayVault RecoveryExecuted events on-chain.
 *
 * When a vault's ownership is rotated via social recovery, this service:
 * 1. Identifies which user was displaced by correlating the vault address
 * 2. Logs the event to the RecoveryLog table for refund tracking
 * 3. Records a RECOVERY_EXECUTED activity for audit trail
 *
 * The protocol guardian (KMS/multisig) can initiate recovery for users who
 * lost their passkey. The 48h timelock means the real owner can always cancel.
 */
@Injectable()
export class RecoveryListenerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RecoveryListenerService.name);

  private provider!: ethers.JsonRpcProvider | ethers.FallbackProvider;
  private chainId!: number;
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private stopped = false;

  private readonly pollIntervalMs = Number(process.env.RECOVERY_POLL_INTERVAL_MS || 10_000);
  private readonly maxBlockSpan = Number(process.env.RECOVERY_MAX_BLOCK_SPAN || 5000);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    this.provider = createBotChainProvider();
    const network = await this.provider.getNetwork();
    this.chainId = Number(network.chainId);
    this.logger.log(`Recovery listener started on chain ${this.chainId}`);
    this.schedule();
  }

  onModuleDestroy() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
  }

  private schedule() {
    if (this.stopped) return;
    this.timer = setTimeout(() => this.poll(), this.pollIntervalMs);
  }

  private async poll() {
    if (this.running || this.stopped) return this.schedule();
    this.running = true;

    try {
      const cursor = await this.prisma.indexerCursor.findUnique({
        where: { name_chainId: { name: CURSOR_NAME, chainId: this.chainId } },
      });

      const fromBlock = cursor ? Number(cursor.lastBlock) + 1 : 0;
      const latest = await this.provider.getBlockNumber();
      if (fromBlock > latest) {
        this.running = false;
        return this.schedule();
      }

      const toBlock = Math.min(fromBlock + this.maxBlockSpan - 1, latest);

      const logs = await this.provider.getLogs({
        fromBlock,
        toBlock,
        topics: [RECOVERY_EXECUTED_TOPIC],
      });

      for (const log of logs) {
        try {
          await this.processRecoveryEvent(log);
        } catch (eventErr) {
          this.logger.error(
            `Failed to process recovery event tx ${log.transactionHash}: ${(eventErr as Error).message}`,
            (eventErr as Error).stack,
          );
        }
      }

      await this.prisma.indexerCursor.upsert({
        where: { name_chainId: { name: CURSOR_NAME, chainId: this.chainId } },
        create: { name: CURSOR_NAME, chainId: this.chainId, lastBlock: BigInt(toBlock) },
        update: { lastBlock: BigInt(toBlock) },
      });
    } catch (err) {
      this.logger.error('Recovery poll failed', (err as Error).message);
    }

    this.running = false;
    this.schedule();
  }

  private async processRecoveryEvent(log: ethers.Log) {
    const vaultAddress = log.address.toLowerCase();
    const oldOwnerKeyHash = log.topics[1];
    const newOwnerKeyHash = log.topics[2];
    const txHash = log.transactionHash;

    const existing = await this.prisma.recoveryLog.findUnique({ where: { txHash } });
    if (existing) return;

    const wallet = await this.prisma.smartWallet.findFirst({
      where: { address: { equals: vaultAddress, mode: 'insensitive' } },
      include: { user: true },
    });

    const displacedUserId = wallet?.userId ?? null;

    await this.prisma.recoveryLog.create({
      data: {
        vaultAddress,
        displacedUserId,
        oldOwnerKeyHash,
        newOwnerKeyHash,
        txHash,
        blockNumber: BigInt(log.blockNumber),
      },
    });

    if (displacedUserId) {
      await this.prisma.userActivityLog.create({
        data: {
          userId: displacedUserId,
          action: 'RECOVERY_EXECUTED',
          txHash,
          metadata: { vaultAddress, oldOwnerKeyHash, newOwnerKeyHash },
        },
      });

      this.logger.warn(
        `[Recovery] Vault ${vaultAddress} ownership rotated. ` +
          `Displaced user: ${displacedUserId} (${wallet?.user?.username || 'unknown'}). ` +
          `Tx: ${txHash}. Refund pending.`,
      );
    } else {
      this.logger.warn(
        `[Recovery] Vault ${vaultAddress} ownership rotated but no matching user found. Tx: ${txHash}`,
      );
    }
  }
}
