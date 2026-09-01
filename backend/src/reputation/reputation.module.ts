import { Module } from '@nestjs/common';
import { ReputationService } from './reputation.service';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  providers: [ReputationService, PrismaService],
  exports: [ReputationService],
})
export class ReputationModule {}
