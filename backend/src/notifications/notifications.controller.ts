import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Body,
  Query,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { CurrentUserId } from '../auth/decorators/wallet-address.decorator';

@Controller('api/notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  async getNotifications(
    @CurrentUserId() userId: string,
    @Query('read') read?: string,
    @Query('limit') limit?: string,
    @Query('page') page?: string
  ) {
    const isRead = read !== undefined ? read === 'true' : undefined;
    const pageNum = parseInt(page || '1', 10);
    const limitNum = parseInt(limit || '20', 10);

    const notifications = await this.notificationsService.findAllForUser(userId, {
      read: isRead,
      limit: limitNum,
      page: pageNum,
    });

    return { notifications };
  }

  @Get('unread-count')
  async getUnreadCount(@CurrentUserId() userId: string) {
    const count = await this.notificationsService.getUnreadCount(userId);
    return { count };
  }

  @Get('preferences')
  async getPreferences(@CurrentUserId() userId: string) {
    const preferences = await this.notificationsService.getUserPreferences(userId);
    return { preferences };
  }

  @Post('preferences')
  async updatePreferences(
    @CurrentUserId() userId: string,
    @Body() body: any
  ) {
    const preferences = await this.notificationsService.updateUserPreferences(userId, body);
    return { success: true, preferences };
  }

  @Patch(':id/read')
  async markRead(
    @Param('id') id: string,
    @CurrentUserId() userId: string
  ) {
    await this.notificationsService.markAsRead(id, userId);
    return { success: true };
  }

  @Patch('read-all')
  async markAllRead(@CurrentUserId() userId: string) {
    await this.notificationsService.markAllAsRead(userId);
    return { success: true };
  }

}
