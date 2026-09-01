import { Controller, Post, Body, Res, HttpCode, HttpStatus, UnauthorizedException, Get, Req, Logger, Header } from '@nestjs/common';
import { Response, Request } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { AdminService } from './admin.service';
import { Public } from '../auth/decorators/public.decorator';
import { ADMIN_JWT_SECRET, GOOGLE_OAUTH_CLIENT_ID } from '../config/secrets';
import * as jwt from 'jsonwebtoken';

/**
 * Admin authentication endpoints.
 *
 * `@Public()` here means "not gated by the *user* JWT guard" — these routes are
 * how an administrator obtains a token, so they necessarily precede having one.
 * Each carries its own credential check.
 */
@Public()
@Controller('api/admin/auth')
export class AdminAuthController {
  private readonly logger = new Logger(AdminAuthController.name);
  private readonly googleClient = new OAuth2Client(GOOGLE_OAUTH_CLIENT_ID);

  constructor(private readonly adminService: AdminService) {}

  /**
   * Request Telegram 6-Digit OTP Code
   */
  @Post('request-otp')
  @HttpCode(HttpStatus.OK)
  async requestOtp(@Body() body: { email?: string; identifier?: string }) {
    const identifier = body.email || body.identifier;
    if (!identifier) {
      throw new UnauthorizedException('Admin email or identifier required');
    }
    return this.adminService.requestOtp(identifier);
  }

  /**
   * Verify Telegram 6-Digit OTP Code and Log In
   */
  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  async verifyOtp(
    @Body() body: { email?: string; identifier?: string; code: string },
    @Res({ passthrough: true }) res: Response
  ) {
    const identifier = body.email || body.identifier;
    if (!identifier || !body.code) {
      throw new UnauthorizedException('Admin identifier and 6-digit OTP code required');
    }

    const isValid = await this.adminService.verifyOtp(identifier, body.code);
    if (!isValid) {
      throw new UnauthorizedException('Invalid or expired 6-digit verification code');
    }

    const admin = await this.adminService.getAdminByEmail(identifier);
    if (!admin) {
      throw new UnauthorizedException('Admin account not provisioned');
    }
    return this.issueAdminToken(admin, res);
  }

  /**
   * Login with a Google ID token.
   *
   * The token is cryptographically verified against Google's JWKS, including
   * issuer, audience, and expiry. The previous implementation accepted a plain
   * `email` string and checked only whitelist membership — `googleIdToken` was
   * declared in the signature and never read — so knowing an administrator's
   * email address was the entire authentication.
   *
   * @see docs/audit/11th-august-2026-1.md — SEC-004
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() body: { googleIdToken?: string; credential?: string },
    @Res({ passthrough: true }) res: Response
  ) {
    // Google Identity Services returns the ID token as `credential`; accept
    // either name, but both are treated as a token to verify, never as an
    // identifier to trust.
    const idToken = body.googleIdToken || body.credential;
    if (!idToken) {
      throw new UnauthorizedException('Google ID token required');
    }

    let payload;
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken,
        audience: GOOGLE_OAUTH_CLIENT_ID,
      });
      payload = ticket.getPayload();
    } catch (e: any) {
      this.logger.warn(`Google ID token verification failed: ${e.message}`);
      throw new UnauthorizedException('Invalid Google ID token');
    }

    if (!payload?.email) {
      throw new UnauthorizedException('Google ID token carries no email claim');
    }
    if (!payload.email_verified) {
      throw new UnauthorizedException('Google account email is not verified');
    }

    const isWhitelisted = await this.adminService.isWhitelisted('email', payload.email);
    if (!isWhitelisted) {
      throw new UnauthorizedException('Access Denied: Account not whitelisted for admin access');
    }

    const admin = await this.adminService.getAdminByEmail(payload.email);
    return this.issueAdminToken(admin, res);
  }

  /**
   * Refresh Access Token
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies ? req.cookies['admin_token'] : null;
    if (!token) {
      throw new UnauthorizedException('Refresh token missing');
    }

    

    try {
      const decoded: any = jwt.verify(token, ADMIN_JWT_SECRET, { issuer: 'veriagent-admin-auth' });
      const admin = await this.adminService.getAdminByEmail(decoded.email || decoded.sub);
      return this.issueAdminToken(admin, res);
    } catch (e) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Res({ passthrough: true }) res: Response) {
    // Options must match those the cookie was set with, or the browser keeps it.
    const cookieDomain = process.env.ADMIN_COOKIE_DOMAIN || undefined;
    res.clearCookie('admin_token', { httpOnly: true, sameSite: 'strict', path: '/', ...(cookieDomain ? { domain: cookieDomain } : {}) });
    return { success: true, message: 'Logged out successfully' };
  }

  @Get('me')
  @Header('Cache-Control', 'no-store')
  async me(@Req() req: Request) {
    const authHeader = req.headers['authorization'];
    const adminCookie = req.cookies ? req.cookies['admin_token'] : null;
    const token = authHeader ? authHeader.replace(/^Bearer\s+/, '') : adminCookie;

    if (!token) {
      throw new UnauthorizedException('Not authenticated');
    }

    

    let decoded: any;
    try {
      decoded = jwt.verify(token, ADMIN_JWT_SECRET, { issuer: 'veriagent-admin-auth' });
    } catch (e) {
      throw new UnauthorizedException('Session expired');
    }

    // Role reported from the database, not from the token. Echoing a token
    // claim back — and defaulting it to SUPER_ADMIN — told the UI the caller
    // had privileges the server would not actually grant.
    const identifier = decoded.email || decoded.sub;
    const admin = await this.adminService.getAdminByEmail(identifier);
    if (!admin) {
      throw new UnauthorizedException('Admin account not provisioned');
    }

    return {
      admin: {
        email: admin.email,
        role: admin.role,
      },
    };
  }

  private issueAdminToken(admin: any, res: Response) {
    if (!admin?.email) {
      throw new UnauthorizedException('Admin account not provisioned');
    }

    // `adminRole` is carried for display only — AdminRolesGuard reads the role
    // from the database and ignores this claim.
    const token = jwt.sign(
      {
        sub: admin.email,
        email: admin.email,
        role: 'admin',
        adminRole: admin.role,
        iss: 'veriagent-admin-auth',
      },
      ADMIN_JWT_SECRET,
      { expiresIn: '1h' }
    );

    // The cookie is the credential. `sameSite: 'strict'` because the admin
    // console is never legitimately reached from another site, and every guard
    // already accepts this cookie.
    const cookieDomain = process.env.ADMIN_COOKIE_DOMAIN || undefined;
    res.cookie('admin_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 3600 * 1000,
      path: '/',
      ...(cookieDomain ? { domain: cookieDomain } : {}),
    });

    // The token is deliberately not in the body. Returning it invited the
    // client to persist it in localStorage, where any XSS payload, extension or
    // third-party script can read it — and that token grants account freeze,
    // session revocation and broadcast.
    //
    // @see docs/security-remediation-plan.md — FE-C-01
    return {
      success: true,
      admin: {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
      },
    };
  }
}
