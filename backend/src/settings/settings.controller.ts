import { Controller, Get, Patch, Body, UnauthorizedException } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { CurrentUserId } from '../auth/decorators/wallet-address.decorator';

export interface SecuritySettingsDto {
  requireBiometricsAlways?: boolean;
}

export interface NotificationPrefsDto {
  pushAlerts?: boolean;
  telegramBot?: boolean;
  yieldAlerts?: boolean;
}

@Controller('api/settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get('security')
  async getSecuritySettings(@CurrentUserId() userId: string) {
    return this.settingsService.getSecuritySettings(userId);
  }

  @Patch('security')
  async updateSecuritySettings(
    @CurrentUserId() userId: string,
    @Body() dto: SecuritySettingsDto,
  ) {
    return this.settingsService.updateSecuritySettings(userId, dto);
  }

  @Get('notifications')
  async getNotificationPrefs(@CurrentUserId() userId: string) {
    return this.settingsService.getNotificationPrefs(userId);
  }

  @Patch('notifications')
  async updateNotificationPrefs(
    @CurrentUserId() userId: string,
    @Body() dto: NotificationPrefsDto,
  ) {
    return this.settingsService.updateNotificationPrefs(userId, dto);
  }
}
