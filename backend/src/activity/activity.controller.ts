import { Controller, Get, Req, UseGuards, NotFoundException, Query } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { getAppBaseUrl } from '../config/app-url.config';

@Controller('api/activity')
@UseGuards(JwtAuthGuard)
export class ActivityController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * One sender-centric feed for direct transfers and social-payment escrows.
   *
   * Direct sends settle immediately and live in UserActivityLog. Sends to an
   * unregistered handle live in ShortLink until that person joins and claims.
   * Keeping the merge server-side gives every web client the same status and
   * avoids presenting escrow funding transactions as completed recipient
   * transfers.
   */
  @Get('sent-payments')
  async getSentPayments(
    @Req() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    const userId = req.user.userId;
    const pageNum = Math.max(1, parseInt(page || '1', 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit || '20', 10) || 20));

    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { id: userId },
          { smartWallet: { address: { equals: userId, mode: 'insensitive' } } },
        ],
      },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('User profile not found');

    const [sendLogs, claimLinks] = await Promise.all([
      this.prisma.userActivityLog.findMany({
        where: { userId: user.id, action: 'TRANSFER_SENT' },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.shortLink.findMany({
        where: { senderUserId: user.id, kind: 'pay' },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    // Generic relayer execution logs exist alongside the richer payment log.
    // Keep one row per transaction and prefer the entry that identifies who
    // was paid; approval/config transactions have no recipient and are not
    // themselves payments.
    const directByTransaction = new Map<string, (typeof sendLogs)[number]>();
    for (const log of sendLogs) {
      const meta = (log.metadata as Record<string, any> | null) ?? {};
      const hasCounterparty = Boolean(
        meta.recipient || meta.recipientHandle || meta.to || meta.counterparty || meta.paymentRequestId,
      );
      if (!hasCounterparty) continue;

      const key = log.txHash || log.id;
      const existing = directByTransaction.get(key);
      if (!existing) {
        directByTransaction.set(key, log);
        continue;
      }

      const existingMeta = (existing.metadata as Record<string, any> | null) ?? {};
      const score = Object.keys(meta).length + (meta.recipient || meta.recipientHandle ? 5 : 0);
      const existingScore = Object.keys(existingMeta).length + (existingMeta.recipient || existingMeta.recipientHandle ? 5 : 0);
      if (score > existingScore) directByTransaction.set(key, log);
    }

    const counterpartyIds = Array.from(directByTransaction.values())
      .map((log) => ((log.metadata as Record<string, any> | null) ?? {}).counterparty)
      .filter((value): value is string => typeof value === 'string');
    const counterparties = counterpartyIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: counterpartyIds } },
          select: { id: true, username: true, socialNodes: { select: { username: true } } },
        })
      : [];
    const counterpartyNames = new Map(
      counterparties.map((item) => [
        item.id,
        item.username || item.socialNodes.find((node) => node.username)?.username || null,
      ]),
    );

    const directPayments = Array.from(directByTransaction.values()).map((log) => {
      const meta = (log.metadata as Record<string, any> | null) ?? {};
      const knownName = meta.counterparty ? counterpartyNames.get(meta.counterparty) : null;
      const recipient = meta.recipientHandle || meta.recipient || knownName || meta.to || 'Recipient';
      return {
        id: `direct:${log.id}`,
        kind: 'DIRECT' as const,
        recipient: String(recipient).startsWith('@') || String(recipient).startsWith('0x')
          ? String(recipient)
          : `@${recipient}`,
        recipientRegistered: true,
        channel: meta.platform || (meta.paymentRequestId ? 'request' : 'payment'),
        amount: log.amount ? Number(log.amount) : null,
        token: log.token || 'USDC',
        status: 'COMPLETED' as const,
        createdAt: log.createdAt,
        completedAt: log.createdAt,
        txHash: log.txHash,
        claimTxHash: null,
        code: null,
        claimUrl: null,
        expiresAt: null,
        cancellable: false,
      };
    });

    const now = Date.now();
    const baseUrl = getAppBaseUrl().replace(/\/$/, '');
    const escrowPayments = claimLinks.map((link) => {
      const expired = Boolean(link.expiresAt && link.expiresAt.getTime() < now);
      const paymentStatus = link.status === 'ACTIVE'
        ? (expired ? 'EXPIRED' : 'AWAITING_CLAIM')
        : link.status;
      const recipient = link.targetUserId || 'Anyone with the link';

      return {
        id: `claim:${link.id}`,
        kind: 'CLAIM_LINK' as const,
        recipient: recipient.startsWith('@') ? recipient : `@${recipient}`,
        recipientRegistered: Boolean(link.toAddress),
        channel: link.platform || 'link',
        amount: link.amount,
        token: link.token || 'USDC',
        status: paymentStatus,
        createdAt: link.createdAt,
        completedAt: link.claimedAt,
        txHash: link.fundingTxHash,
        claimTxHash: link.claimTxHash,
        code: link.code,
        claimUrl: `${baseUrl}/c/${link.code}`,
        expiresAt: link.expiresAt,
        cancellable: link.status === 'ACTIVE' && !expired,
      };
    });

    const allPayments = [...directPayments, ...escrowPayments].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
    const normalizedStatus = (status || 'all').toUpperCase();
    const visible = normalizedStatus === 'ALL'
      ? allPayments
      : allPayments.filter((payment) => payment.status === normalizedStatus);
    const offset = (pageNum - 1) * limitNum;

    return {
      success: true,
      page: pageNum,
      limit: limitNum,
      totalCount: visible.length,
      totalPages: Math.max(1, Math.ceil(visible.length / limitNum)),
      summary: {
        total: allPayments.length,
        completed: allPayments.filter((payment) => payment.status === 'COMPLETED').length,
        awaitingClaim: allPayments.filter((payment) => payment.status === 'AWAITING_CLAIM').length,
        claimed: allPayments.filter((payment) => payment.status === 'CLAIMED').length,
        cancelled: allPayments.filter((payment) => payment.status === 'CANCELLED').length,
        expired: allPayments.filter((payment) => payment.status === 'EXPIRED').length,
      },
      payments: visible.slice(offset, offset + limitNum),
    };
  }

  @Get()
  async getUserActivity(
    @Req() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string
  ) {
    const userId = req.user.userId;
    const pageNum = parseInt(page || '1', 10);
    const limitNum = parseInt(limit || '20', 10);
    const skip = (pageNum - 1) * limitNum;

    // Resolve user to ensure it exists and get DB UUID if userId is walletAddress fallback
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { id: userId },
          { smartWallet: { address: { equals: userId, mode: 'insensitive' } } },
        ],
      },
    });

    if (!user) {
      throw new NotFoundException('User profile not found');
    }

    const [logs, totalCount] = await Promise.all([
      this.prisma.userActivityLog.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
      this.prisma.userActivityLog.count({
        where: { userId: user.id },
      }),
    ]);

    const explorer = process.env.EXPLORER_URL || 'https://scan.bohr.life';

    return {
      success: true,
      page: pageNum,
      limit: limitNum,
      totalCount,
      totalPages: Math.ceil(totalCount / limitNum),
      activities: logs.map(log => {
        const meta = log.metadata as Record<string, any> | null ?? {};
        const isSend = log.action.includes('SENT') || log.action.includes('WITHDRAW');
        const isDeposit = log.action === 'DEPOSIT_RECEIVED';

        // For external deposits the counterparty is the external sender, not a
        // VeriAgent handle. Use senderHandle if identity-resolved, else the raw
        // address in short form, else fall back to generic labels.
        let counterparty: string;
        if (isDeposit) {
          counterparty = meta.senderHandle
            || (meta.from ? `${meta.from.slice(0, 6)}…${meta.from.slice(-4)}` : 'External wallet');
        } else {
          counterparty = meta.recipientHandle || meta.recipient || (isSend ? 'Recipient' : 'Sender');
        }

        return {
          id: log.id,
          activity: log.action.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          recipient: counterparty,
          amount: log.amount
            ? `${isSend ? '-' : '+'}$${parseFloat(log.amount.toString()).toFixed(2)} ${log.token || 'USDC'}`
            : 'N/A',
          status: 'Completed',
          time: this.formatTimeAgo(log.createdAt),
          type: isSend ? 'sent' : 'received',
          txHash: log.txHash ?? null,
          explorerUrl: log.txHash ? `${explorer}/tx/${log.txHash}` : null,
          external: isDeposit && (meta.external ?? false),
        };
      }),
    };
  }

  private formatTimeAgo(date: Date): string {
    const seconds = Math.floor((new Date().getTime() - new Date(date).getTime()) / 1000);
    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days === 1) return 'Yesterday';
    return `${days} days ago`;
  }
}
