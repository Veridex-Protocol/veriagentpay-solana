import { Module, forwardRef } from '@nestjs/common';
import { BadgesService } from './badges.service';
import { BadgesController } from './badges.controller';
import { NotificationsModule } from '../notifications/notifications.module';

import { ActivityModule } from '../activity/activity.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { ReferralModule } from '../referral/referral.module';
import { BADGES_SERVICE } from '../common/service-contracts';

@Module({
  imports: [forwardRef(() => NotificationsModule), forwardRef(() => ActivityModule), AnalyticsModule, forwardRef(() => ReferralModule)],
  controllers: [BadgesController],
  // `useExisting`, not `useClass`: the token must resolve to the same instance
  // the rest of the app injects by class, not a second one.
  providers: [BadgesService, { provide: BADGES_SERVICE, useExisting: BadgesService }],
  exports: [BadgesService, BADGES_SERVICE],
})
export class BadgesModule {}
