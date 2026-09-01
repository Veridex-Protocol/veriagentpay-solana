import { Module, forwardRef } from '@nestjs/common';
import { GrowthService } from './growth.service';
import { GrowthController } from './growth.controller';
import { StreaksController } from './streaks.controller';
import { UserGrowthStatsService } from './user-growth-stats.service';
import { WeeklyWrappedService } from './weekly-wrapped.service';
import { DormantUserWinbackCron } from './dormant-user-winback.cron';
import { RedEnvelopeFridayCron } from './red-envelope-friday.cron';
import { InteractionStreakInterceptor } from './interaction-streak.interceptor';
import { NotificationsModule } from '../notifications/notifications.module';
import { BadgesModule } from '../badges/badges.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { ReferralModule } from '../referral/referral.module';

@Module({
  imports: [
    forwardRef(() => NotificationsModule),
    forwardRef(() => BadgesModule),
    forwardRef(() => ReferralModule),
    PrismaModule,
    AnalyticsModule,
  ],
  controllers: [GrowthController, StreaksController],
  providers: [
    GrowthService,
    UserGrowthStatsService,
    WeeklyWrappedService,
    DormantUserWinbackCron,
    RedEnvelopeFridayCron,
    InteractionStreakInterceptor,
  ],
  exports: [GrowthService, UserGrowthStatsService, WeeklyWrappedService, InteractionStreakInterceptor],
})
export class GrowthModule {}

