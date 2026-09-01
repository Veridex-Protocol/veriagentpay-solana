import { Module } from '@nestjs/common';
import { FunnelEventsService } from './funnel-events.service';
import { FunnelEventsController } from './funnel-events.controller';
import { RetentionCron } from './retention.cron';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [FunnelEventsController],
  providers: [FunnelEventsService, RetentionCron],
  exports: [FunnelEventsService],
})
export class AnalyticsModule {}
