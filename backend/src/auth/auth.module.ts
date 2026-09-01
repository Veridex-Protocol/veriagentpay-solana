import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { DiscordOAuthService } from './discord-oauth.service';
import { SlackOAuthService } from './slack-oauth.service';
import { CoreModule } from '../core/core.module';
import { OAuthStateService } from './oauth-state.service';

@Module({
  imports: [CoreModule],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, DiscordOAuthService, SlackOAuthService, OAuthStateService],
  exports: [AuthService, JwtAuthGuard, DiscordOAuthService, SlackOAuthService],
})
export class AuthModule {}
