import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Headers,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { GrowthService } from './growth.service';
import { WalletAddress } from '../auth/decorators/wallet-address.decorator';
import { Throttle } from '@nestjs/throttler';

@Controller('api')
export class GrowthController {
  constructor(private readonly growthService: GrowthService) {}

  // --- Public Red Envelope Drops ---
  @Post('envelopes/public')
  async createPublicEnvelope(
    @WalletAddress() walletAddress: string,
    @Body() dto: { token?: string; totalAmount: number; maxClaims: number }
  ) {
    const creatorId = walletAddress;
    return await this.growthService.createPublicEnvelope(creatorId, dto);
  }

  @Get('envelopes/public/:id')
  async getPublicEnvelope(@Param('id') id: string) {
    const envelope = await this.growthService.getPublicEnvelope(id);
    return { envelope };
  }

  @Post('envelopes/public/:id/claim')
  async claimPublicEnvelope(
    @Param('id') id: string,
    @WalletAddress() walletAddress: string
  ) {
    const claimerAddress = walletAddress;
    return await this.growthService.claimPublicEnvelope(id, claimerAddress);
  }

  // --- Managed KOL Vaults & White-Label ---
  @Post('vaults/managed')
  async createManagedVault(
    @WalletAddress() walletAddress: string,
    @Body() dto: { name: string; symbol: string; token?: string; performanceFeeBps: number }
  ) {
    const creatorId = walletAddress;
    return await this.growthService.createManagedVault(creatorId, dto);
  }

  @Post('vaults/white-label')
  async createWhiteLabelVault(
    @WalletAddress() walletAddress: string,
    @Body() dto: { name: string; symbol: string; token?: string; performanceFeeBps: number }
  ) {
    const creatorId = walletAddress;
    return await this.growthService.createManagedVault(creatorId, dto);
  }

  @Get('vaults/managed')
  async getManagedVaults() {
    const vaults = await this.growthService.getManagedVaults();
    return { vaults };
  }

  // --- Airdrop & Claim Flow ---
  @Get('airdrop/eligibility')
  async checkAirdropEligibility(@Query('wallet') wallet: string) {
    const targetWallet = wallet;
    return await this.growthService.checkAirdropEligibility(targetWallet);
  }

  @Post('airdrop/claim')
  @Throttle({ short: { ttl: 3_600_000, limit: 3 } })
  async claimAirdrop(@Req() req: any) {
    const userId = req.user?.userId;
    if (!userId) throw new UnauthorizedException('Authentication required');
    return await this.growthService.claimAirdrop(userId);
  }

  // --- Interaction Streak ---
  /**
   * @deprecated Use `GET /api/streaks`, which resolves the caller from their
   * auth token. Kept so existing clients keep working during rollout.
   */
  @Get('savings/streak')
  async getSavingsStreak(@WalletAddress() walletAddress: string) {
    // Streaks are keyed by User.id; a wallet address must be resolved first.
    const userId = await this.growthService.resolveUserIdByWallet(walletAddress);
    if (!userId) {
      return {
        streak: {
          currentStreak: 0,
          longestStreak: 0,
          totalBonusPoints: 0,
          lastActiveDate: null,
          history: [],
        },
      };
    }
    const streak = await this.growthService.getInteractionStreak(userId);
    return { streak };
  }

  // --- Yield Leaderboard ---
  @Get('leaderboard')
  async getLeaderboard() {
    return await this.growthService.getLeaderboard();
  }

  // --- Merchant Payment Links ---
  @Post('merchant/link')
  async generateMerchantLink(@Body() dto: { to: string; amount: number; token?: string; note?: string }) {
    return await this.growthService.generateMerchantLink(dto);
  }

  // --- Ambassador Badges ---
  @Get('ambassadors/me')
  async getAmbassadorProfile(@WalletAddress() walletAddress: string) {
    const ambassadorId = walletAddress;
    return await this.growthService.getAmbassadorProfile(ambassadorId);
  }

  // --- Referrals (backwards compatibility alias for ambassadors/me) ---
  @Get('referrals')
  async getReferrals(@WalletAddress() walletAddress: string) {
    return await this.getAmbassadorProfile(walletAddress);
  }
}
