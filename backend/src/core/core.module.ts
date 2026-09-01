import { Module, Global } from '@nestjs/common';
import { HotStateService } from './hot-state.service';
import { RedisService } from './redis.service';
import { PrismaModule } from '../prisma/prisma.module';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [HotStateService, RedisService],
  exports: [HotStateService, RedisService],
})
export class CoreModule {}
