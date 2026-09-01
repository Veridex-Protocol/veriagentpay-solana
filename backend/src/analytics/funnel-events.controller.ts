import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public } from '../auth/decorators/public.decorator';
import { FunnelEventsService, FUNNEL_EVENTS } from './funnel-events.service';

/** Client-reportable events. Anything else is rejected so the table stays clean. */
const CLIENT_REPORTABLE = new Set<string>([
  FUNNEL_EVENTS.ACTIVATE_PAGE_VIEWED,
  FUNNEL_EVENTS.TELEGRAM_DEEPLINK_CLICKED,
  FUNNEL_EVENTS.PASSKEY_STARTED,
  FUNNEL_EVENTS.REFERRAL_LINK_SHARED,
  FUNNEL_EVENTS.CAMPAIGN_CLICKED,
]);

@Controller('api/analytics')
export class FunnelEventsController {
  constructor(private readonly funnelEvents: FunnelEventsService) {}

  /**
   * Unauthenticated client-side funnel beacon. Only top-of-funnel events are
   * accepted here; value-moving milestones are recorded server-side only.
   */
  @Public()
  @Post('funnel')
  async recordClientEvent(
    @Body()
    body: {
      event?: string;
      src?: string;
      campaign?: string;
      partner?: string;
      channel?: string;
      ref?: string;
    },
  ) {
    if (!body?.event || !CLIENT_REPORTABLE.has(body.event)) {
      // Silently ignore unknown events rather than leaking the allowlist.
      return { recorded: false };
    }
    const recorded = await this.funnelEvents.track(body.event, {
      attribution: {
        src: body.src,
        campaign: body.campaign,
        partner: body.partner,
        channel: body.channel,
      },
      metadata: body.ref ? { ref: body.ref } : undefined,
    });
    return { recorded };
  }

  /** Weekly growth review table, grouped by acquisition source. */
  @Get('funnel/summary')
  @UseGuards(JwtAuthGuard)
  async getSummary(@Query('days') days?: string) {
    const sinceDays = Math.min(Math.max(Number(days) || 7, 1), 90);
    return {
      sinceDays,
      rows: await this.funnelEvents.getFunnelSummary(sinceDays),
    };
  }
}
