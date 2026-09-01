import { Controller, Get, Param, Query, UseGuards, Res } from '@nestjs/common';
import { Response } from 'express';
import { AdminRolesGuard } from '../guards/admin-roles.guard';
import { Roles } from '../decorators/roles.decorator';
import { AdminRole } from '@prisma/client';
import { AdminAuditReportsService } from '../services/admin-audit-reports.service';
import { Public } from '../../auth/decorators/public.decorator';

// Guarded by AdminGuard / AdminRolesGuard below, not by the user JWT
// guard bound globally in AppModule. @Public() opts out of that guard only.
@Public()
@Controller('api/admin')
@UseGuards(AdminRolesGuard)
export class AdminAuditReportsController {
  constructor(private readonly auditReportsService: AdminAuditReportsService) {}

  @Get('audit-logs')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.SUPPORT, AdminRole.FINANCE, AdminRole.VIEWER)
  async getAuditLogs(
    @Query('adminId') adminId?: string,
    @Query('action') action?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number
  ) {
    return this.auditReportsService.getAuditLogs({ adminId, action, page, limit });
  }

  @Get('audit-logs/:id')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.SUPPORT, AdminRole.FINANCE, AdminRole.VIEWER)
  async getAuditLogById(@Param('id') id: string) {
    return this.auditReportsService.getAuditLogById(id);
  }

  @Get('reports/transactions/export')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.FINANCE, AdminRole.SUPPORT)
  async exportTransactionsCsv(@Res() res: Response) {
    return this.auditReportsService.exportTransactionsCsv(res);
  }

  @Get('reports/users/export')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.SUPPORT)
  async exportUsersCsv(@Res() res: Response) {
    return this.auditReportsService.exportUsersCsv(res);
  }

  @Get('reports/ai-insights')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.FINANCE, AdminRole.SUPPORT, AdminRole.VIEWER)
  async getAiExecutiveInsights() {
    return this.auditReportsService.getAiExecutiveInsights();
  }
}
