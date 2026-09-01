import { Controller, Post, Get, Param, Body, Req, UseGuards, BadRequestException } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { EscrowService } from './escrow.service';
import { Throttle } from '@nestjs/throttler';

@Controller('api/shortlinks')
export class EscrowController {
  constructor(
    private readonly escrowService: EscrowService,
    private readonly prisma: PrismaService,
  ) {}

  /** Accepts either a user id or a wallet address from the auth guard. */
  private async resolveUserId(req: any): Promise<string> {
    const principal = req.user?.userId;
    if (!principal) throw new BadRequestException('Authentication required');

    const direct = await this.prisma.user.findUnique({ where: { id: principal } });
    if (direct) return direct.id;

    const byWallet = await this.prisma.user.findFirst({
      where: { smartWallet: { address: { equals: principal, mode: 'insensitive' } } },
    });
    if (byWallet) return byWallet.id;

    throw new BadRequestException('No account found for the authenticated principal');
  }

  @Post(':code/claim')
  @Throttle({ short: { ttl: 60_000, limit: 10 } })
  async claimEscrow(
    @Param('code') code: string,
    @Req() req: any,
  ) {
    const userId = await this.resolveUserId(req);
    const user = await this.prisma.user.findUnique({ where: { id: userId }, include: { smartWallet: true } });
    if (!user?.smartWallet?.address) throw new BadRequestException('A registered smart wallet is required');
    return this.escrowService.claim(code, userId, user.smartWallet.address);
  }

  /**
   * Outstanding escrows the caller can still cancel.
   *
   * Two path segments on purpose: `ShortLinksController` registers
   * `/api/shortlinks/:code` first, so any single-segment route here would be
   * swallowed as a short-link code.
   */
  @Get('mine/pending')
  @UseGuards(JwtAuthGuard)
  async listPending(@Req() req: any) {
    return this.escrowService.listCancellable(await this.resolveUserId(req));
  }

  /**
   * Cancels an unclaimed escrow and returns the funds on-chain to the sender.
   *
   * The sender is taken from the auth token, never from the request body: this
   * moves money, and a caller-supplied id would let anyone who knows another
   * user's id pull back that user's payments.
   */
  @Post(':code/cancel')
  @UseGuards(JwtAuthGuard)
  async cancelEscrow(@Param('code') code: string, @Req() req: any) {
    return this.escrowService.cancelClaimLink(code, await this.resolveUserId(req));
  }
}
