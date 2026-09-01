import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdminRolesGuard } from '../guards/admin-roles.guard';
import { Roles } from '../decorators/roles.decorator';
import { AdminRole } from '@prisma/client';
import { AdminSystemService } from '../services/admin-system.service';
import { Public } from '../../auth/decorators/public.decorator';

// Guarded by AdminGuard / AdminRolesGuard below, not by the user JWT
// guard bound globally in AppModule. @Public() opts out of that guard only.
@Public()
@Controller('api/admin/system')
@UseGuards(AdminRolesGuard)
export class AdminSystemController {
  constructor(private readonly systemService: AdminSystemService) {}

  @Get('health')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.SUPPORT, AdminRole.FINANCE, AdminRole.VIEWER)
  async getSystemHealth() {
    return this.systemService.getSystemHealth();
  }

  @Get('relayer')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.SUPPORT, AdminRole.FINANCE, AdminRole.VIEWER)
  async getRelayerInfo() {
    return this.systemService.getRelayerInfo();
  }

  @Get('notifications')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.SUPPORT, AdminRole.VIEWER)
  async getNotifications(
    @Query('page') page?: number,
    @Query('limit') limit?: number
  ) {
    return this.systemService.getNotifications(page, limit);
  }
}
