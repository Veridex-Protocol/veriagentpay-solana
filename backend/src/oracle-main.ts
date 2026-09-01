import { NestFactory } from '@nestjs/core';
import { OracleModule } from './oracle.module';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const logger = new Logger('ZkTlsOracleWorkerProcess');
  logger.log('🚀 Initializing standalone ZkTLS Oracle Worker process...');
  const app = await NestFactory.createApplicationContext(OracleModule);
  await app.init();
  logger.log('✅ ZkTLS Oracle Worker active and executing automated yield attestations.');
}

bootstrap().catch((err) => {
  console.error('Fatal error starting ZkTLS Oracle Worker:', err);
  process.exit(1);
});
