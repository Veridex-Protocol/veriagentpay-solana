import { Module, forwardRef } from '@nestjs/common';
import { ReferralService } from './referral.service';
import { ReferralController } from './referral.controller';
import { ReferralLeaderboardService } from './referral-leaderboard.service';
import { ReferralMilestoneCron } from './referral-milestone.cron';
import { ReferralBadgeCron } from './referral-badge.cron';
import { NotificationsModule } from '../notifications/notifications.module';
import { BadgesModule } from '../badges/badges.module';
import { PrismaModule } from '../prisma/prisma.module';

import { ActivityModule } from '../activity/activity.module';
import { REFERRAL_SERVICE } from '../common/service-contracts';

@Module({
  imports: [
    forwardRef(() => NotificationsModule),
    forwardRef(() => BadgesModule),
    forwardRef(() => ActivityModule),
    PrismaModule,
  ],
  controllers: [ReferralController],
  providers: [
    ReferralService,
    ReferralLeaderboardService,
    ReferralMilestoneCron,
    ReferralBadgeCron,
    // `useExisting`, not `useClass`: the token must resolve to the same
    // instance the rest of the app injects by class, not a second one.
    { provide: REFERRAL_SERVICE, useExisting: ReferralService },
  ],
  exports: [ReferralService, ReferralLeaderboardService, REFERRAL_SERVICE],
})
export class ReferralModule {}
