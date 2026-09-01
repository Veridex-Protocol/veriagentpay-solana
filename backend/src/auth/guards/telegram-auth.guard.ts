import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, ServiceUnavailableException } from '@nestjs/common';
import { IdentityService } from '../../identity/identity.service';

@Injectable()
export class TelegramAuthGuard implements CanActivate {
  constructor(private readonly identityService: IdentityService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) throw new ServiceUnavailableException('Telegram authentication is not configured');
    const initData = req.headers['x-telegram-init-data'];
    if (!initData) throw new UnauthorizedException('Missing x-telegram-init-data header');

    const isValid = this.identityService.validateTelegramInitData(initData.toString(), botToken);
    if (!isValid) {
      throw new UnauthorizedException('Invalid Telegram initData signature');
    }

    return true;
  }
}
