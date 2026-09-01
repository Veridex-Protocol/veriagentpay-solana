import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AdminRole } from '@prisma/client';
import { AdminRolesGuard } from '../guards/admin-roles.guard';
import { Roles } from '../decorators/roles.decorator';
import { CallPolicyService } from '../../call-policy/call-policy.service';
import { Public } from '../../auth/decorators/public.decorator';

/**
 * Manages which contracts a user's session key may reach.
 *
 * SUPER_ADMIN only, including the read. The list is a map of what a wallet can
 * be persuaded to authorize, which is reconnaissance for anyone planning to
 * abuse it, and there is no operational reason for other roles to see it.
 *
 * Nothing here changes any user's wallet. `setVaultCallPolicy` is `onlyVault`
 * and `PayVault` refuses every non-passkey path to the spending module, so a
 * change made here only alters what the owner is offered the next time they
 * re-authorize with their passkey.
 */
@Public()
@Controller('api/admin/call-policy')
@UseGuards(AdminRolesGuard)
export class AdminCallPolicyController {
  constructor(private readonly callPolicy: CallPolicyService) {}

  @Get()
  @Roles(AdminRole.SUPER_ADMIN)
  async list() {
    return this.callPolicy.list();
  }

  @Post()
  @Roles(AdminRole.SUPER_ADMIN)
  async upsert(
    @Body() body: { label: string; target: string; signature: string; allowed?: boolean },
    @Req() req: any,
  ) {
    return this.callPolicy.upsert(body, req.admin);
  }

  @Post('seed')
  @Roles(AdminRole.SUPER_ADMIN)
  async seed(@Req() req: any) {
    return this.callPolicy.seedFromBuiltIn(req.admin);
  }

  @Delete(':id')
  @Roles(AdminRole.SUPER_ADMIN)
  async revoke(@Param('id') id: string, @Req() req: any) {
    return this.callPolicy.revoke(id, req.admin);
  }
}
