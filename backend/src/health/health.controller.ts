import { Controller, Get, HttpStatus, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { RelayerMonitorService } from '../relayer/relayer-monitor.service';
import { RedisService } from '../core/redis.service';
import { Public } from '../auth/decorators/public.decorator';
import { AdminGuard } from '../admin/guards/admin.guard';

// Liveness probe for load balancers and orchestration; must answer before auth.
@Controller('api/health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly relayerMonitor: RelayerMonitorService,
    private readonly redisService: RedisService,
  ) {}

  /** Public liveness probe. No internal balances or wallet addresses disclosed. */
  @Get()
  @Public()
  async checkHealth(@Res() res: Response) {
    const [dbHealthy, redisHealthy] = await Promise.all([
      this.prisma
        .$queryRaw`SELECT 1`
        .then(() => true)
        .catch(() => false),
      this.redisService
        .ping()
        .then((ok) => ok)
        .catch(() => false),
    ]);

    const relayerHealthy = this.relayerMonitor.getRelayerStatus().healthy;
    const isHealthy = dbHealthy && redisHealthy && relayerHealthy;

    return res
      .status(isHealthy ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE)
      .json({
        status: isHealthy ? 'UP' : 'DEGRADED',
        timestamp: new Date().toISOString(),
      });
  }

  /** Operator detail. Authenticated. */
  @Get('detail')
  @UseGuards(AdminGuard)
  async detail() {
    const relayer = this.relayerMonitor.getRelayerStatus();
    const [dbHealthy, redisHealthy] = await Promise.all([
      this.prisma
        .$queryRaw`SELECT 1`
        .then(() => 'HEALTHY')
        .catch(() => 'UNHEALTHY'),
      this.redisService
        .ping()
        .then((ok) => (ok ? 'HEALTHY' : 'UNHEALTHY'))
        .catch(() => 'UNHEALTHY'),
    ]);

    return {
      checks: {
        database: dbHealthy,
        redis: redisHealthy,
        relayerWallet: {
          status: relayer.healthy ? 'HEALTHY' : 'LOW_BALANCE',
          address: relayer.address,
          balance: relayer.balance,
        },
      },
    };
  }
}
