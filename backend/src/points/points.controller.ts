import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { PointsService } from './points.service';

@Controller('api/points')
export class PointsController {
  constructor(private readonly pointsService: PointsService) {}

  @Get(':userId')
  async getPointsSummary(@Param('userId') userId: string) {
    return await this.pointsService.getUserPointsSummary(userId);
  }

  @Post('award')
  async awardPoints(
    @Body() body: {
      userId: string;
      activityType: 'REFERRAL' | 'SEND_TRANSFER' | 'VAULT_DEPOSIT' | 'LOGIN_STREAK' | 'INTERACTION_STREAK' | 'GROUP_LENDING' | 'RED_ENVELOPE' | 'KYC_COMPLETE';
      customPoints?: number;
      description?: string;
    }
  ) {
    return await this.pointsService.awardPoints(
      body.userId,
      body.activityType,
      body.customPoints,
      body.description
    );
  }
}
