import { Controller, Get, Post, Body, UseGuards, Request, UnauthorizedException } from '@nestjs/common';
import { VaultService } from './vault.service';
import { RelayerService } from '../relayer/relayer.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('api/vaults')
@UseGuards(JwtAuthGuard)
export class VaultController {
  constructor(
    private readonly vaultService: VaultService,
    private readonly relayerService: RelayerService,
  ) {}

  @Get()
  async listVaults(@Request() req: any) {
    const apy = await this.vaultService.getVerifiedAPY();
    const agentVaultAddress = process.env.AGENT_VAULT_ADDRESS || '0x3333333333333333333333333333333333333333';

    // Return vault information
    return {
      vaults: [
        {
          id: 'agent-vault-usdc',
          name: 'VeriAgent USDC Vault',
          symbol: 'vaUSDC',
          token: 'USDC',
          address: agentVaultAddress,
          apy: apy.apy,
          lastUpdated: apy.lastUpdated,
          tvl: '0', // TODO: Fetch from contract
          userBalance: '0', // TODO: Fetch user's vault shares
        },
      ],
    };
  }

  @Post('deposit')
  async depositVault(@Request() req: any, @Body() body: { vaultId: string; amount: number }) {
    const { vaultId, amount } = body;
    const userId = req.user?.sub || req.user?.userId;

    if (!userId) {
      throw new UnauthorizedException('Authentication required');
    }

    return await this.vaultService.deposit(userId, vaultId || 'agent-vault-usdc', amount);
  }

  @Post('withdraw')
  async withdrawVault(@Request() req: any, @Body() body: { vaultId: string; amount: number }) {
    const { vaultId, amount } = body;
    const userId = req.user?.sub || req.user?.userId;

    if (!userId) {
      throw new UnauthorizedException('Authentication required');
    }

    return await this.vaultService.withdraw(userId, vaultId || 'agent-vault-usdc', amount);
  }
}
