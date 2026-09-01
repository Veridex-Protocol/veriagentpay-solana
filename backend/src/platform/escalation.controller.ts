import { Controller, Get, Query, Logger } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';
import { PaymentEscalationService } from './payment-escalation.service';

/**
 * Validates the signed links {@link PaymentEscalationService} hands out in chat.
 *
 * @dev The check has to live server-side: the HMAC key is `DEEPLINK_SECRET`,
 *      which cannot be shipped to a browser. The client sends back the query it
 *      was opened with and is told whether those parameters are the ones we
 *      signed.
 *
 *      `@Public()` because the link may be opened before the user has a
 *      session — the destination screen authenticates them separately, and
 *      refusing to validate until then would break the flow this exists to
 *      support. Nothing sensitive is returned: the endpoint confirms a
 *      signature the caller already holds, and cannot be used to obtain one.
 */
@Public()
@Controller('api/escalation')
export class EscalationController {
  private readonly logger = new Logger(EscalationController.name);

  constructor(private readonly escalation: PaymentEscalationService) {}

  /**
   * @returns `{ valid: true }` when the parameters carry a signature this
   *          service produced and the link has not expired.
   */
  @Get('verify')
  // Tighter than the global tier: a valid caller checks once per link, so
  // sustained traffic here is someone probing signatures.
  @Throttle({ short: { ttl: 60_000, limit: 20 } })
  verify(@Query() query: Record<string, string | undefined>) {
    const result = this.escalation.verify(query);

    if (!result.valid) {
      // No parameter values: the point of the log is the rate and shape of
      // failures, and a tampered link carries an attacker-chosen recipient.
      this.logger.warn(`Rejected escalation link (${result.reason})`);
    }

    return result;
  }
}
