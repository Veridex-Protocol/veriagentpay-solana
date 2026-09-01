import { Module, forwardRef } from '@nestjs/common';
import { EscrowService } from './escrow.service';
import { EscrowController } from './escrow.controller';
import { IdentityModule } from '../identity/identity.module';
import { ShortLinksModule } from '../shortlinks/shortlinks.module';
import { RelayerModule } from '../relayer/relayer.module';
import { ActivityModule } from '../activity/activity.module';

@Module({
  imports: [
    forwardRef(() => IdentityModule),
    ShortLinksModule,
    forwardRef(() => RelayerModule),
    forwardRef(() => ActivityModule),
  ],
  controllers: [EscrowController],
  providers: [EscrowService],
  exports: [EscrowService],
})
export class EscrowModule {}
