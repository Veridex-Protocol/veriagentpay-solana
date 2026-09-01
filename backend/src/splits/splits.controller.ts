import { Controller, Get, Post, Body, Param, Headers, UseGuards, BadRequestException } from '@nestjs/common';
import { SplitsService } from './splits.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WalletAddress } from '../auth/decorators/wallet-address.decorator';

@Controller('api/splits')
export class SplitsController {
  constructor(private readonly splitsService: SplitsService) {}

  @Get()
  async listSplits(@WalletAddress() walletAddress: string) {
    // Identity is the authenticated caller. The previous chain fell back
    // through three spoofable headers to the literal 'anonymous', which both
    // leaked other users' splits and grouped unrelated callers together.
    const splits = await this.splitsService.getUserSplits(walletAddress);
    return { splits };
  }

  @Get(':id')
  async getSplitDetail(
    @Param('id') id: string,
    @WalletAddress() walletAddress: string,
  ) {
    const split = await this.splitsService.getSplit(id, walletAddress);
    return { split };
  }

  @Post()
  async createSplit(
    @Body() body: {
      token?: string;
      totalAmount?: number;
      amounts?: number[];
      participants: string[];
      customAmounts?: number[];
      description?: string;
    },
    @WalletAddress() walletAddress: string,
  ) {
    const creatorIdentifier = walletAddress;
    const totalAmount = body.totalAmount || (body.amounts ? body.amounts.reduce((a, b) => a + b, 0) : 0);

    if (!totalAmount || totalAmount <= 0) {
      throw new BadRequestException('Total amount must be greater than 0');
    }
    if (!body.participants || body.participants.length === 0) {
      throw new BadRequestException('At least one participant is required');
    }

    const split = await this.splitsService.createSplit(creatorIdentifier, {
      token: body.token || 'USDC',
      totalAmount,
      participants: body.participants,
      customAmounts: body.customAmounts,
      description: body.description || 'Group Split',
    });

    return { splitId: split.id, split };
  }

  @Post(':id/pay')
  async paySplit(
    @Param('id') id: string,
    @WalletAddress() walletAddress: string,
  ) {
    // The payer is the authenticated caller. It was previously taken from
    // `body.payerIdentifier` first, falling back through two headers to the
    // literal string 'participant' — so a caller could settle a split as
    // anyone, or as a placeholder identity that belongs to no one.
    const result = await this.splitsService.paySplit(id, walletAddress);
    return result;
  }

  private extractUserFromAuth(authHeader?: string): string {
    if (!authHeader?.startsWith('Bearer ')) return '';
    try {
      const jwt = require('jsonwebtoken');
      const token = authHeader.slice(7);
      const decoded = jwt.decode(token) as any;
      return decoded?.sub || decoded?.userId || decoded?.id || decoded?.address || '';
    } catch {
      return '';
    }
  }
}
