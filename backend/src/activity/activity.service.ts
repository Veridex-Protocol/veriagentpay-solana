import { Injectable, Logger, Inject, Optional, forwardRef } from '@nestjs/common';
import { Prisma, UserActivityAction } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { IDENTITY_SERVICE, type HandleResolver } from '../common/service-contracts';

export interface RecordActivityInput {
  userIdentifier: string;
  action: UserActivityAction;
  amount?: number;
  token?: string;
  txHash?: string;
  metadata?: Prisma.InputJsonValue;
}

@Injectable()
export class ActivityService {
  private readonly logger = new Logger(ActivityService.name);

  constructor(
    private readonly prisma: PrismaService,
    // Token, not class: importing `IdentityService` here — which imports this
    // file back — is a module cycle `forwardRef` cannot break.
    @Optional() @Inject(IDENTITY_SERVICE) private readonly identityService?: HandleResolver,
  ) {}

  async record(input: RecordActivityInput): Promise<void> {
    const user = await this.resolveUser(input.userIdentifier);
    if (!user) {
      this.logger.warn(`Activity skipped: user not found for ${input.userIdentifier}`);
      return;
    }

    const metadata = await this.enrichMetadataWithHandles(input.metadata);

    try {
      await this.prisma.userActivityLog.create({
        data: {
          userId: user.id,
          action: input.action,
          amount: input.amount,
          token: input.token?.toUpperCase(),
          txHash: input.txHash,
          metadata,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to record ${input.action} for ${user.id}: ${message}`);
    }
  }

  private async enrichMetadataWithHandles(metadata: Prisma.InputJsonValue | undefined): Promise<Prisma.InputJsonValue | undefined> {
    if (!metadata || typeof metadata !== 'object' || !this.identityService) return metadata;
    const data = metadata as Record<string, any>;

    try {
      if (data.recipient && typeof data.recipient === 'string' && data.recipient.startsWith('0x') && data.recipient.length === 42) {
        const handle = await this.identityService.getHandleForAddress(data.recipient);
        if (handle) data.recipientHandle = handle;
      }
      if (data.to && typeof data.to === 'string' && data.to.startsWith('0x') && data.to.length === 42 && !data.recipientHandle) {
        const handle = await this.identityService.getHandleForAddress(data.to);
        if (handle) data.recipientHandle = handle;
      }
      if (data.from && typeof data.from === 'string' && data.from.startsWith('0x') && data.from.length === 42) {
        const handle = await this.identityService.getHandleForAddress(data.from);
        if (handle) data.senderHandle = handle;
      }
    } catch {
      // Non-critical enrichment — don't fail the activity log
    }

    return data as Prisma.InputJsonValue;
  }

  async getUserActivity(userIdentifier: string, limit = 10) {
    const user = await this.resolveUser(userIdentifier);
    if (!user) return [];

    return this.prisma.userActivityLog.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  private async resolveUser(identifier: string) {
    return this.prisma.user.findFirst({
      where: {
        OR: [
          { id: identifier },
          { email: { equals: identifier, mode: 'insensitive' } },
          { username: identifier },
          { telegramId: identifier },
          { whatsappId: identifier },
          { slackId: identifier },
          { discordId: identifier },
          { smartWallet: { address: { equals: identifier, mode: 'insensitive' } } },
          { socialNodes: { some: { username: identifier } } },
        ],
      },
      select: { id: true },
    });
  }
}
