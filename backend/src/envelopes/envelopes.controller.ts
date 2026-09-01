import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Headers,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { EnvelopesService, CreateEnvelopeDto } from './envelopes.service';
import { WalletAddress } from '../auth/decorators/wallet-address.decorator';
import { Public } from '../auth/decorators/public.decorator';

@Controller('api/envelopes')
export class EnvelopesController {
  constructor(private readonly envelopesService: EnvelopesService) {}

  @Post()
  async createEnvelope(
    @WalletAddress() walletAddress: string,
    @Body() dto: CreateEnvelopeDto
  ) {
    const creatorId = walletAddress;
    return await this.envelopesService.create(creatorId, dto);
  }

  @Get()
  async getEnvelopes(
    @WalletAddress() walletAddress: string,
  ) {
    const userId = walletAddress;
    const envelopes = await this.envelopesService.findAllForUser(userId);
    return { envelopes };
  }

  @Get(':id')
  async getEnvelope(@Param('id') id: string) {
    const envelope = await this.envelopesService.findOne(id);
    return { envelope };
  }

  /**
   * Public read for a shared link. A recipient has to see what they were sent
   * before they can decide to create a wallet and claim it, and they have no
   * session until they do.
   */
  @Public()
  @Throttle({ short: { ttl: 60_000, limit: 30 } })
  @Get(':id/preview')
  async getEnvelopePreview(@Param('id') id: string) {
    const envelope = await this.envelopesService.getPublicPreview(id);
    return { envelope };
  }

  @Post(':id/cancel')
  async cancelEnvelope(
    @Param('id') id: string,
    @WalletAddress() walletAddress: string,
  ) {
    const creatorId = walletAddress;
    return await this.envelopesService.cancelEnvelope(id, creatorId);
  }

  @Throttle({ short: { ttl: 10_000, limit: 5 } })
  @Post(':id/claim')
  async claimEnvelope(
    @Param('id') id: string,
    @WalletAddress() walletAddress: string,
  ) {
    const claimerAddress = walletAddress;
    return await this.envelopesService.claimEnvelope(id, claimerAddress);
  }

  private extractUserFromAuth(authHeader?: string): string {
    if (!authHeader?.startsWith('Bearer ')) return '';
    try {
      const jwt = require('jsonwebtoken');
      const token = authHeader.slice(7);
      const decoded = jwt.decode(token) as any;
      return decoded?.userId || decoded?.walletAddress || '';
    } catch {
      return '';
    }
  }

  @Get(':id/claims')
  async getEnvelopeClaims(@Param('id') id: string) {
    const claims = await this.envelopesService.getClaims(id);
    return { claims };
  }

  @Post(':id/share')
  async getSharePayload(@Param('id') id: string) {
    return this.envelopesService.getSharePayload(id);
  }
}
