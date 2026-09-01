import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route as reachable without an access token.
 *
 * `JwtAuthGuard` is bound globally via `APP_GUARD`, so authentication is the
 * default and exposure is the exception. A route is public only when it carries
 * this decorator — forgetting it fails closed (401) rather than open.
 *
 * @see docs/audit/11th-august-2026-1.md — SEC-010
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
