import { Injectable } from '@nestjs/common';
import * as client from 'prom-client';

@Injectable()
export class MetricsService {
  public readonly httpRequestDuration: client.Histogram<string>;
  public readonly relayerBalanceGauge: client.Gauge<string>;
  public readonly failedLoginCounter: client.Counter<string>;
  public readonly largeTransactionCounter: client.Counter<string>;

  constructor() {
    client.collectDefaultMetrics({ prefix: 'veriagent_' });

    this.httpRequestDuration = new client.Histogram({
      name: 'veriagent_http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    });

    this.relayerBalanceGauge = new client.Gauge({
      name: 'veriagent_relayer_balance_bot',
      help: 'Current operational gas balance of the relayer wallet in BOT tokens',
      labelNames: ['wallet_address'],
    });

    this.failedLoginCounter = new client.Counter({
      name: 'veriagent_failed_login_attempts_total',
      help: 'Total count of failed login or unauthorized authentication attempts',
      labelNames: ['platform', 'reason'],
    });

    this.largeTransactionCounter = new client.Counter({
      name: 'veriagent_large_transactions_total',
      help: 'Total count of transactions exceeding $1,000 USD security monitoring threshold',
      labelNames: ['asset', 'type'],
    });
  }

  recordApiLatency(method: string, route: string, statusCode: number, durationSeconds: number) {
    this.httpRequestDuration.observe({ method, route, status_code: statusCode.toString() }, durationSeconds);
  }

  updateRelayerBalance(address: string, balanceFormatted: number) {
    this.relayerBalanceGauge.set({ wallet_address: address }, balanceFormatted);
  }

  incFailedLogins(platform: string, reason: string) {
    this.failedLoginCounter.inc({ platform, reason });
  }

  incLargeTransactions(asset: string, type: string) {
    this.largeTransactionCounter.inc({ asset, type });
  }
}
