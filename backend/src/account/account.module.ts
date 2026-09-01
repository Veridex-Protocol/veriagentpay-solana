import { Module, forwardRef } from '@nestjs/common';
import { AccountService } from './account.service';
import { AccountController } from './account.controller';
import { IdentityModule } from '../identity/identity.module';
import { PlatformModule } from '../platform/platform.module';
import { CoreModule } from '../core/core.module';

@Module({
  // PlatformModule supplies the Telegram driver used to deliver a link OTP to
  // the account being connected; CoreModule supplies Redis, which binds that
  // OTP to the chat it was sent to.
  imports: [forwardRef(() => IdentityModule), forwardRef(() => PlatformModule), CoreModule],
  controllers: [AccountController],
  providers: [AccountService],
  exports: [AccountService],
})
export class AccountModule {}
