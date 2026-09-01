import { Module, forwardRef } from '@nestjs/common';
import { SubscriptionController } from './subscription.controller';
import { SubscriptionService } from './subscription.service';
import { AuthModule } from '../auth/auth.module';
import { RelayerModule } from '../relayer/relayer.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ActivityModule } from '../activity/activity.module';

@Module({
  imports: [
    AuthModule,
    forwardRef(() => RelayerModule),
    forwardRef(() => NotificationsModule),
    forwardRef(() => ActivityModule),
  ],
  controllers: [SubscriptionController],
  providers: [SubscriptionService],
  exports: [SubscriptionService],
})
export class SubscriptionModule {}

