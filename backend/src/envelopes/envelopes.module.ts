import { Module, forwardRef } from '@nestjs/common';
import { EnvelopesService } from './envelopes.service';
import { EnvelopesController } from './envelopes.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { IdentityModule } from '../identity/identity.module';
import { RelayerModule } from '../relayer/relayer.module';
import { BadgesModule } from '../badges/badges.module';
import { ActivityModule } from '../activity/activity.module';

@Module({
  imports: [
    forwardRef(() => NotificationsModule),
    forwardRef(() => RelayerModule),
    forwardRef(() => BadgesModule),
    forwardRef(() => IdentityModule),
    forwardRef(() => ActivityModule),
  ],
  controllers: [EnvelopesController],
  providers: [EnvelopesService],
  exports: [EnvelopesService],
})
export class EnvelopesModule {}
