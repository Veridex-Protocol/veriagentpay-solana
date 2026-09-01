import { Injectable, NotFoundException } from '@nestjs/common';
import { LoanStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AdminLendingService {
  constructor(private readonly prisma: PrismaService) {}

  async getPools() {
    const pools = await this.prisma.groupPool.findMany({
      include: {
        creator: { select: { email: true, username: true } },
        members: true,
        loans: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return pools.map((p) => {
      const totalBalance = Number(p.poolBalance || 0);
      const activeLoans = p.loans.filter((l) => l.status === LoanStatus.EXECUTED || l.status === LoanStatus.DEFAULTED);
      const overdueLoans = p.loans.filter((l) => l.status === LoanStatus.DEFAULTED);
      const defaultRate = p.loans.length > 0 ? ((overdueLoans.length / p.loans.length) * 100).toFixed(1) + '%' : '0.0%';

      return {
        id: p.id,
        name: p.name,
        token: p.token,
        contractAddress: process.env.GROUP_LENDING_POOL_ADDRESS || '0x37119318fEEa5ceE063A451313346FA486E167Fd',
        creator: p.creator?.email || p.creator?.username || 'Anonymous',
        totalBalanceUsd: totalBalance,
        membersCount: p.members.length,
        activeLoansCount: activeLoans.length,
        defaultRate,
        createdAt: p.createdAt,
      };
    });
  }

  async getPoolById(id: string) {
    const pool = await this.prisma.groupPool.findUnique({
      where: { id },
      include: {
        creator: { select: { id: true, email: true, username: true } },
        members: { include: { user: { select: { email: true, username: true } } } },
        loans: { include: { borrower: { select: { email: true, username: true } } } },
      },
    });

    if (!pool) throw new NotFoundException(`Pool with ID ${id} not found`);
    return pool;
  }

  async getPoolLoans(poolId: string) {
    const loans = await this.prisma.loanApplication.findMany({
      where: { poolId },
      include: { borrower: { select: { email: true, username: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return loans;
  }

  async getLoanById(id: string) {
    const loan = await this.prisma.loanApplication.findUnique({
      where: { id },
      include: {
        borrower: { select: { id: true, email: true, username: true, smartWallet: true } },
        pool: true,
      },
    });

    if (!loan) throw new NotFoundException(`Loan with ID ${id} not found`);
    return loan;
  }
}
