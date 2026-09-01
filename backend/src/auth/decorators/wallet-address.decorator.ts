import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';

/**
 * The caller's smart wallet address, taken from the verified access token.
 *
 * A drop-in replacement for `@Headers('x-wallet-address')`. The header carried
 * no proof of ownership — a wallet address is public data — so any caller could
 * name any wallet and act as its owner. `JwtAuthGuard` populates `req.user` from
 * a signed token, and the address is read from there.
 *
 * @see docs/audit/11th-august-2026-1.md — SEC-010
 */
export const WalletAddress = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest();
  const address = request.user?.walletAddress;

  if (!address) {
    throw new UnauthorizedException(
      'No wallet is associated with this account. Complete passkey registration first.',
    );
  }
  return address;
});

/** The caller's user id, taken from the verified access token. */
export const CurrentUserId = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest();
  const userId = request.user?.userId;
  if (!userId) throw new UnauthorizedException('Authentication required');
  return userId;
});
