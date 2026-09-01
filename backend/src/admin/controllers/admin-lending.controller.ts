import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { AdminRolesGuard } from '../guards/admin-roles.guard';
import { Roles } from '../decorators/roles.decorator';
import { AdminRole } from '@prisma/client';
import { AdminLendingService } from '../services/admin-lending.service';
import { Public } from '../../auth/decorators/public.decorator';

// Guarded by AdminGuard / AdminRolesGuard below, not by the user JWT
// guard bound globally in AppModule. @Public() opts out of that guard only.
@Public()
@Controller('api/admin')
@UseGuards(AdminRolesGuard)
export class AdminLendingController {
  constructor(private readonly lendingService: AdminLendingService) {}

  @Get('pools')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.FINANCE, AdminRole.SUPPORT, AdminRole.VIEWER)
  async getPools() {
    return this.lendingService.getPools();
  }

  @Get('pools/:id')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.FINANCE, AdminRole.SUPPORT, AdminRole.VIEWER)
  async getPoolById(@Param('id') id: string) {
    return this.lendingService.getPoolById(id);
  }

  @Get('pools/:id/loans')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.FINANCE, AdminRole.SUPPORT, AdminRole.VIEWER)
  async getPoolLoans(@Param('id') id: string) {
    return this.lendingService.getPoolLoans(id);
  }

  @Get('loans/:id')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.FINANCE, AdminRole.SUPPORT, AdminRole.VIEWER)
  async getLoanById(@Param('id') id: string) {
    return this.lendingService.getLoanById(id);
  }
}
