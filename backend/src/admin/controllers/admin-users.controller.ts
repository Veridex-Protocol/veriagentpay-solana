import { Controller, Get, Patch, Post, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { AdminRolesGuard } from '../guards/admin-roles.guard';
import { Roles } from '../decorators/roles.decorator';
import { AdminRole, UserStatus } from '@prisma/client';
import { AdminUsersService } from '../services/admin-users.service';
import { Public } from '../../auth/decorators/public.decorator';

// Guarded by AdminGuard / AdminRolesGuard below, not by the user JWT
// guard bound globally in AppModule. @Public() opts out of that guard only.
@Public()
@Controller('api/admin/users')
@UseGuards(AdminRolesGuard)
export class AdminUsersController {
  constructor(private readonly usersService: AdminUsersService) {}

  @Get()
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.SUPPORT, AdminRole.FINANCE, AdminRole.VIEWER)
  async getUsers(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('status') status?: string
  ) {
    return this.usersService.getUsers({ page, limit, search, status });
  }

  @Get(':id')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.SUPPORT, AdminRole.FINANCE, AdminRole.VIEWER)
  async getUserById(@Param('id') id: string) {
    return this.usersService.getUserById(id);
  }

  @Patch(':id/status')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.SUPPORT)
  async updateUserStatus(
    @Param('id') id: string,
    @Body() body: { status: UserStatus; reason?: string },
    @Req() req: any
  ) {
    return this.usersService.updateUserStatus(id, body.status, req.admin, body.reason);
  }

  @Post(':id/notes')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.SUPPORT, AdminRole.FINANCE)
  async addAdminNote(
    @Param('id') id: string,
    @Body() body: { note: string },
    @Req() req: any
  ) {
    return this.usersService.addAdminNote(id, body.note, req.admin);
  }

  @Get(':id/activity')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.SUPPORT, AdminRole.VIEWER)
  async getUserActivity(
    @Param('id') id: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number
  ) {
    return this.usersService.getUserActivity(id, page, limit);
  }

  @Get(':id/transactions')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.SUPPORT, AdminRole.FINANCE, AdminRole.VIEWER)
  async getUserTransactions(
    @Param('id') id: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number
  ) {
    return this.usersService.getUserTransactions(id, page, limit);
  }

  @Get(':id/vaults')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.SUPPORT, AdminRole.FINANCE, AdminRole.VIEWER)
  async getUserVaultActivity(
    @Param('id') id: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number
  ) {
    return this.usersService.getUserVaultActivity(id, page, limit);
  }
}
