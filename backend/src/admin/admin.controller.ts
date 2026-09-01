import { Controller, Get, Post, Body, UseGuards, Query, Param } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminMetricsService } from './admin-metrics.service';
import { AdminInsightsService } from './admin-insights.service';
import { AdminGuard } from './guards/admin.guard';
import { AdminUsersService } from './admin-users.service';
import { UserInsightsService } from './user-insights.service';
import { Public } from '../auth/decorators/public.decorator';

// Guarded by AdminGuard / AdminRolesGuard below, not by the user JWT
// guard bound globally in AppModule. @Public() opts out of that guard only.
@Public()
@Controller('api/admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly metricsService: AdminMetricsService,
    private readonly insightsService: AdminInsightsService,
    private readonly usersService: AdminUsersService,
    private readonly userInsightsService: UserInsightsService,
  ) {}

  @Get('users')
  async getUsers() {
    return this.usersService.getUsers();
  }

  @Get('users/:userId/insights')
  async getUserInsights(@Param('userId') userId: string, @Query('refresh') refresh?: string) {
    return this.userInsightsService.generate(userId, refresh === 'true');
  }

  @Get('users/:userId')
  async getUserDetail(@Param('userId') userId: string) {
    return this.usersService.getUserDetail(userId);
  }

  @Get('metrics/overview')
  async getOverview() {
    return await this.metricsService.getOverviewMetrics();
  }

  @Get('metrics/users')
  async getUsersMetrics() {
    return await this.metricsService.getUserMetrics();
  }

  @Get('metrics/virality')
  async getViralityMetrics() {
    return await this.metricsService.getViralityMetrics();
  }

  @Get('metrics/financials')
  async getFinancialMetrics() {
    return await this.metricsService.getFinancialMetrics();
  }

  @Get('metrics/notifications')
  async getNotificationMetrics() {
    return await this.metricsService.getNotificationMetrics();
  }

  @Get('insights/generate')
  async generateInsights(@Query('refresh') refresh?: string) {
    const force = refresh === 'true';
    return await this.insightsService.generateExecutiveReport(force);
  }

  @Get('list')
  async getAllAdmins() {
    const admins = await this.adminService.getAllAdmins();
    return { admins };
  }

  @Post('whitelist/add')
  async addWhitelistIdentifier(
    @Body() body: { name?: string; email?: string; platform: string; value: string }
  ) {
    return await this.adminService.addAdminIdentifier(body);
  }

  @Post('alerts/send')
  async sendAlert(
    @Body() body: { userId: string; title: string; message: string; priority?: 'low' | 'medium' | 'high' }
  ) {
    return await this.adminService.sendAdminAlert(body);
  }

  @Post('alerts/broadcast')
  async broadcastAlert(
    @Body() body: { title: string; message: string; userIds?: string[] }
  ) {
    return await this.adminService.broadcastAlert(body);
  }
}
