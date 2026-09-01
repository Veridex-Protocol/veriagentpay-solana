import { Controller, Get, Post, Param, Body, UseGuards, Req } from '@nestjs/common';
import { AdminRolesGuard } from '../guards/admin-roles.guard';
import { Roles } from '../decorators/roles.decorator';
import { AdminRole } from '@prisma/client';
import { AdminVaultsRevenueService } from '../services/admin-vaults-revenue.service';
import { Public } from '../../auth/decorators/public.decorator';

// Guarded by AdminGuard / AdminRolesGuard below, not by the user JWT
// guard bound globally in AppModule. @Public() opts out of that guard only.
@Public()
@Controller('api/admin')
@UseGuards(AdminRolesGuard)
export class AdminVaultsRevenueController {
  constructor(private readonly vaultsRevenueService: AdminVaultsRevenueService) {}

  @Get('vaults')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.FINANCE, AdminRole.SUPPORT, AdminRole.VIEWER)
  async getVaults() {
    return this.vaultsRevenueService.getVaults();
  }

  @Get('vaults/:id')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.FINANCE, AdminRole.SUPPORT, AdminRole.VIEWER)
  async getVaultById(@Param('id') id: string) {
    return this.vaultsRevenueService.getVaultById(id);
  }

  @Get('vaults/:id/fees')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.FINANCE, AdminRole.VIEWER)
  async getVaultFees(@Param('id') id: string) {
    return this.vaultsRevenueService.getVaultFees(id);
  }

  @Get('revenue')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.FINANCE, AdminRole.VIEWER)
  async getRevenueSummary() {
    return this.vaultsRevenueService.getRevenueSummary();
  }

  @Get('revenue/fees-config')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.FINANCE, AdminRole.VIEWER)
  async getFeesConfig() {
    return this.vaultsRevenueService.getFeesConfig();
  }

  @Post('revenue/fees-config')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.FINANCE)
  async proposeFeeConfig(@Body() body: any, @Req() req: any) {
    return this.vaultsRevenueService.proposeFeeConfig(body, req.admin);
  }
}
