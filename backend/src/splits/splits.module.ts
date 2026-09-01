import { Module, forwardRef } from '@nestjs/common';
import { SplitsController } from './splits.controller';
import { SplitsService } from './splits.service';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { IdentityModule } from '../identity/identity.module';
import { ActivityModule } from '../activity/activity.module';
import { RelayerModule } from '../relayer/relayer.module';

@Module({
  imports: [
    AuthModule,
    PrismaModule,
    forwardRef(() => NotificationsModule),
    forwardRef(() => IdentityModule),
    forwardRef(() => RelayerModule),
    forwardRef(() => ActivityModule),
  ],
  controllers: [SplitsController],
  providers: [SplitsService],
  exports: [SplitsService],
})
export class SplitsModule {}
