import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AdminRolesGuard } from '../guards/admin-roles.guard';
import { Roles } from '../decorators/roles.decorator';
import { AdminRole } from '@prisma/client';
import { AdminTransactionsService } from '../services/admin-transactions.service';
import { Public } from '../../auth/decorators/public.decorator';

// Guarded by AdminGuard / AdminRolesGuard below, not by the user JWT
// guard bound globally in AppModule. @Public() opts out of that guard only.
@Public()
@Controller('api/admin/transactions')
@UseGuards(AdminRolesGuard)
export class AdminTransactionsController {
  constructor(private readonly transactionsService: AdminTransactionsService) {}

  @Get()
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.SUPPORT, AdminRole.FINANCE, AdminRole.VIEWER)
  async getTransactions(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('userId') userId?: string,
    @Query('token') token?: string,
    @Query('search') search?: string
  ) {
    return this.transactionsService.getTransactions({ page, limit, type, status, userId, token, search });
  }

  @Get('summary')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.SUPPORT, AdminRole.FINANCE, AdminRole.VIEWER)
  async getSummary() {
    return this.transactionsService.getSummary();
  }

  @Get(':id')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.SUPPORT, AdminRole.FINANCE, AdminRole.VIEWER)
  async getTransactionById(@Param('id') id: string) {
    return this.transactionsService.getTransactionById(id);
  }
}
