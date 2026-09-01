import { Controller, Get, Post, Delete, Body, Param, Logger } from '@nestjs/common';
import { AccountService, PlatformType } from './account.service';
import { WalletAddress } from '../auth/decorators/wallet-address.decorator';

/**
 * Social account linking.
 *
 * Identity comes from the verified access token. Previously each handler read
 * an `x-wallet-address` header and, when it was absent, fell back to a
 * hardcoded address (`0x71C7…976F`, the well-known Hardhat test account) — so
 * an unauthenticated request linked and unlinked platform accounts against that
 * fixed identity.
 *
 * The `console.log(headers)` calls were also removed: they wrote the full
 * request headers, including `Authorization`, into application logs.
 *
 * @see docs/audit/11th-august-2026-1.md — SEC-010, SEC-043
 */
@Controller('api/account')
export class AccountController {
  private readonly logger = new Logger(AccountController.name);

  constructor(private readonly accountService: AccountService) {}

  @Post('link')
  async requestLink(
    @WalletAddress() walletAddress: string,
    @Body() body: { platform: PlatformType; username?: string }
  ) {
    this.logger.debug(`requestLink platform=${body.platform}`);
    // `username` only selects where the code is delivered. It never decides
    // which account gets linked — that comes from whoever redeems the code.
    return await this.accountService.requestLink(walletAddress, body.platform, body.username);
  }

  @Post('verify')
  async verifyCode(
    @WalletAddress() walletAddress: string,
    @Body() body: { platform: PlatformType; code: string; username?: string }
  ) {
    this.logger.debug(`verifyCode platform=${body.platform}`);
    return await this.accountService.verifyCode(
      walletAddress,
      body.platform,
      body.code,
      undefined,
      body.username,
    );
  }

  @Get('links')
  async getLinkedAccounts(@WalletAddress() walletAddress: string) {
    const links = await this.accountService.getLinkedAccounts(walletAddress);
    return { links };
  }

  @Delete('unlink/:platform')
  async unlinkPlatform(
    @Param('platform') platform: PlatformType,
    @WalletAddress() walletAddress: string
  ) {
    this.logger.debug(`unlinkPlatform platform=${platform}`);
    return await this.accountService.unlinkPlatform(walletAddress, platform);
  }
}
