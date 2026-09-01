import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Headers,
  Query,
} from '@nestjs/common';
import { RequestsService, CreateRequestDto } from './requests.service';
import { WalletAddress } from '../auth/decorators/wallet-address.decorator';

@Controller('api/requests')
export class RequestsController {
  constructor(private readonly requestsService: RequestsService) {}

  @Post()
  async createRequest(
    @WalletAddress() walletAddress: string,
    @Body() dto: CreateRequestDto
  ) {
    const requesterId = walletAddress;
    const request = await this.requestsService.create(requesterId, dto);
    return { success: true, request };
  }

  @Get()
  async getRequests(
    @WalletAddress() walletAddress: string,
    @Query('filter') filter?: 'sent' | 'received' | 'all',
    @Query('status') status?: string
  ) {
    const userId = walletAddress;
    const requests = await this.requestsService.findAllForUser(userId, filter, status);
    return { requests };
  }

  @Get(':id')
  async getRequest(@Param('id') id: string) {
    const request = await this.requestsService.findOne(id);
    return { request };
  }

  @Post(':id/pay')
  async payRequest(
    @Param('id') id: string,
    @WalletAddress() walletAddress: string
  ) {
    const userId = walletAddress;
    return await this.requestsService.payRequest(id, userId);
  }

  @Post(':id/cancel')
  async cancelRequest(
    @Param('id') id: string,
    @WalletAddress() walletAddress: string
  ) {
    const userId = walletAddress;
    return await this.requestsService.cancelRequest(id, userId);
  }

  @Post(':id/remind')
  async remindRequest(
    @Param('id') id: string,
    @WalletAddress() walletAddress: string
  ) {
    const userId = walletAddress;
    return await this.requestsService.remindRequest(id, userId);
  }
}
