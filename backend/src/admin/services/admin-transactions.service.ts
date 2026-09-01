import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AdminTransactionsService {
  constructor(private readonly prisma: PrismaService) {}

  async getTransactions(params: {
    page?: number;
    limit?: number;
    type?: string;
    status?: string;
    userId?: string;
    token?: string;
    search?: string;
  }) {
    const page = Number(params.page) || 1;
    const limit = Number(params.limit) || 20;
    const skip = (page - 1) * limit;

    // Fetch both ramp transactions AND user activity logs (payments)
    const rampWhere: any = {};
    if (params.userId) rampWhere.userId = params.userId;
    if (params.type && params.type !== 'ALL') rampWhere.type = params.type;
    if (params.status && params.status !== 'ALL') rampWhere.status = params.status;
    if (params.token) rampWhere.tokenAddress = { contains: params.token, mode: 'insensitive' };

    const activityWhere: any = {};
    if (params.userId) activityWhere.userId = params.userId;
    if (params.token) activityWhere.token = { contains: params.token, mode: 'insensitive' };
    // Only include payment-related actions
    activityWhere.action = {
      in: ['TRANSFER_SENT', 'TRANSFER_RECEIVED', 'VAULT_DEPOSIT', 'VAULT_WITHDRAW', 'REQUEST_CREATED', 'ENVELOPE_CREATED', 'ENVELOPE_CLAIMED']
    };

    if (params.search) {
      const query = params.search.trim();
      rampWhere.OR = [
        { externalTxId: { contains: query, mode: 'insensitive' } },
        { chainTxHash: { contains: query, mode: 'insensitive' } },
        { user: { email: { contains: query, mode: 'insensitive' } } },
      ];
      activityWhere.OR = [
        { txHash: { contains: query, mode: 'insensitive' } },
        { user: { email: { contains: query, mode: 'insensitive' } } },
      ];
    }

    const [rampTransactions, activityLogs, rampTotal, activityTotal] = await Promise.all([
      this.prisma.rampTransaction.findMany({
        where: rampWhere,
        take: limit,
        skip,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: { id: true, email: true, username: true, telegramId: true },
          },
        },
      }),
      this.prisma.userActivityLog.findMany({
        where: activityWhere,
        take: limit,
        skip,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: { id: true, email: true, username: true, telegramId: true },
          },
        },
      }),
      this.prisma.rampTransaction.count({ where: rampWhere }),
      this.prisma.userActivityLog.count({ where: activityWhere }),
    ]);

    // Normalize activity logs to match ramp transaction format
    const normalizedActivity = activityLogs.map(log => ({
      id: log.id,
      userId: log.userId,
      user: log.user,
      type: this.mapActionToType(log.action),
      status: 'COMPLETED', // Activity logs are already completed
      amount: Number(log.amount) || 0,
      amountFiat: Number(log.amount) || 0,
      fiatCurrency: null,
      tokenAddress: log.token || 'USDC',
      chainTxHash: log.txHash,
      externalTxId: null,
      provider: 'BLOCKCHAIN' as any,
      createdAt: log.createdAt,
      metadata: log.metadata,
    }));

    // Combine and sort by date
    const allTransactions = [...rampTransactions, ...normalizedActivity]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);

    const total = rampTotal + activityTotal;

    return {
      transactions: allTransactions,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  private mapActionToType(action: string): string {
    const mapping: Record<string, string> = {
      TRANSFER_SENT: 'WITHDRAWAL',
      TRANSFER_RECEIVED: 'DEPOSIT',
      VAULT_DEPOSIT: 'DEPOSIT',
      VAULT_WITHDRAW: 'WITHDRAWAL',
      ENVELOPE_CREATED: 'WITHDRAWAL',
      ENVELOPE_CLAIMED: 'DEPOSIT',
      REQUEST_CREATED: 'PENDING',
    };
    return mapping[action] || 'DEPOSIT';
  }

  async getTransactionById(id: string) {
    const tx = await this.prisma.rampTransaction.findUnique({
      where: { id },
      include: {
        user: {
          include: { smartWallet: true },
        },
      },
    });

    if (!tx) throw new NotFoundException(`Transaction with ID ${id} not found`);
    return tx;
  }

  async getSummary() {
    const [totalCount, completedCount, volumeAggregate, activityCount] = await Promise.all([
      this.prisma.rampTransaction.count(),
      this.prisma.rampTransaction.count({ where: { status: 'COMPLETED' } }),
      this.prisma.rampTransaction.aggregate({
        _sum: { amountFiat: true },
      }),
      this.prisma.userActivityLog.count(),
    ]);

    const totalVolume = volumeAggregate._sum.amountFiat || 0;
    const feeRevenue = totalVolume * 0.015; // 1.5% estimated protocol cut

    return {
      totalTransactions: totalCount,
      completedTransactions: completedCount,
      totalVolumeUsd: totalVolume,
      feeRevenueUsd: feeRevenue,
      activityLogEvents: activityCount,
      successRate: totalCount > 0 ? ((completedCount / totalCount) * 100).toFixed(1) + '%' : '100%',
    };
  }
}
