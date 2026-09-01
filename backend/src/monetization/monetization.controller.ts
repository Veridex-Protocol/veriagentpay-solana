import { Controller, Get, Post, Body } from '@nestjs/common';
import { MonetizationEngineService, RevenueCollectionResult } from './monetization-engine.service';

@Controller('api/monetization')
export class MonetizationController {
  constructor(private readonly monetizationService: MonetizationEngineService) {}

  @Get('summary')
  async getSummary() {
    return await this.monetizationService.getRevenueSummary();
  }

  @Post('collect')
  async collectRevenue(
    @Body() body: {
      source: 'VAULT_PERFORMANCE_FEE' | 'FIAT_RAMP_MARGIN' | 'SUBSCRIPTION_FEE' | 'MERCHANT_PROCESSING' | 'GROUP_LENDING_FEE';
      amountUSDC: number;
      userId?: string;
      metadata?: Record<string, any>;
    }
  ): Promise<RevenueCollectionResult> {
    return await this.monetizationService.collectRevenue(
      body.source,
      body.amountUSDC,
      body.userId,
      body.metadata
    );
  }
}
