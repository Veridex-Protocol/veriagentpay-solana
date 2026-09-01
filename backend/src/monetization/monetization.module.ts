import { Module } from '@nestjs/common';
import { MonetizationEngineService } from './monetization-engine.service';
import { MonetizationController } from './monetization.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [MonetizationEngineService],
  controllers: [MonetizationController],
  exports: [MonetizationEngineService],
})
export class MonetizationModule {}
