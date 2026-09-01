import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  Logger,
} from '@nestjs/common';
import { GrowthService } from './growth.service';

/**
 * NestJS interceptor that records an interaction streak entry after every
 * successful JWT-authenticated API request.
 *
 * Uses an in-memory per-user "already touched today" set so only the first
 * qualifying request per user per UTC calendar day hits the database. The set
 * resets itself automatically at midnight UTC.
 */
@Injectable()
export class InteractionStreakInterceptor implements NestInterceptor {
  private readonly logger = new Logger(InteractionStreakInterceptor.name);

  /** userId → UTC date string (YYYY-MM-DD) of last recorded interaction */
  private readonly touchedToday = new Map<string, string>();

  constructor(private readonly growthService: GrowthService) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<any> {
    const observable = next.handle();

    // After the response is handled, record the interaction asynchronously.
    const request = context.switchToHttp().getRequest();
    const userId = request?.user?.userId;

    if (userId) {
      const todayUTC = new Date().toISOString().split('T')[0];
      if (this.touchedToday.get(userId) !== todayUTC) {
        // Mark as touched immediately to avoid duplicate DB writes from
        // concurrent requests.
        this.touchedToday.set(userId, todayUTC);

        // Garbage-collect stale entries (from previous days) to avoid memory
        // leak on long-running processes.
        if (this.touchedToday.size > 10_000) {
          for (const [uid, day] of this.touchedToday) {
            if (day !== todayUTC) this.touchedToday.delete(uid);
          }
        }

        // Fire-and-forget — streak recording must never block the response.
        this.growthService
          .recordInteraction(userId, 'APP_LOGIN')
          .catch((err) =>
            this.logger.warn(`Failed to record interaction streak for ${userId}: ${err.message}`),
          );
      }
    }

    return observable;
  }
}
