import { BadRequestException, Controller, Get, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { GrowthService } from './growth.service';
import { WeeklyWrappedService } from './weekly-wrapped.service';

@Controller('api/streaks')
export class StreaksController {
  constructor(
    private readonly growthService: GrowthService,
    private readonly weeklyWrapped: WeeklyWrappedService,
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

  /** Streak counters plus the 30-day deposit calendar. */
  @Get()
  @UseGuards(JwtAuthGuard)
  async getStreak(@Req() req: any) {
    const userId = await this.resolveUserId(req);
    return this.growthService.getInteractionStreak(userId);
  }

  /** This week's running recap, same shape as the Monday card. */
  @Get('wrapped')
  @UseGuards(JwtAuthGuard)
  async getWrapped(@Req() req: any) {
    const userId = await this.resolveUserId(req);
    return this.weeklyWrapped.getCurrentWeekWrapped(userId);
  }
}
