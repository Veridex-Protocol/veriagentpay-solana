import { Controller, Post, Get, Body, Query, Req, HttpCode, HttpStatus, NotFoundException } from '@nestjs/common';
import type { Request } from 'express';
import { TelegramBotDriver } from './drivers/telegram-bot';
import { WhatsAppBotDriver } from './drivers/whatsapp-bot';
import { DiscordBotDriver } from './drivers/discord-bot';
import { SlackBotDriver } from './drivers/slack-bot';
import { WebhookVerifierService } from './webhook-verifier.service';
import { Public } from '../auth/decorators/public.decorator';
import { isPlatformEnabled, type SupportedPlatform } from '../config/platforms.config';

/**
 * Inbound platform webhooks.
 *
 * `@Public()` because these are called by the platforms, not by an authenticated
 * user — but every handler authenticates the *caller* cryptographically before
 * touching the body. The identity of the acting user is read from the payload,
 * so an unverified payload is an impersonation primitive: it let anyone execute
 * bot commands, including payments, as any user whose numeric id they knew.
 *
 * @see docs/audit/11th-august-2026-1.md — SEC-007
 */
@Public()
@Controller('api/platform')
export class PlatformController {
  constructor(
    private readonly telegramBotDriver: TelegramBotDriver,
    private readonly whatsappBotDriver: WhatsAppBotDriver,
    private readonly discordBotDriver: DiscordBotDriver,
    private readonly slackBotDriver: SlackBotDriver,
    private readonly verifier: WebhookVerifierService,
  ) {}

  /**
   * Disabled platforms must look like they were never wired up. A 404 before
   * signature verification means no disabled driver is reachable even by a
   * caller holding a valid platform signing secret.
   */
  private assertEnabled(platform: SupportedPlatform): void {
    if (!isPlatformEnabled(platform)) {
      throw new NotFoundException(`Platform "${platform}" is not enabled on this deployment.`);
    }
  }

  // --- TELEGRAM WEBHOOK ---
  @Post('telegram/webhook')
  @HttpCode(HttpStatus.OK)
  async handleTelegramWebhook(@Body() update: any, @Req() req: Request) {
    this.assertEnabled('telegram');
    this.verifier.verifyTelegram(req);

    if (!update) return { ok: true };

    const result = await this.telegramBotDriver.handleWebhookUpdate(update);
    if (result.responseText) {
      const chatId = update.message?.chat?.id || update.callback_query?.message?.chat?.id;
      if (chatId) {
        await this.telegramBotDriver.sendMessageWithMarkup(
          chatId.toString(),
          result.responseText,
          result.replyMarkup
        );
      }
    }
    return { ok: true };
  }

  // --- WHATSAPP WEBHOOK VERIFICATION & INCOMING MESSAGES ---
  @Get('whatsapp/webhook')
  verifyWhatsAppWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string
  ) {
    this.assertEnabled('whatsapp');
    return this.verifier.verifyWhatsAppHandshake(mode, token) ? challenge : 'Forbidden';
  }

  @Post('whatsapp/webhook')
  @HttpCode(HttpStatus.OK)
  async handleWhatsAppWebhook(@Body() body: any, @Req() req: Request) {
    this.assertEnabled('whatsapp');
    this.verifier.verifyWhatsApp(req);

    if (body) {
      const res = await this.whatsappBotDriver.handleIncomingMessage(body);
      if (res.replyMessage && res.toPhoneNumber) {
        await this.whatsappBotDriver.sendMessage(res.toPhoneNumber, res.replyMessage);
      }
    }
    return { status: 'ok' };
  }

  // --- DISCORD WEBHOOK & SLASH COMMANDS ---
  @Post('discord/webhook')
  @HttpCode(HttpStatus.OK)
  async handleDiscordWebhook(@Body() body: any, @Req() req: Request) {
    this.assertEnabled('discord');
    // Verified before the PING is answered: Discord treats an unverified PING
    // response as a failed endpoint registration.
    this.verifier.verifyDiscord(req);

    if (body?.type === 1) {
      return { type: 1 };
    }
    if (body) {
      const res = await this.discordBotDriver.handleDiscordMessage(body);
      if (body.type === 2) {
        // Interaction response
        return {
          type: 4,
          data: {
            content: res.response,
            embeds: res.embed ? [res.embed] : undefined,
          },
        };
      }
    }
    return { ok: true };
  }

  // --- SLACK SLASH COMMANDS & EVENTS ---
  @Post('slack/command')
  @HttpCode(HttpStatus.OK)
  async handleSlackCommand(@Body() body: any, @Req() req: Request) {
    this.assertEnabled('slack');
    this.verifier.verifySlack(req);

    if (body) {
      const res = await this.slackBotDriver.handleSlashCommand(body);
      if (res.modal) {
        return res.modal;
      }
      return {
        response_type: 'in_channel',
        text: res.responseText,
      };
    }
    return { ok: true };
  }

  @Post('slack/events')
  @HttpCode(HttpStatus.OK)
  async handleSlackEvents(@Body() body: any, @Req() req: Request) {
    this.assertEnabled('slack');
    this.verifier.verifySlack(req);

    if (body?.type === 'url_verification') {
      return { challenge: body.challenge };
    }
    if (body?.type === 'view_submission') {
      const res = await this.slackBotDriver.handleViewSubmission(body);
      return { response_action: 'clear', text: res.responseText };
    }
    return { ok: true };
  }
}
