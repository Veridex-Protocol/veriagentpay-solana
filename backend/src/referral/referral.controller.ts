import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { ReferralService } from './referral.service';
import { ReferralLeaderboardService, LeaderboardPeriod } from './referral-leaderboard.service';

@Controller('api/referrals')
export class ReferralController {
  constructor(
    private readonly referralService: ReferralService,
    private readonly leaderboardService: ReferralLeaderboardService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Resolves the authenticated principal to a User id. The JWT guard stores
   * either a user id or a wallet address, so both are accepted.
   */
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

  /** Everything the web referral page renders, in one call. */
  @Get()
  @UseGuards(JwtAuthGuard)
  async getDashboard(@Req() req: any) {
    const userId = await this.resolveUserId(req);
    return this.referralService.getReferralDashboard(userId);
  }

  /** The caller's referral code plus an attributed share URL. */
  @Get('code')
  @UseGuards(JwtAuthGuard)
  async getCode(@Req() req: any, @Query('src') src?: string) {
    const userId = await this.resolveUserId(req);
    const code = await this.referralService.getOrCreateReferralCode(userId);
    return {
      code,
      shareUrl: this.referralService.buildShareUrl(code, src || 'web'),
    };
  }

  /** Full referral progress for the caller. */
  @Get('stats')
  @UseGuards(JwtAuthGuard)
  async getStats(@Req() req: any) {
    const userId = await this.resolveUserId(req);
    return this.referralService.getUserReferralStats(userId);
  }

  /** Public leaderboard ranked by verified activations, not raw signups. */
  @Get('leaderboard')
  async getLeaderboard(
    @Query('period') period: LeaderboardPeriod = 'week',
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = Math.min(Math.max(Number(limit) || 100, 1), 100);
    return this.leaderboardService.getLeaderboard(period, parsedLimit);
  }

  /**
   * Records the device fingerprint captured during onboarding. Used only to
   * block self-referral rings.
   */
  @Post('device-fingerprint')
  @UseGuards(JwtAuthGuard)
  async recordFingerprint(@Req() req: any, @Body() body: { fingerprint?: string }) {
    if (!body?.fingerprint) throw new BadRequestException('fingerprint is required');
    const userId = await this.resolveUserId(req);
    await this.referralService.recordDeviceFingerprint(userId, body.fingerprint);
    return { success: true };
  }
}
