import { Module, forwardRef } from '@nestjs/common';
import { BalanceController } from './balance.controller';
import { OracleController } from './oracle.controller';
import { VaultController } from './vault.controller';
import { VaultService } from './vault.service';
import { ZkTlsOracleWorker } from './zktls-oracle.worker';
import { RecoveryListenerService } from './recovery-listener.service';
import { AuthModule } from '../auth/auth.module';
import { ActivityModule } from '../activity/activity.module';
import { RelayerModule } from '../relayer/relayer.module';
import { BadgesModule } from '../badges/badges.module';
import { ReputationModule } from '../reputation/reputation.module';

@Module({
  imports: [
    AuthModule,
    forwardRef(() => RelayerModule),
    forwardRef(() => ActivityModule),
    forwardRef(() => BadgesModule),
    ReputationModule,
  ],
  controllers: [BalanceController, OracleController, VaultController],
  providers: [VaultService, ZkTlsOracleWorker, RecoveryListenerService],
  exports: [VaultService, ZkTlsOracleWorker],
})
export class VaultModule {}
