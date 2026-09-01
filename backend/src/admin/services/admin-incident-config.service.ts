import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminAuditService } from '../admin-audit.service';

@Injectable()
export class AdminIncidentConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AdminAuditService,
  ) {}

  async freezeAccount(userId: string, reason: string, admin: { id: string; email: string }) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Target user account not found');

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { status: UserStatus.BLACKLISTED },
    });

    // Revoke all session keys
    await this.prisma.sessionKey.updateMany({
      where: { userId },
      data: { revokedAt: new Date() },
    });

    await this.auditService.logAction({
      adminId: admin.id,
      adminEmail: admin.email,
      action: 'FREEZE_ACCOUNT',
      target: userId,
      details: { reason, revokedSessionKeys: true },
    });

    return {
      success: true,
      message: `User ${user.email || userId} frozen successfully and active session keys revoked.`,
      user: updated,
    };
  }

  async pauseFeature(featureKey: string, paused: boolean, reason: string, admin: { id: string; email: string }) {
    const configKey = `PAUSE_FEATURE_${featureKey.toUpperCase()}`;

    await this.prisma.globalConfig.upsert({
      where: { key: configKey },
      update: { value: { paused, reason, pausedAt: new Date() }, updatedBy: admin.email },
      create: { key: configKey, value: { paused, reason, pausedAt: new Date() }, updatedBy: admin.email },
    });

    await this.auditService.logAction({
      adminId: admin.id,
      adminEmail: admin.email,
      action: paused ? 'PAUSE_FEATURE' : 'RESUME_FEATURE',
      target: featureKey,
      details: { paused, reason },
    });

    return {
      success: true,
      featureKey,
      paused,
      message: `Feature ${featureKey} has been ${paused ? 'PAUSED' : 'RESUMED'}.`,
    };
  }

  async revokeSessionKeys(userId: string, admin: { id: string; email: string }) {
    const result = await this.prisma.sessionKey.updateMany({
      where: { userId },
      data: { revokedAt: new Date() },
    });

    await this.auditService.logAction({
      adminId: admin.id,
      adminEmail: admin.email,
      action: 'REVOKE_ALL_SESSION_KEYS',
      target: userId,
      details: { revokedCount: result.count },
    });

    return {
      success: true,
      userId,
      revokedCount: result.count,
    };
  }

  async getConfig() {
    const dbConfigs = await this.prisma.globalConfig.findMany();
    const configMap: Record<string, any> = {};
    for (const c of dbConfigs) {
      configMap[c.key] = c.value;
    }

    return {
      environment: process.env.NODE_ENV || 'production',
      rpcUrl: process.env.BOTCHAIN_RPC_URL || 'https://rpc.bohr.life/',
      chainId: Number(process.env.BOTCHAIN_CHAIN_ID) || 968,
      relayerMinBalanceEth: process.env.RELAYER_MIN_BALANCE_ETH || '0.5',
      feeConfigAddress: process.env.FEE_CONFIG_ADDRESS || '0x62537c5a77E66d13244673f5A145dC6495bAE9CC',
      vaultV2Address: process.env.AGENT_VAULT_V2_ADDRESS || '0xfcb19B17DC64f5925B377e6C8ccD24dCb54F4fe8',
      featureFlags: configMap,
    };
  }

  async updateConfig(key: string, value: any, admin: { id: string; email: string }) {
    if (!key) throw new BadRequestException('Config key required');

    const updated = await this.prisma.globalConfig.upsert({
      where: { key },
      update: { value, updatedBy: admin.email },
      create: { key, value, updatedBy: admin.email },
    });

    await this.auditService.logAction({
      adminId: admin.id,
      adminEmail: admin.email,
      action: 'UPDATE_GLOBAL_CONFIG',
      target: key,
      details: { value },
    });

    return updated;
  }
}
