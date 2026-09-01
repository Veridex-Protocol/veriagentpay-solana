import { Controller, Get, Post, Patch, Body, Query, UseGuards, Req } from '@nestjs/common';
import { AdminRolesGuard } from '../guards/admin-roles.guard';
import { Roles } from '../decorators/roles.decorator';
import { AdminRole } from '@prisma/client';
import { AdminIncidentConfigService } from '../services/admin-incident-config.service';
import { Public } from '../../auth/decorators/public.decorator';

// Guarded by AdminGuard / AdminRolesGuard below, not by the user JWT
// guard bound globally in AppModule. @Public() opts out of that guard only.
@Public()
@Controller('api/admin')
@UseGuards(AdminRolesGuard)
export class AdminIncidentConfigController {
  constructor(private readonly incidentConfigService: AdminIncidentConfigService) {}

  @Post('actions/freeze-account')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.SUPPORT)
  async freezeAccount(
    @Body() body: { userId: string; reason: string },
    @Req() req: any
  ) {
    return this.incidentConfigService.freezeAccount(body.userId, body.reason, req.admin);
  }

  @Post('actions/pause-feature')
  @Roles(AdminRole.SUPER_ADMIN)
  async pauseFeature(
    @Body() body: { featureKey: string; paused: boolean; reason: string },
    @Req() req: any
  ) {
    return this.incidentConfigService.pauseFeature(body.featureKey, body.paused, body.reason, req.admin);
  }

  @Post('actions/revoke-session-keys')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.SUPPORT)
  async revokeSessionKeys(
    @Body() body: { userId: string },
    @Req() req: any
  ) {
    return this.incidentConfigService.revokeSessionKeys(body.userId, req.admin);
  }

  @Get('config')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.FINANCE, AdminRole.SUPPORT, AdminRole.VIEWER)
  async getConfig() {
    return this.incidentConfigService.getConfig();
  }

  @Patch('config')
  @Roles(AdminRole.SUPER_ADMIN)
  async updateConfig(
    @Body() body: { key: string; value: any },
    @Req() req: any
  ) {
    return this.incidentConfigService.updateConfig(body.key, body.value, req.admin);
  }
}
