import { Controller, Post, Get, Body, Param, Res, HttpStatus, BadRequestException } from '@nestjs/common';
import { Response } from 'express';
import { ShortLinksService, CreateShortLinkDto } from './shortlinks.service';
import { getAppBaseUrl } from '../config/app-url.config';
import { Public } from '../auth/decorators/public.decorator';
import { Throttle } from '@nestjs/throttler';

// Claim/short links are opened by recipients who have no account yet; the code
// itself is the bearer credential.
@Public()
@Controller()
export class ShortLinksController {
  constructor(private readonly shortLinksService: ShortLinksService) { }

  /**
   * Top-level 302 redirect route for short URLs (/c/:code)
   */
  @Get('c/:code')
  @Throttle({ short: { ttl: 60_000, limit: 10 } })
  async redirectShortUrl(@Param('code') code: string, @Res() res: Response) {
    const record = await this.shortLinksService.resolve(code);
    const frontendBaseUrl = getAppBaseUrl();

    // Server-side redirect construction from DB-backed fields (never long URL query params)
    let redirectUrl = `${frontendBaseUrl}/pay?code=${encodeURIComponent(code)}`;

    if (record.kind === 'envelope') {
      redirectUrl = `${frontendBaseUrl}/envelopes/${record.envelopeId || code}`;
    } else if (record.kind === 'request') {
      redirectUrl = `${frontendBaseUrl}/request?code=${encodeURIComponent(code)}`;
    } else if (record.kind === 'referral') {
      redirectUrl = `${frontendBaseUrl}/invite?code=${encodeURIComponent(code)}`;
    }

    return res.redirect(HttpStatus.FOUND, redirectUrl);
  }

  /**
   * API endpoint to create a new short link
   */
  @Post('api/shortlinks')
  async createShortLink(@Body() dto: CreateShortLinkDto) {
    return this.shortLinksService.create(dto);
  }

  /**
   * API endpoint to fetch short link JSON metadata for claim preview cards
   */
  @Get('api/shortlinks/:code')
  @Throttle({ short: { ttl: 60_000, limit: 10 } })
  async getShortLinkMetadata(@Param('code') code: string) {
    return this.shortLinksService.resolve(code);
  }

  // Cancellation lives on EscrowController: it must release the on-chain
  // escrow, not merely retire the record. Flipping the status here left the
  // sender's funds locked in the contract while telling them it was cancelled.
}
