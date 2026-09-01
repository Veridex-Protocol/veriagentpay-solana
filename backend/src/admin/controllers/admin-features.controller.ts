import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AdminRolesGuard } from '../guards/admin-roles.guard';
import { Roles } from '../decorators/roles.decorator';
import { AdminRole } from '@prisma/client';
import { AdminFeaturesService } from '../services/admin-features.service';
import { Public } from '../../auth/decorators/public.decorator';

// Guarded by AdminGuard / AdminRolesGuard below, not by the user JWT
// guard bound globally in AppModule. @Public() opts out of that guard only.
@Public()
@Controller('api/admin')
@UseGuards(AdminRolesGuard)
export class AdminFeaturesController {
  constructor(private readonly featuresService: AdminFeaturesService) {}

  @Get('envelopes')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.SUPPORT, AdminRole.FINANCE, AdminRole.VIEWER)
  async getEnvelopes(@Query('status') status?: string) {
    return this.featuresService.getEnvelopes(status);
  }

  @Get('envelopes/sponsored/revenue')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.FINANCE, AdminRole.VIEWER)
  async getSponsoredEnvelopeRevenue() {
    return this.featuresService.getSponsoredEnvelopeRevenue();
  }

  @Get('envelopes/:id')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.SUPPORT, AdminRole.FINANCE, AdminRole.VIEWER)
  async getEnvelopeById(@Param('id') id: string) {
    return this.featuresService.getEnvelopeById(id);
  }

  @Get('splits')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.SUPPORT, AdminRole.FINANCE, AdminRole.VIEWER)
  async getSplits() {
    return this.featuresService.getSplits();
  }

  @Get('subscriptions')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.SUPPORT, AdminRole.FINANCE, AdminRole.VIEWER)
  async getSubscriptions() {
    return this.featuresService.getSubscriptions();
  }

  @Get('referrals')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.SUPPORT, AdminRole.FINANCE, AdminRole.VIEWER)
  async getReferrals() {
    return this.featuresService.getReferrals();
  }

  @Get('badges')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.SUPPORT, AdminRole.FINANCE, AdminRole.VIEWER)
  async getBadges() {
    return this.featuresService.getBadges();
  }

  @Get('badges/:badgeId/recipients')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.SUPPORT, AdminRole.FINANCE, AdminRole.VIEWER)
  async getBadgeRecipients(@Param('badgeId') badgeId: string) {
    return this.featuresService.getBadgeRecipients(badgeId);
  }

  @Get('leaderboard')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.SUPPORT, AdminRole.FINANCE, AdminRole.VIEWER)
  async getLeaderboard() {
    return this.featuresService.getLeaderboard();
  }
}
