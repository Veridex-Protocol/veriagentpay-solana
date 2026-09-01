import { Controller, Get, Query } from '@nestjs/common';
import { BadgesService } from './badges.service';
import { CurrentUserId } from '../auth/decorators/wallet-address.decorator';

@Controller('api')
export class BadgesController {
  constructor(private readonly badgesService: BadgesService) { }

  @Get('badges/my-badges')
  async getMyBadges(@CurrentUserId() userId: string) {
    return await this.badgesService.getUserBadges(userId);
  }

  @Get('leaderboard')
  async getLeaderboard(@Query('limit') limit?: number) {
    return await this.badgesService.getLeaderboard(limit || 100);
  }

  @Get('leaderboard/me/rank')
  async getMyRank(@CurrentUserId() userId: string) {
    return await this.badgesService.getUserRank(userId);
  }

  @Get('share/badge')
  async getShareCardPayload(@CurrentUserId() userId: string) {
    return await this.badgesService.getShareCardData(userId);
  }

  @Get('qr/invite')
  async getInviteQr(@CurrentUserId() userId: string) {
    const inviteUrl = await this.badgesService.getInviteUrl(userId);
    return {
      inviteUrl,
      qrDataUrl: this.badgesService.generateQrDataUrl(inviteUrl),
    };
  }
}
