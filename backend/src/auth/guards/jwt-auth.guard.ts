import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../../config/secrets';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { RedisService } from '../../core/redis.service';

/**
 * The platform's single authentication gate.
 *
 * Bound globally through `APP_GUARD`, so every route requires a verified access
 * token unless it is explicitly marked `@Public()`.
 *
 * Two behaviours were deliberately removed:
 *
 * - The `AUTH_MODE !== 'production'` fallback that authenticated a caller from
 *   an `x-wallet-address` header. A wallet address is public data, not a
 *   credential, and the mode defaulted to `demo` — so the bypass was active
 *   wherever the variable was unset or set to anything other than `production`.
 * - The `decoded.userId || decoded.walletAddress` fallback, which let a token
 *   issued for one identity shape authenticate as a different one downstream.
 *
 * @see docs/audit/11th-august-2026-1.md — SEC-003, SEC-008, SEC-010
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(private readonly reflector: Reflector, private readonly redis: RedisService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Non-HTTP contexts (websocket gateways, scheduled jobs) carry no request to
    // authenticate; they are guarded at their own layer.
    if (context.getType() !== 'http') return true;

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers?.['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Authentication required');
    }

    try {
      const decoded: any = jwt.verify(authHeader.slice(7).trim(), JWT_SECRET);

      if (!decoded?.userId) {
        throw new UnauthorizedException('Authentication required');
      }
      // A token without `jti` cannot be revoked, so it is refused rather than
      // trusted. The previous form — checking revocation only when a `jti`
      // happened to be present — meant any issuer that omitted one produced
      // tokens that survived logout and incident response for their full life.
      // Failing closed here is what stops that regressing silently.
      //
      // Safe to enforce now: JWT_SECRET was rotated, so no token predating this
      // is valid anyway.
      //
      // @see docs/security-remaining-issues.md — BE-H-04
      if (!decoded.jti) {
        throw new UnauthorizedException('Authentication required');
      }
      if (await this.redis.exists(`jwt:revoked:${decoded.jti}`)) {
        throw new UnauthorizedException('Authentication required');
      }

      request.user = {
        userId: decoded.userId,
        walletAddress: decoded.walletAddress ?? null,
        email: decoded.email ?? null,
      };
      return true;
    } catch (err: any) {
      if (err instanceof UnauthorizedException) throw err;
      this.logger.warn(`JWT verification failed: ${err.message}`);
      // Keep token implementation details in server logs. Clients only need
      // to know that authentication must be renewed.
      throw new UnauthorizedException('Authentication required');
    }
  }
}
