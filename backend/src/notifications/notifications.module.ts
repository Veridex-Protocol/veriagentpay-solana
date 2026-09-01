import { Module, forwardRef } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { UnifiedNotificationService } from './unified-notification.service';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationsController } from './notifications.controller';
import { PlatformModule } from '../platform/platform.module';
import { IdentityModule } from '../identity/identity.module';
import { ScheduleModule } from '@nestjs/schedule';
import { NOTIFICATION_SERVICE, NOTIFICATIONS_STORE } from '../common/service-contracts';

@Module({
  imports: [ScheduleModule.forRoot(), forwardRef(() => PlatformModule), forwardRef(() => IdentityModule)],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    UnifiedNotificationService,
    { provide: NOTIFICATION_SERVICE, useExisting: UnifiedNotificationService },
    { provide: NOTIFICATIONS_STORE, useExisting: NotificationsService },
    NotificationsGateway,
  ],
  exports: [NotificationsService, UnifiedNotificationService, NOTIFICATION_SERVICE, NOTIFICATIONS_STORE, NotificationsGateway],
})
export class NotificationsModule {}
