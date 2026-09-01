import { Module, forwardRef } from '@nestjs/common';
import { HealthController } from './health.controller';
import { RelayerModule } from '../relayer/relayer.module';
import { AdminModule } from '../admin/admin.module';
import { CoreModule } from '../core/core.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [
    CoreModule,
    PrismaModule,
    forwardRef(() => RelayerModule),
    forwardRef(() => AdminModule),
  ],
  controllers: [HealthController],
})
export class HealthModule {}
