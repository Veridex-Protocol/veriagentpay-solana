import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminAuditService } from '../admin-audit.service';

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AdminAuditService,
  ) {}

  async getUsers(params: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
  }) {
    const page = Number(params.page) || 1;
    const limit = Number(params.limit) || 20;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (params.search) {
      const query = params.search.trim();
      where.OR = [
        { email: { contains: query, mode: 'insensitive' } },
        { username: { contains: query, mode: 'insensitive' } },
        { telegramId: { contains: query, mode: 'insensitive' } },
        { smartWallet: { address: { contains: query, mode: 'insensitive' } } },
      ];
    }

    if (params.status && params.status !== 'ALL') {
      where.status = params.status.toUpperCase() as UserStatus;
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        take: limit,
        skip,
        orderBy: { createdAt: 'desc' },
        include: {
          smartWallet: true,
          _count: {
            select: {
              transactions: true,
              activityLogs: true,
              sessionKeys: true,
              vaultDeposits: true,
              createdPools: true,
            },
          },
          transactions: { select: { amountFiat: true } },
          activityLogs: { select: { amount: true } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    const formattedUsers = users.map((u) => {
      const totalRampVol = (u.transactions || []).reduce((sum, t) => sum + Number(t.amountFiat || 0), 0);
      const totalActVol = (u.activityLogs || []).reduce((sum, a) => sum + Number(a.amount || 0), 0);
      return {
        id: u.id,
        email: u.email || 'N/A',
        username: u.username || u.telegramId || 'Anonymous',
        walletAddress: u.smartWallet?.address || 'Not Deployed',
        status: u.status,
        reputationPoints: u.reputationPoints,
        createdAt: u.createdAt,
        totalTransactions: u._count.transactions + u._count.activityLogs,
        activeSessionKeys: u._count.sessionKeys,
        vaultDepositsCount: u._count.vaultDeposits,
        totalVolumeUsd: totalRampVol + totalActVol,
      };
    });

    return {
      users: formattedUsers,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getUserById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        smartWallet: true,
        sessionKeys: { orderBy: { createdAt: 'desc' } },
        vaultDeposits: { orderBy: { createdAt: 'desc' } },
        vaultWithdrawals: { orderBy: { createdAt: 'desc' } },
        loanApplications: { orderBy: { createdAt: 'desc' }, take: 10 },
        notificationPreferences: true,
        adminNotes: { include: { admin: true }, orderBy: { createdAt: 'desc' } },
        activityLogs: { orderBy: { createdAt: 'desc' } },
        transactions: { orderBy: { createdAt: 'desc' } },
        badges: true,
      },
    });

    if (!user) throw new NotFoundException(`User with ID ${id} not found`);

    // 1. Gather deposits from VaultDeposit model AND UserActivityLog (action = VAULT_DEPOSIT)
    const depositsList = [
      ...(user.vaultDeposits || []).map(d => ({
        id: d.id,
        type: 'DEPOSIT',
        amount: Number(d.amount || 0),
        token: d.token || 'USDC',
        txHash: d.txHash,
        createdAt: d.createdAt,
      })),
      ...(user.activityLogs || [])
        .filter(a => a.action === 'VAULT_DEPOSIT')
        .map(a => ({
          id: a.id,
          type: 'DEPOSIT',
          amount: Number(a.amount || 0),
          token: a.token || 'USDC',
          txHash: a.txHash,
          createdAt: a.createdAt,
        })),
    ];

    const uniqueDeposits = Array.from(
      new Map(depositsList.map(item => [item.txHash || item.id, item])).values()
    );

    // 2. Gather withdrawals from VaultWithdrawal model AND UserActivityLog (action = VAULT_WITHDRAW)
    const withdrawalsList = [
      ...(user.vaultWithdrawals || []).map(w => ({
        id: w.id,
        type: 'WITHDRAWAL',
        amount: Number(w.amount || 0),
        token: w.token || 'USDC',
        txHash: w.txHash,
        createdAt: w.createdAt,
      })),
      ...(user.activityLogs || [])
        .filter(a => a.action === 'VAULT_WITHDRAW')
        .map(a => ({
          id: a.id,
          type: 'WITHDRAWAL',
          amount: Number(a.amount || 0),
          token: a.token || 'USDC',
          txHash: a.txHash,
          createdAt: a.createdAt,
        })),
    ];

    const uniqueWithdrawals = Array.from(
      new Map(withdrawalsList.map(item => [item.txHash || item.id, item])).values()
    );

    const totalDeposits = uniqueDeposits.reduce((sum, d) => sum + d.amount, 0);
    const totalWithdrawals = uniqueWithdrawals.reduce((sum, w) => sum + w.amount, 0);

    const vaultTransactions = [...uniqueDeposits, ...uniqueWithdrawals].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    // Calculate overall account statistics
    const totalRampVolume = (user.transactions || []).reduce((sum, t) => sum + Number(t.amountFiat || 0), 0);
    const totalActivityVolume = (user.activityLogs || []).reduce((sum, a) => sum + Number(a.amount || 0), 0);
    const totalVolumeUsd = totalRampVolume + totalActivityVolume;
    const totalTransactionsCount = (user.transactions?.length || 0) + (user.activityLogs?.length || 0);
    const activeSessionKeysCount = (user.sessionKeys || []).filter(k => !k.revokedAt).length;

    return {
      ...user,
      accountStats: {
        totalVolumeUsd,
        totalTransactionsCount,
        activeSessionKeysCount,
        totalBadgesCount: user.badges?.length || 0,
      },
      vaultStats: {
        totalDeposits,
        totalWithdrawals,
        netTvl: Math.max(0, totalDeposits - totalWithdrawals),
      },
      vaultTransactions,
    };
  }

  async updateUserStatus(id: string, status: UserStatus, admin: { id: string; email: string }, reason?: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    const updated = await this.prisma.user.update({
      where: { id },
      data: { status },
    });

    // Revoke active session keys if suspended or blacklisted
    if (status === UserStatus.BLACKLISTED) {
      await this.prisma.sessionKey.updateMany({
        where: { userId: id },
        data: { revokedAt: new Date() },
      });
    }

    await this.auditService.logAction({
      adminId: admin.id,
      adminEmail: admin.email,
      action: `USER_STATUS_UPDATED_${status}`,
      target: id,
      details: { previousStatus: user.status, newStatus: status, reason },
    });

    return { success: true, user: updated };
  }

  async addAdminNote(userId: string, noteText: string, admin: { id: string; email: string }) {
    if (!noteText || noteText.trim().length === 0) {
      throw new BadRequestException('Note text cannot be empty');
    }

    const note = await this.prisma.adminNote.create({
      data: {
        userId,
        adminId: admin.id,
        note: noteText.trim(),
      },
      include: { admin: true },
    });

    await this.auditService.logAction({
      adminId: admin.id,
      adminEmail: admin.email,
      action: 'ADD_ADMIN_NOTE',
      target: userId,
      details: { noteId: note.id },
    });

    return note;
  }

  async getUserActivity(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.userActivityLog.findMany({
        where: { userId },
        take: limit,
        skip,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.userActivityLog.count({ where: { userId } }),
    ]);

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getUserTransactions(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    // Fetch both ramp transactions AND user activity logs (payments, vault transactions)
    const [rampTxs, activityLogs, rampCount, activityCount] = await Promise.all([
      this.prisma.rampTransaction.findMany({
        where: { userId },
        take: limit,
        skip,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.userActivityLog.findMany({
        where: {
          userId,
          action: {
            in: ['TRANSFER_SENT', 'TRANSFER_RECEIVED', 'VAULT_DEPOSIT', 'VAULT_WITHDRAW', 'ENVELOPE_CREATED', 'ENVELOPE_CLAIMED']
          }
        },
        take: limit,
        skip,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.rampTransaction.count({ where: { userId } }),
      this.prisma.userActivityLog.count({
        where: {
          userId,
          action: {
            in: ['TRANSFER_SENT', 'TRANSFER_RECEIVED', 'VAULT_DEPOSIT', 'VAULT_WITHDRAW', 'ENVELOPE_CREATED', 'ENVELOPE_CLAIMED']
          }
        }
      }),
    ]);

    // Normalize activity logs to match transaction format
    const normalizedActivity = activityLogs.map(log => ({
      id: log.id,
      userId: log.userId,
      type: this.mapActionToType(log.action),
      status: 'COMPLETED',
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

    // Combine and sort
    const items = [...rampTxs, ...normalizedActivity]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);

    const total = rampCount + activityCount;

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getUserVaultActivity(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    // Only fetch vault-related activity logs
    const [vaultLogs, total] = await Promise.all([
      this.prisma.userActivityLog.findMany({
        where: {
          userId,
          action: { in: ['VAULT_DEPOSIT', 'VAULT_WITHDRAW'] }
        },
        take: limit,
        skip,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.userActivityLog.count({
        where: {
          userId,
          action: { in: ['VAULT_DEPOSIT', 'VAULT_WITHDRAW'] }
        }
      }),
    ]);

    // Normalize to transaction format
    const items = vaultLogs.map(log => ({
      id: log.id,
      type: log.action === 'VAULT_DEPOSIT' ? 'DEPOSIT' : 'WITHDRAWAL',
      amount: log.amount || 0,
      token: log.token || 'USDC',
      txHash: log.txHash,
      createdAt: log.createdAt,
      metadata: log.metadata,
    }));

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
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
}
