import { Module, forwardRef } from '@nestjs/common';
import { EscrowService } from './escrow.service';
import { EscrowController } from './escrow.controller';
import { IdentityModule } from '../identity/identity.module';
import { ShortLinksModule } from '../shortlinks/shortlinks.module';
import { RelayerModule } from '../relayer/relayer.module';
import { ActivityModule } from '../activity/activity.module';
import { SolanaPaymentLinksService } from './solana-payment-links.service';

@Module({
  imports: [
    forwardRef(() => IdentityModule),
    ShortLinksModule,
    forwardRef(() => RelayerModule),
    forwardRef(() => ActivityModule),
  ],
  controllers: [EscrowController],
  providers: [SolanaPaymentLinksService, EscrowService],
  exports: [EscrowService],
})
export class EscrowModule {}
