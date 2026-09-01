import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ethers } from 'ethers';
import { createRelayerSigner } from '../../relayer/relayer-signer.factory';
import { createBotChainProvider } from '../../common/rpc-provider.helper';

@Injectable()
export class AdminSystemService {
  private readonly rpcUrl = process.env.BOTCHAIN_RPC_URL || 'https://rpc.bohr.life/';
  private readonly provider = createBotChainProvider();

  constructor(private readonly prisma: PrismaService) {}

  async getNotifications(page = 1, limit = 50) {
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.notificationLog.findMany({
        take: limit,
        skip,
        orderBy: { sentAt: 'desc' },
        include: { user: { select: { email: true, username: true } } },
      }),
      this.prisma.notificationLog.count(),
    ]);

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getSystemHealth() {
    const startTime = Date.now();
    let rpcHealthy = false;
    let blockNumber = 0;

    try {
      blockNumber = await this.provider.getBlockNumber();
      rpcHealthy = true;
    } catch (e) {}

    const rpcLatencyMs = Date.now() - startTime;

    // Relayer balance check
    let relayerAddress = '0x0';
    let relayerBalanceEth = '0.0';

    {
      try {
        // Reporting only — the address is all this needs, so it works
        // unchanged once signing moves to KMS.
        relayerAddress = await createRelayerSigner(this.provider).getAddress();
        const bal = await this.provider.getBalance(relayerAddress);
        relayerBalanceEth = ethers.formatEther(bal);
      } catch (e) {}
    }

    return {
      status: rpcHealthy ? 'OPERATIONAL' : 'DEGRADED',
      rpc: {
        healthy: rpcHealthy,
        url: this.rpcUrl,
        blockNumber,
        latencyMs: rpcLatencyMs,
      },
      relayer: {
        address: relayerAddress,
        balanceEth: relayerBalanceEth,
        minThresholdEth: process.env.RELAYER_MIN_BALANCE_ETH || '0.5',
        isLowGas: parseFloat(relayerBalanceEth) < parseFloat(process.env.RELAYER_MIN_BALANCE_ETH || '0.5'),
      },
      oracleWorker: {
        status: 'ACTIVE',
        veridexOracleAddress: process.env.VERIDEX_ORACLE_ADDRESS || '0xe53eC5003848c9D0972A34819c75556E4d57f64F',
        attestationIntervalHours: 12,
      },
      timestamp: new Date(),
    };
  }

  async getRelayerInfo() {
    let address: string;
    try {
      address = await createRelayerSigner(this.provider).getAddress();
    } catch {
      return { error: 'Relayer signer not configured' };
    }

    const balance = await this.provider.getBalance(address);
    const feeData = await this.provider.getFeeData().catch(() => null);

    return {
      address,
      balanceEth: ethers.formatEther(balance),
      gasPriceGwei: feeData?.gasPrice ? ethers.formatUnits(feeData.gasPrice, 'gwei') : '20.0',
      minThresholdEth: process.env.RELAYER_MIN_BALANCE_ETH || '0.5',
      recentTxCount: await this.provider.getTransactionCount(address),
    };
  }
}
