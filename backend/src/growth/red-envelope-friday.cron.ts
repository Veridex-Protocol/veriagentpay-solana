import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

/** `GlobalConfig` key managed through the protected admin configuration API. */
export const RED_ENVELOPE_FRIDAY_CONFIG_KEY = 'red_envelope_friday';

interface RedEnvelopeFridayConfig {
  enabled: boolean;
  creatorId: string;
  totalAmount: number;
  maxClaims: number;
  token: string;
}

function parseConfig(value: unknown): RedEnvelopeFridayConfig | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (input.enabled !== true) return null;

  const creatorId = typeof input.creatorId === 'string' ? input.creatorId.trim() : '';
  const token = typeof input.token === 'string' ? input.token.trim().toUpperCase() : '';
  const totalAmount = input.totalAmount;
  const maxClaims = input.maxClaims;
  if (
    !creatorId ||
    !token ||
    typeof totalAmount !== 'number' || !Number.isFinite(totalAmount) || totalAmount <= 0 ||
    typeof maxClaims !== 'number' || !Number.isInteger(maxClaims) || maxClaims < 1 || maxClaims > 1000
  ) {
    return null;
  }

  return { enabled: true, creatorId, totalAmount, maxClaims, token };
}

/** Creates the standing Red Envelope Friday drop at 17:00 WAT. */
@Injectable()
export class RedEnvelopeFridayCron {
  private readonly logger = new Logger(RedEnvelopeFridayCron.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Fridays at 17:00 WAT (UTC+1, no DST). */
  @Cron('0 17 * * 5', { name: 'red-envelope-friday', timeZone: 'Africa/Lagos' })
  async createFridayDrop() {
    const stored = await this.prisma.globalConfig.findUnique({
      where: { key: RED_ENVELOPE_FRIDAY_CONFIG_KEY },
      select: { value: true },
    });
    const config = parseConfig(stored?.value);
    if (!config) {
      this.logger.warn(
        `Red Envelope Friday skipped: configure enabled ${RED_ENVELOPE_FRIDAY_CONFIG_KEY} in GlobalConfig first`,
      );
      return;
    }

    const date = this.watDateKey();
    const scheduleKey = `red-envelope-friday:${date}`;

    try {
      const envelope = await this.prisma.publicEnvelope.create({
        data: {
          creatorId: config.creatorId,
          scheduleKey,
          token: config.token,
          totalAmount: config.totalAmount,
          remainingBalance: config.totalAmount,
          maxClaims: config.maxClaims,
          remainingClaims: config.maxClaims,
          status: 'ACTIVE',
        },
      });
      this.logger.log(
        `Red Envelope Friday: created ${envelope.id} (${config.totalAmount} ${config.token}, ${config.maxClaims} claims)`,
      );
    } catch (error: any) {
      // A unique scheduleKey makes repeat ticks and multi-instance schedulers
      // harmless while still surfacing actual database failures.
      if (error?.code === 'P2002') {
        this.logger.log(`Red Envelope Friday: ${scheduleKey} already exists`);
        return;
      }
      this.logger.error(`Red Envelope Friday failed: ${error.message}`, error.stack);
    }
  }

  private watDateKey(now = new Date()): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(now);
    const value = (type: string) => parts.find((part) => part.type === type)?.value;
    return `${value('year')}-${value('month')}-${value('day')}`;
  }
}
