import { Controller, Get, Post, Delete, Body, Param, UseGuards, BadRequestException } from '@nestjs/common';
import { SubscriptionService } from './subscription.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUserId } from '../auth/decorators/wallet-address.decorator';

@Controller('api/subscriptions')
@UseGuards(JwtAuthGuard)
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  @Get()
  async listSubscriptions(@CurrentUserId() userId: string) {

    const subscriptions = await this.subscriptionService.getUserSubscriptions(userId);

    return {
      subscriptions,
    };
  }

  @Post()
  async createSubscription(
    @CurrentUserId() userId: string,
    @Body() body: { to: string; token: string; amount: number; frequency: string }
  ) {
    const { to, token, amount, frequency } = body;

    if (!to || !token || !amount || !frequency) {
      throw new BadRequestException('Missing required fields: to, token, amount, frequency');
    }

    // Parse frequency (e.g., "30" or "monthly" -> 30 days)
    let intervalDays = 30;
    if (frequency === 'weekly') {
      intervalDays = 7;
    } else if (frequency === 'monthly') {
      intervalDays = 30;
    } else if (!isNaN(Number(frequency))) {
      intervalDays = Number(frequency);
    }

    const subscription = await this.subscriptionService.createSubscription(
      userId,
      to, // recipient address or handle
      to, // recipient handle
      amount,
      intervalDays
    );

    return {
      subId: subscription.id,
      subscription,
    };
  }

  @Delete(':id')
  async deleteSubscription(@CurrentUserId() userId: string, @Param('id') id: string) {
    await this.subscriptionService.cancelSubscription(userId, id);

    return {
      success: true,
    };
  }
}
