import { Body, Controller, Delete, Get, Param, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import { WebAuthnService } from './webauthn.service';
import { Public } from '../auth/decorators/public.decorator';

@Controller('api/webauthn')
export class WebAuthnController {
  constructor(private readonly webAuthn: WebAuthnService) {}

  private attachRefreshCookie(res: Response, result: any) {
    if (!result?.refreshToken) return result;
    const { refreshToken, ...publicResult } = result;
    res.cookie('veriagent_refresh', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api/webauthn',
      maxAge: 30 * 24 * 3600_000,
    });
    return publicResult;
  }

  // Self-serve web signup needs no claim code and no signed link, so this is
  // the one registration entry an anonymous caller can reach freely. The HMAC
  // gate used to be what bounded account creation; with it gone for `web`, the
  // rate limit is. Sized for a human retrying a failed biometric prompt, not
  // for a script minting wallets.
  @Throttle({ medium: { ttl: 60_000, limit: 10 }, long: { ttl: 3_600_000, limit: 30 } })
  @Public()
  @Post('registration/options')
  async registrationOptions(@Body() body: any, @Req() request: any) {
    // A claim code or signed onboarding link means the caller is establishing
    // a new account or acting under the signed link's authorization, not whoever
    // this browser last authenticated as. Honouring a bearer here would enrol
    // the passkey on the wrong account or fail if the old session is stale.
    const isOnboardingOrClaim = Boolean(body?.claimCode || (body?.sig && body?.expires));
    const bearerUserId = isOnboardingOrClaim
      ? undefined
      : this.webAuthn.authenticateBearer(request.headers.authorization);

    // Strip any caller-supplied identity claim. `userId` is server-derived, and
    // letting it through the body allowed an unauthenticated caller to enrol a
    // passkey on any account (SEC-002). Destructured out rather than deleted so
    // the omission is visible at the boundary.
    const { userId: _ignoredUserId, ...safeBody } = body ?? {};

    if (bearerUserId) {
      try {
        return await this.webAuthn.registrationOptionsForUser(bearerUserId, safeBody.label);
      } catch (e: any) {
        const is401 = e?.status === 401 || (typeof e?.getStatus === 'function' && e.getStatus() === 401);
        if (is401) return this.webAuthn.registrationOptions(safeBody);
        throw e;
      }
    }
    return this.webAuthn.registrationOptions(safeBody);
  }

  // Registration and authentication are how a caller *obtains* a token, so they
  // necessarily precede having one. Each carries its own authorization: a
  // server-issued challenge that must be consumed, plus a claim code or signed
  // onboarding link for anonymous registration entry.
  @Public()
  @Post('registration/verify')
  async verifyRegistration(@Body() body: { challengeId: string; response: RegistrationResponseJSON }, @Res({ passthrough: true }) res: Response) {
    return this.attachRefreshCookie(res, await this.webAuthn.verifyRegistration(body.challengeId, body.response));
  }

  @Public()
  @Post('authentication/options')
  authenticationOptions() {
    return this.webAuthn.authenticationOptions();
  }

  @Public()
  @Post('authentication/verify')
  async verifyAuthentication(@Body() body: { challengeId: string; response: AuthenticationResponseJSON }, @Res({ passthrough: true }) res: Response) {
    return this.attachRefreshCookie(res, await this.webAuthn.verifyAuthentication(body.challengeId, body.response));
  }

  @Get('credentials')
  listCredentials(@Req() request: any) {
    const userId = this.webAuthn.authenticateBearer(request.headers.authorization);
    if (!userId) throw new UnauthorizedException('Authentication required');
    return this.webAuthn.listCredentials(userId);
  }

  @Delete('credentials/:id')
  revokeCredential(@Param('id') id: string, @Req() request: any) {
    const userId = this.webAuthn.authenticateBearer(request.headers.authorization);
    if (!userId) throw new UnauthorizedException('Authentication required');
    return this.webAuthn.revokeCredential(userId, id);
  }

  @Post('refresh')
  @Public()
  async refreshToken(@Req() request: any, @Res({ passthrough: true }) res: Response) {
    const token = request.cookies?.veriagent_refresh;
    if (!token) throw new UnauthorizedException('Refresh token missing');
    try {
      return this.attachRefreshCookie(res, await this.webAuthn.refreshToken(token));
    } catch (error) {
      // Do not leave a rejected cookie in the browser; otherwise every expired
      // access token retries the same invalid refresh token indefinitely.
      res.clearCookie('veriagent_refresh', { path: '/api/webauthn' });
      throw error;
    }
  }

  @Post('logout')
  @Public()
  async logout(@Req() request: any, @Res({ passthrough: true }) res: Response) {
    const result = await this.webAuthn.logout(request.cookies?.veriagent_refresh, request.headers.authorization);
    res.clearCookie('veriagent_refresh', { path: '/api/webauthn' });
    return result;
  }
}
