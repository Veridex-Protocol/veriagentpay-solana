import { Module, forwardRef } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminAuditService } from './admin-audit.service';
import { AdminRolesGuard } from './guards/admin-roles.guard';
import { AdminCallPolicyController } from './controllers/admin-call-policy.controller';
import { CallPolicyModule } from '../call-policy/call-policy.module';
import { AdminGuard } from './guards/admin.guard';
import { NotificationsModule } from '../notifications/notifications.module';
import { PlatformModule } from '../platform/platform.module';

import { AdminAuthController } from './admin-auth.controller';
import { AdminUsersController } from './controllers/admin-users.controller';
import { AdminTransactionsController } from './controllers/admin-transactions.controller';
import { AdminVaultsRevenueController } from './controllers/admin-vaults-revenue.controller';
import { AdminLendingController } from './controllers/admin-lending.controller';
import { AdminFeaturesController } from './controllers/admin-features.controller';
import { AdminSystemController } from './controllers/admin-system.controller';
import { AdminIncidentConfigController } from './controllers/admin-incident-config.controller';
import { AdminAuditReportsController } from './controllers/admin-audit-reports.controller';
import { AdminBroadcastController } from './controllers/admin-broadcast.controller';

import { AdminUsersService } from './services/admin-users.service';
import { AdminTransactionsService } from './services/admin-transactions.service';
import { AdminVaultsRevenueService } from './services/admin-vaults-revenue.service';
import { AdminLendingService } from './services/admin-lending.service';
import { AdminFeaturesService } from './services/admin-features.service';
import { AdminSystemService } from './services/admin-system.service';
import { AdminIncidentConfigService } from './services/admin-incident-config.service';
import { AdminAuditReportsService } from './services/admin-audit-reports.service';
import { AdminBroadcastService } from './services/admin-broadcast.service';

@Module({
  imports: [
    CallPolicyModule,forwardRef(() => NotificationsModule), forwardRef(() => PlatformModule)],
  controllers: [
    AdminCallPolicyController,
    AdminAuthController,
    AdminUsersController,
    AdminTransactionsController,
    AdminVaultsRevenueController,
    AdminLendingController,
    AdminFeaturesController,
    AdminSystemController,
    AdminIncidentConfigController,
    AdminAuditReportsController,
    AdminBroadcastController,
  ],
  providers: [
    AdminService,
    AdminAuditService,
    AdminGuard,
    AdminRolesGuard,
    AdminUsersService,
    AdminTransactionsService,
    AdminVaultsRevenueService,
    AdminLendingService,
    AdminFeaturesService,
    AdminSystemService,
    AdminIncidentConfigService,
    AdminAuditReportsService,
    AdminBroadcastService,
  ],
  exports: [AdminService, AdminAuditService, AdminGuard, AdminRolesGuard],
})
export class AdminModule {}
