import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ZkTlsOracleWorker } from './vault/zktls-oracle.worker';

/**
 * Lightweight module for the standalone Oracle Worker process.
 * Only bootstraps the scheduler and the ZkTLS Oracle Worker —
 * no Telegram bot, no HTTP controllers, no other services.
 * This prevents the 409 conflict from two processes polling
 * the same Telegram bot token simultaneously.
 */
@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [ZkTlsOracleWorker],
})
export class OracleModule {}
