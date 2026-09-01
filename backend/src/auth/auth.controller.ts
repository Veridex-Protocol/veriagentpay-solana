import { Controller, Post, Get, Body, Headers, Query, Res, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { Response } from 'express';
import * as crypto from 'crypto';
import { AuthService, ChallengeRequestDto, VerifyChallengeDto } from './auth.service';
import { DiscordOAuthService } from './discord-oauth.service';
import { SlackOAuthService } from './slack-oauth.service';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUserId } from '../auth/decorators/wallet-address.decorator';
import { OAuthStateService } from './oauth-state.service';
import { RedisService } from '../core/redis.service';

// Login and OAuth callbacks are how a token is obtained.
@Controller('api/auth')
export class AuthController {
  constructor(
    private readonly oauthState: OAuthStateService,
    private readonly authService: AuthService,
    private readonly discordOAuthService: DiscordOAuthService,
    private readonly slackOAuthService: SlackOAuthService,
    private readonly redis: RedisService,
  ) {}

  // `POST google` is deliberately absent. It minted a full-privilege access
  // token from `jwt.decode()` — an unverified read of a token anyone can write —
  // and fell back to a fabricated identity when the token had no `sub`. Any
  // caller could claim any account. Google user sign-in is retired; the passkey
  // challenge/verify pair below is the only user login path. Admin Google login
  // (`/api/admin/auth/login`) is unaffected: it verifies against Google's JWKS.
  @Public()
  @Post('challenge')
  async requestChallenge(@Body() body: ChallengeRequestDto) {
    return await this.authService.generateChallenge(body.walletAddress);
  }

  @Public()
  @Post('verify')
  async verifyChallenge(@Body() body: VerifyChallengeDto) {
    return await this.authService.verifyChallenge(body);
  }

  @Public()
  @Post('exchange-code')
  async exchangeOAuthCode(@Body('code') code: string) {
    if (!code || typeof code !== 'string') {
      throw new BadRequestException('Exchange code is required');
    }
    const key = `oauth:exchange:${code}`;
    const stored = await this.redis.takeJson<{ token: string; user?: any }>(key);
    if (!stored) {
      throw new UnauthorizedException('Invalid or expired exchange code');
    }
    return { token: stored.token, user: stored.user };
  }

  @Get('me')
  async getMe(@CurrentUserId() userId: string) {
    // Identity from the verified token subject, not from `x-wallet-address` — which
    // let any caller read any user's profile by naming their address.
    return await this.authService.getProfile(userId);
  }

  /**
   * Server-side validation for returnTo (defense-in-depth).
   * Rejects non-relative paths, protocol-relative paths ('//'), and control chars.
   */
  private validateReturnTo(returnTo?: string): string | undefined {
    if (!returnTo || typeof returnTo !== 'string') return undefined;
    const trimmed = returnTo.trim();
    if (trimmed.startsWith('/') && !trimmed.startsWith('//') && !/[\r\n\x00-\x1f]/.test(trimmed)) {
      return trimmed;
    }
    return undefined;
  }

  // --- DISCORD OAUTH ---
  @Public()
  @Get('discord')
  async discordAuth(@Query('returnTo') returnTo: string, @Res() res: Response) {
    // State is minted here, never accepted from the caller. A client-supplied
    // value proves nothing on the way back.
    const safeReturnTo = this.validateReturnTo(returnTo);
    const state = await this.oauthState.issue('discord', safeReturnTo);
    const authUrl = this.discordOAuthService.getAuthorizationUrl(state);
    return res.redirect(authUrl);
  }

  @Public()
  @Get('discord/callback')
  async discordCallback(@Query('code') code: string, @Query('state') state: string, @Res() res: Response) {
    try {
      // Verify and consume before exchanging the code. A callback whose state we
      // did not issue — or that has already been used — is refused outright.
      const verified = await this.oauthState.consume('discord', state);
      if (!verified) {
        throw new Error('This sign-in link is invalid or has expired. Please start again.');
      }

      const { user, jwt } = await this.discordOAuthService.handleOAuthCallback(code);
      const exchangeCode = crypto.randomBytes(16).toString('hex');
      const ttlMs = 60 * 1000; // 60s single-use exchange code
      await this.redis.setJson(`oauth:exchange:${exchangeCode}`, { token: jwt, user }, ttlMs);

      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const returnToParam = verified.returnTo ? `&returnTo=${encodeURIComponent(verified.returnTo)}` : '';
      return res.redirect(`${frontendUrl}/auth/callback?code=${exchangeCode}&provider=discord${returnToParam}`);
    } catch (error: any) {
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/error?message=${encodeURIComponent(error.message)}`);
    }
  }

  // --- SLACK OAUTH ---
  @Public()
  @Get('slack')
  async slackAuth(@Query('returnTo') returnTo: string, @Res() res: Response) {
    // State is minted here, never accepted from the caller. A client-supplied
    // value proves nothing on the way back.
    const safeReturnTo = this.validateReturnTo(returnTo);
    const state = await this.oauthState.issue('slack', safeReturnTo);
    const authUrl = this.slackOAuthService.getAuthorizationUrl(state);
    return res.redirect(authUrl);
  }

  @Public()
  @Get('slack/callback')
  async slackCallback(@Query('code') code: string, @Query('state') state: string, @Res() res: Response) {
    try {
      // Verify and consume before exchanging the code. A callback whose state we
      // did not issue — or that has already been used — is refused outright.
      const verified = await this.oauthState.consume('slack', state);
      if (!verified) {
        throw new Error('This sign-in link is invalid or has expired. Please start again.');
      }

      const { user, jwt } = await this.slackOAuthService.handleOAuthCallback(code);
      const exchangeCode = crypto.randomBytes(16).toString('hex');
      const ttlMs = 60 * 1000; // 60s single-use exchange code
      await this.redis.setJson(`oauth:exchange:${exchangeCode}`, { token: jwt, user }, ttlMs);

      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const returnToParam = verified.returnTo ? `&returnTo=${encodeURIComponent(verified.returnTo)}` : '';
      return res.redirect(`${frontendUrl}/auth/callback?code=${exchangeCode}&provider=slack${returnToParam}`);
    } catch (error: any) {
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/error?message=${encodeURIComponent(error.message)}`);
    }
  }
}
