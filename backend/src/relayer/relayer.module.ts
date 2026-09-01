import { Module, forwardRef } from '@nestjs/common';
import { PasskeyExecutionService } from './passkey-execution.service';
import { RelayerService } from './relayer.service';
import { RelayerMonitorService } from './relayer-monitor.service';
import { ClaimRetryService } from './claim-retry.service';
import { StatusController, RelayTransferController } from './relayer.controller';
import { SessionKeysController } from './session-keys.controller';
import { PlatformModule } from '../platform/platform.module';
import { AuthModule } from '../auth/auth.module';
import { ContactsModule } from '../contacts/contacts.module';
import { ActivityModule } from '../activity/activity.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { BadgesModule } from '../badges/badges.module';
import { IdentityModule } from '../identity/identity.module';
import { ReputationModule } from '../reputation/reputation.module';
import { SolanaChainService } from '../chains/solana/solana-chain.service';
import { SolanaRelayerService } from './solana-relayer.service';
import { SolanaPasskeyExecutionService } from './solana-passkey-execution.service';

import { PrismaModule } from '../prisma/prisma.module';
import { CallPolicyModule } from '../call-policy/call-policy.module';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => PlatformModule),
    AuthModule,
    forwardRef(() => ContactsModule),
    forwardRef(() => ActivityModule),
    forwardRef(() => NotificationsModule),
    forwardRef(() => BadgesModule),
    forwardRef(() => IdentityModule),
    ReputationModule,
    // The contract allowlist the passkey policy refresh grants. A leaf module
    // on purpose: importing AdminModule for it closed a cycle back through
    // PlatformModule and left RelayerModule undefined in SubscriptionModule.
    CallPolicyModule,
  ],
  controllers: [StatusController, SessionKeysController, RelayTransferController],
  providers: [
    SolanaChainService,
    SolanaRelayerService,
    SolanaPasskeyExecutionService,
    { provide: PasskeyExecutionService, useExisting: SolanaPasskeyExecutionService },
    { provide: RelayerService, useExisting: SolanaRelayerService },
    RelayerMonitorService,
    ClaimRetryService,
    SolanaChainService,
    SolanaRelayerService,
  ],
  exports: [
    PasskeyExecutionService,
    RelayerService,
    RelayerMonitorService,
    ClaimRetryService,
  ],
})
export class RelayerModule {}
