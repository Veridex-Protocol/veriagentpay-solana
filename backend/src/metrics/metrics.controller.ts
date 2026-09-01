import { Controller, Get, Headers, Response, UnauthorizedException } from '@nestjs/common';
import { Response as ExpressResponse } from 'express';
import * as crypto from 'crypto';
import { Public } from '../auth/decorators/public.decorator';

// Prometheus scrape target. Reachable only on the internal network — confirm
// nginx does not proxy /metrics publicly.
/**
 * @dev `@Public()` because Prometheus scrapes it without a user session — but
 *      not unauthenticated: when `METRICS_TOKEN` is set the scraper must present
 *      it. Previously this endpoint's only protection was an assumption about
 *      nginx configuration, which is not a control the application can verify.
 *
 * @see docs/security-remaining-issues.md — BE-M-09
 */
@Public()
@Controller()
export class MetricsController {
  @Get('metrics')
  async getMetrics(
    @Response() res: ExpressResponse,
    @Headers('authorization') authorization?: string,
  ) {
    // When METRICS_TOKEN is configured the scraper must present it. Unset keeps
    // local and CI scraping frictionless; production should set it rather than
    // rely on nginx being configured correctly, which the app cannot verify.
    const required = process.env.METRICS_TOKEN;
    if (required) {
      const supplied = (authorization || '').replace(/^Bearer\s+/i, '').trim();
      const reqBuf = Buffer.from(required);
      const supBuf = Buffer.from(supplied);
      if (reqBuf.length !== supBuf.length || !crypto.timingSafeEqual(reqBuf, supBuf)) {
        throw new UnauthorizedException('Metrics access requires a valid token');
      }
    }

    try {
      // Try to use the Prometheus registry if available
      const promClient = require('prom-client');
      const register = promClient.register;

      // Remove Bun-incompatible metrics
      register.removeSingleMetric('nodejs_heap_space_size_total_bytes');
      register.removeSingleMetric('nodejs_heap_space_size_used_bytes');
      register.removeSingleMetric('nodejs_heap_space_size_available_bytes');

      res.set('Content-Type', register.contentType);
      const metrics = await register.metrics();
      res.send(metrics);
    } catch (error) {
      // Fallback to basic Bun-compatible metrics
      const mem = process.memoryUsage();
      res.set('Content-Type', 'text/plain');
      res.send(`# HELP nodejs_process_uptime_seconds Process uptime in seconds
# TYPE nodejs_process_uptime_seconds gauge
nodejs_process_uptime_seconds ${process.uptime()}

# HELP nodejs_memory_heap_used_bytes Heap memory used in bytes
# TYPE nodejs_memory_heap_used_bytes gauge
nodejs_memory_heap_used_bytes ${mem.heapUsed}

# HELP nodejs_memory_heap_total_bytes Total heap memory in bytes
# TYPE nodejs_memory_heap_total_bytes gauge
nodejs_memory_heap_total_bytes ${mem.heapTotal}

# HELP nodejs_memory_rss_bytes Resident set size in bytes
# TYPE nodejs_memory_rss_bytes gauge
nodejs_memory_rss_bytes ${mem.rss}

# HELP http_requests_total Total HTTP requests (mock)
# TYPE http_requests_total counter
http_requests_total 0
`);
    }
  }
}
