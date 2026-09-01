import { Controller, Get } from '@nestjs/common';
import { ZkTlsOracleWorker } from './zktls-oracle.worker';
import { Public } from '../auth/decorators/public.decorator';

// Read-only oracle status shown on public yield pages.
@Public()
@Controller('api/oracle')
export class OracleController {
  constructor(private readonly oracleWorker: ZkTlsOracleWorker) {}

  @Get('status')
  getOracleStatus() {
    const status = this.oracleWorker.getOracleStatus();

    return {
      status: status.isHealthy ? 'healthy' : 'degraded',
      compositeApy: status.compositeApy,
      lastAttestation: status.lastAttestation,
      protocols: Object.entries(status.protocols).map(([name, data]) => ({
        name,
        // Null until the source has actually been read once — the oracle no
        // longer seeds protocols with placeholder rates.
        apy: data.apy,
        tvlUsd: data.tvlUsd ?? null,
        lastSuccessfulFetch: data.lastSuccessfulFetch,
        consecutiveFailures: data.consecutiveFailures,
        circuitBreakerOpen: data.circuitBreakerOpen,
        circuitBreakerOpenedAt: data.circuitBreakerOpenedAt,
        lastError: data.lastError,
        cacheAgeMinutes: data.lastSuccessfulFetch
          ? Math.floor((Date.now() - data.lastSuccessfulFetch.getTime()) / 1000 / 60)
          : null,
      })),
    };
  }
}
