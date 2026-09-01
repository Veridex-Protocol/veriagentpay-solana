import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserTokensService } from './user-tokens.service';

export interface AddTokenDto {
  /** Contract address. Symbols are deliberately not accepted here. */
  address: string;
}

/**
 * Lets a user add tokens for us to watch, by contract address.
 *
 * @dev Adding is throttled harder than the global tier: each add makes three
 *      RPC calls to a contract the caller chose, so an unthrottled endpoint is
 *      a way to make our node do someone else's work.
 */
@UseGuards(JwtAuthGuard)
@Controller('api/tokens')
export class UserTokensController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly userTokens: UserTokensService,
  ) {}

  private async resolveUserId(req: any): Promise<string> {
    const userId = req.user?.userId;
    if (userId) {
      const exists = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
      if (exists) return exists.id;
    }

    const walletAddress = req.user?.walletAddress;
    if (walletAddress) {
      const user = await this.prisma.user.findFirst({
        where: { smartWallet: { address: { equals: walletAddress, mode: 'insensitive' } } },
        select: { id: true },
      });
      if (user) return user.id;
    }

    throw new NotFoundException('User not found');
  }

  /** Built-ins plus the caller's own tokens, built-ins first. */
  @Get()
  async list(@Req() req: any) {
    const userId = await this.resolveUserId(req);
    const tokens = await this.userTokens.allTokensForUser(userId);
    const custom = new Set((await this.userTokens.listForUser(userId)).map((t) => t.address));

    return {
      tokens: tokens.map((token) => ({
        ...token,
        // The client needs this to badge a token as unverified: a custom token
        // asserts its own symbol and nobody has checked it.
        custom: custom.has(token.address),
      })),
    };
  }

  @Post()
  @Throttle({ short: { ttl: 60_000, limit: 5 } })
  async add(@Req() req: any, @Body() dto: AddTokenDto) {
    const userId = await this.resolveUserId(req);
    const token = await this.userTokens.addToken(userId, dto?.address);

    return {
      success: true,
      token,
      alreadyKnown: Boolean((token as any).alreadyKnown),
    };
  }

  @Delete(':address')
  async remove(@Req() req: any, @Param('address') address: string) {
    const userId = await this.resolveUserId(req);
    await this.userTokens.removeToken(userId, address);
    return { success: true };
  }
}
