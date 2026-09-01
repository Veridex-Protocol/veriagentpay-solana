import { BadRequestException, Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { DepositsService } from './deposits.service';

@Controller('api/deposits')
export class DepositsController {
  constructor(
    private readonly deposits: DepositsService,
    private readonly prisma: PrismaService,
  ) {}

  /** Accepts either a user id or a wallet address from the auth guard. */
  private async resolveUserId(req: any): Promise<string> {
    const principal = req.user?.userId;
    if (!principal) throw new BadRequestException('Authentication required');

    const direct = await this.prisma.user.findUnique({ where: { id: principal } });
    if (direct) return direct.id;

    const byWallet = await this.prisma.user.findFirst({
      where: { smartWallet: { address: { equals: principal, mode: 'insensitive' } } },
    });
    if (byWallet) return byWallet.id;

    throw new BadRequestException('No account found for the authenticated principal');
  }

  /** The caller's receiving address plus the tokens we credit automatically. */
  @Get('address')
  @UseGuards(JwtAuthGuard)
  async getDepositAddress(@Req() req: any) {
    const userId = await this.resolveUserId(req);
    return this.deposits.getDepositAddress(userId);
  }

  /** External deposits, newest first. */
  @Get()
  @UseGuards(JwtAuthGuard)
  async listDeposits(@Req() req: any, @Query('limit') limit?: string) {
    const userId = await this.resolveUserId(req);
    const take = Math.min(Math.max(Number(limit) || 25, 1), 100);
    return this.deposits.listDeposits(userId, take);
  }
}
