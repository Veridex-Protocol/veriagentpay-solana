import { Injectable, NotFoundException } from '@nestjs/common';
import { UserActivityAction } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const INFLOW_ACTIONS = new Set<UserActivityAction>([
  UserActivityAction.TRANSFER_RECEIVED,
  UserActivityAction.VAULT_DEPOSIT,
  UserActivityAction.POOL_DEPOSIT,
  UserActivityAction.LOAN_BORROWED,
  UserActivityAction.ENVELOPE_CLAIMED,
  UserActivityAction.FIAT_DEPOSIT,
]);

const OUTFLOW_ACTIONS = new Set<UserActivityAction>([
  UserActivityAction.TRANSFER_SENT,
  UserActivityAction.VAULT_WITHDRAW,
  UserActivityAction.POOL_WITHDRAW,
  UserActivityAction.LOAN_REPAID,
  UserActivityAction.ENVELOPE_CREATED,
  UserActivityAction.FIAT_WITHDRAW,
]);

@Injectable()
export class AdminUsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getUsers() {
    const users = await this.prisma.user.findMany({
      include: {
        smartWallet: { select: { address: true } },
        activityLogs: {
          select: { action: true, amount: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
        },
        poolMemberships: { select: { depositedAmount: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      users: users.map((user) => {
        const vaultNet = this.netAmount(user.activityLogs, UserActivityAction.VAULT_DEPOSIT, UserActivityAction.VAULT_WITHDRAW);
        const poolTvl = user.poolMemberships.reduce((sum, membership) => sum + Number(membership.depositedAmount), 0);

        return {
          id: user.id,
          username: user.username,
          email: user.email,
          address: user.smartWallet?.address ?? null,
          joinedAt: user.createdAt,
          tvlUsd: Math.max(0, vaultNet + poolTvl),
          totalTransactions: user.activityLogs.length,
          lastActiveAt: user.activityLogs[0]?.createdAt ?? user.updatedAt,
          status: user.status,
          reputationPoints: user.reputationPoints,
        };
      }),
    };
  }

  async getUserDetail(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        smartWallet: true,
        socialNodes: { orderBy: { createdAt: 'asc' } },
        activityLogs: { orderBy: { createdAt: 'desc' }, take: 100 },
        poolMemberships: { select: { depositedAmount: true, reputationPoints: true } },
      },
    });

    if (!user) throw new NotFoundException('User not found');

    const amountFor = (action: UserActivityAction) =>
      user.activityLogs
        .filter((event) => event.action === action)
        .reduce((sum, event) => sum + Number(event.amount ?? 0), 0);
    const countFor = (action: UserActivityAction) =>
      user.activityLogs.filter((event) => event.action === action).length;

    const totalSent = amountFor(UserActivityAction.TRANSFER_SENT);
    const totalReceived = amountFor(UserActivityAction.TRANSFER_RECEIVED);
    const vaultDeposits = amountFor(UserActivityAction.VAULT_DEPOSIT);
    const vaultWithdrawals = amountFor(UserActivityAction.VAULT_WITHDRAW);
    const poolDeposits = user.poolMemberships.reduce((sum, membership) => sum + Number(membership.depositedAmount), 0);

    return {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        status: user.status,
        joinedAt: user.createdAt,
        lastActiveAt: user.activityLogs[0]?.createdAt ?? user.updatedAt,
        reputationPoints:
          user.reputationPoints + user.poolMemberships.reduce((sum, membership) => sum + membership.reputationPoints, 0),
        wallet: user.smartWallet
          ? { address: user.smartWallet.address, isDeployed: user.smartWallet.isDeployed }
          : null,
        socialAccounts: user.socialNodes.map((node) => ({
          platform: node.platform,
          username: node.username,
          platformUserId: node.platformUserId,
        })),
      },
      stats: {
        totalSent,
        totalReceived,
        vaultDeposits,
        vaultWithdrawals,
        currentTvlUsd: Math.max(0, vaultDeposits - vaultWithdrawals + poolDeposits),
        loansBorrowed: amountFor(UserActivityAction.LOAN_BORROWED),
        loansRepaid: amountFor(UserActivityAction.LOAN_REPAID),
        redEnvelopesCreated: countFor(UserActivityAction.ENVELOPE_CREATED),
        redEnvelopesClaimed: countFor(UserActivityAction.ENVELOPE_CLAIMED),
        totalTransactions: user.activityLogs.length,
      },
      activity: user.activityLogs.map((event) => ({
        id: event.id,
        action: event.action,
        direction: INFLOW_ACTIONS.has(event.action) ? 'in' : OUTFLOW_ACTIONS.has(event.action) ? 'out' : 'neutral',
        amount: event.amount === null ? null : Number(event.amount),
        token: event.token,
        txHash: event.txHash,
        metadata: event.metadata,
        createdAt: event.createdAt,
      })),
    };
  }

  private netAmount(
    events: Array<{ action: UserActivityAction; amount: unknown }>,
    depositAction: UserActivityAction,
    withdrawAction: UserActivityAction,
  ) {
    return events.reduce((total, event) => {
      const amount = Number(event.amount ?? 0);
      if (event.action === depositAction) return total + amount;
      if (event.action === withdrawAction) return total - amount;
      return total;
    }, 0);
  }
}
