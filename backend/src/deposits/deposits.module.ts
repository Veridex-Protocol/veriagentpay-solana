import { Module, forwardRef } from '@nestjs/common';
import { DepositListenerService } from './deposit-listener.service';
import { DepositsService } from './deposits.service';
import { DepositsController } from './deposits.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { ActivityModule } from '../activity/activity.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TokensModule } from '../tokens/tokens.module';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => ActivityModule),
    forwardRef(() => NotificationsModule),
    TokensModule,
  ],
  controllers: [DepositsController],
  providers: [DepositListenerService, DepositsService],
  exports: [DepositsService, DepositListenerService],
})
export class DepositsModule {}
