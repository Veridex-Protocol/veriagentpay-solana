import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard, ThrottlerStorage } from '@nestjs/throttler';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { CoreModule } from './core/core.module';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { IdentityService } from './identity/identity.service';
import { IdentityModule } from './identity/identity.module';
import { RelayerService } from './relayer/relayer.service';
import { RelayerModule } from './relayer/relayer.module';
import { FiatRampService } from './fiat-ramp/fiat-ramp.service';
import { VaultService } from './vault/vault.service';
import { VaultModule } from './vault/vault.module';
import { ZkTlsOracleWorker } from './vault/zktls-oracle.worker';
import { NotificationsModule } from './notifications/notifications.module';
import { ContactsModule } from './contacts/contacts.module';
import { AuthModule } from './auth/auth.module';
import { AccountModule } from './account/account.module';
import { NlpModule } from './nlp/nlp.module';
import { RequestsModule } from './requests/requests.module';
import { EnvelopesModule } from './envelopes/envelopes.module';
import { PoolsModule } from './pools/pools.module';
import { GrowthModule } from './growth/growth.module';
import { BadgesModule } from './badges/badges.module';
import { AdminModule } from './admin/admin.module';
import { ActivityModule } from './activity/activity.module';
import { PlatformModule } from './platform/platform.module';
import { ShortLinksModule } from './shortlinks/shortlinks.module';
import { EscrowModule } from './escrow/escrow.module';
import { ReferralModule } from './referral/referral.module';
import { SubscriptionModule } from './subscription/subscription.module';
import { SplitsModule } from './splits/splits.module';
import { SettingsModule } from './settings/settings.module';
import { MonetizationModule } from './monetization/monetization.module';
import { PointsModule } from './points/points.module';
import { PublicStatsModule } from './metrics/public-stats.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { DepositsModule } from './deposits/deposits.module';
import { ExpiryCron } from './cron/expiry.cron';
import { RedisService } from './core/redis.service';

const dynamicImports: any[] = [
  ScheduleModule.forRoot(),

  // Three tiers: a burst ceiling, a sustained per-minute rate, and an hourly
  // cap. Sensitive routes (OTP issuance/verification, transfers, claim-code
  // lookups) tighten this further with @Throttle at the handler.
  //
  // Imported statically, not through a swallowed try/catch — a missing rate
  // limiter should fail the build, not silently disable protection.
  ThrottlerModule.forRoot([
    { name: 'short', ttl: 1_000, limit: 10 },
    { name: 'medium', ttl: 60_000, limit: 100 },
    { name: 'long', ttl: 3_600_000, limit: 1_000 },
  ]),

  CoreModule,
  PrismaModule,
  HealthModule,
  ActivityModule,
  NotificationsModule,
  ContactsModule,
  AuthModule,
  AccountModule,
  NlpModule,
  RequestsModule,
  EnvelopesModule,
  PoolsModule,
  GrowthModule,
  BadgesModule,
  AdminModule,
  PlatformModule,
  IdentityModule,
  ShortLinksModule,
  EscrowModule,
  RelayerModule,
  VaultModule,
  ReferralModule,
  SubscriptionModule,
  SplitsModule,
  SettingsModule,
  MonetizationModule,
  PointsModule,
  PublicStatsModule,
  AnalyticsModule,
  DepositsModule,
];

try {
  const { PrometheusModule } = require('@willsoto/nestjs-prometheus');
  const promClient = require('prom-client');

  if (PrometheusModule && typeof PrometheusModule.register === 'function') {
    // Clear default registry to avoid Bun-incompatible metrics
    promClient.register.clear();

    // Create basic Bun-compatible metrics
    new promClient.Gauge({
      name: 'nodejs_heap_used_bytes',
      help: 'Heap memory used in bytes',
      collect() {
        this.set(process.memoryUsage().heapUsed);
      },
    });

    new promClient.Gauge({
      name: 'nodejs_process_uptime_seconds',
      help: 'Process uptime in seconds',
      collect() {
        this.set(process.uptime());
      },
    });

    dynamicImports.push(
      PrometheusModule.register({
        path: '/metrics',
        defaultMetrics: {
          enabled: false,
        },
      })
    );
  }
} catch (e) {
  console.warn('[AppModule] PrometheusModule not loaded:', e.message);
}

@Module({
  imports: dynamicImports,
  controllers: [],
  providers: [
    /**
     * Authentication is the default, exposure is the exception.
     *
     * Binding the guard globally means a controller that forgets `@UseGuards`
     * fails closed with a 401 instead of serving unauthenticated traffic. 23
     * controllers previously had no guard at all, several of which moved money
     * and identified the caller from an `x-wallet-address` header.
     *
     * Routes that must be reachable without a token carry `@Public()`.
     *
     * @see docs/audit/11th-august-2026-1.md — SEC-003, SEC-010
     */
    { provide: APP_GUARD, useClass: JwtAuthGuard },

    /**
     * Registering ThrottlerModule only makes the guard *available*; Nest does
     * not apply it automatically. Without this binding there was no rate
     * limiting anywhere, which left OTP brute force, claim-code enumeration and
     * webhook flooding entirely unthrottled.
     *
     * @see docs/audit/11th-august-2026-1.md — SEC-016
     */
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: ThrottlerStorage, useExisting: RedisService },

    FiatRampService,
    ExpiryCron,
  ],
})
export class AppModule {}
export { IdentityService, RelayerService, FiatRampService, VaultService };
