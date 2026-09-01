import { Inject, Injectable, NotFoundException, BadRequestException, ForbiddenException, ConflictException, Logger } from '@nestjs/common';
import { RequestStatus, NotificationType, UserActivityAction } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NOTIFICATIONS_STORE, type NotificationStore } from '../common/service-contracts';
import { RelayerService } from '../relayer/relayer.service';
import { ActivityService } from '../activity/activity.service';
import { getAppBaseUrl } from '../config/app-url.config';
import { IdentityService } from '../identity/identity.service';
import { forwardRef } from '@nestjs/common';
import { createBotChainProvider } from '../common/rpc-provider.helper';

export interface CreateRequestDto {
  recipientIdentifier: string;
  token: string;
  amount: number;
  note?: string;
  expiresInDays?: number;
}

@Injectable()
export class RequestsService {
  private readonly logger = new Logger(RequestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(NOTIFICATIONS_STORE)
    private readonly notificationsService: NotificationStore,
    @Inject(forwardRef(() => RelayerService))
    private readonly relayerService: RelayerService,
    @Inject(forwardRef(() => ActivityService))
    private readonly activityService: ActivityService,
    @Inject(forwardRef(() => IdentityService))
    private readonly identityService?: IdentityService,
  ) { }

  async create(requesterIdOrAddress: string, dto: CreateRequestDto) {
    if (!dto.recipientIdentifier || !dto.recipientIdentifier.trim()) {
      throw new BadRequestException('Recipient identifier is required');
    }
    if (!dto.amount || dto.amount <= 0) {
      throw new BadRequestException('Amount must be greater than 0');
    }

    const token = (dto.token || 'USDC').toUpperCase();
    const expiresAt = dto.expiresInDays
      ? new Date(Date.now() + dto.expiresInDays * 24 * 60 * 60 * 1000)
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days default

    // Resolve requester User.id from wallet address if needed
    let requesterId: string = requesterIdOrAddress;
    if (requesterIdOrAddress.startsWith('0x')) {
      const requesterUser = await this.prisma.user.findFirst({
        where: { smartWallet: { address: requesterIdOrAddress } },
      });
      if (requesterUser) {
        requesterId = requesterUser.id;
      } else {
        this.logger.warn(`[CreateRequest] Requester with wallet ${requesterIdOrAddress} not found in database`);
        throw new BadRequestException('Requester user not found');
      }
    }

    // Try resolving recipientId if user exists
    let recipientUserId: string | null = null;
    let recipientId: string | null = null; // Can be wallet address or user ID for backward compatibility

    // First, try using the identity service
    if (this.identityService) {
      try {
        recipientId = await this.identityService.resolveContact('web', dto.recipientIdentifier);

        // If we got a wallet address or user ID, also get the User.id for notifications
        if (recipientId) {
          const recipientUser = await this.prisma.user.findFirst({
            where: {
              OR: [
                { id: recipientId },
                { smartWallet: { address: recipientId } },
              ],
            },
          });
          if (recipientUser) {
            recipientUserId = recipientUser.id;
          }
        }
      } catch (e) {
        // Fallback if user is not registered yet
      }
    }

    // If identity service didn't find the user, try direct lookup
    if (!recipientId) {
      try {
        const cleanHandle = dto.recipientIdentifier.replace(/^@/, '').trim();
        const recipientUser = await this.prisma.user.findFirst({
          where: {
            OR: [
              { username: cleanHandle },
              { telegramId: cleanHandle },
              { whatsappId: dto.recipientIdentifier },
              { discordId: cleanHandle },
              { smartWallet: { address: dto.recipientIdentifier } },
            ],
          },
          include: { smartWallet: true },
        });
        if (recipientUser) {
          recipientUserId = recipientUser.id; // Always store User.id for notifications
          recipientId = recipientUser.smartWallet?.address || recipientUser.id;
        }
      } catch (e) {
        // Recipient resolution fallback
      }
    }

    let request: any;
    try {
      request = await this.prisma.paymentRequest.create({
        data: {
          requesterId, // Now guaranteed to be User.id
          recipientId,
          recipientIdentifier: dto.recipientIdentifier.trim(),
          token,
          amount: dto.amount,
          note: dto.note || null,
          status: RequestStatus.PENDING,
          expiresAt,
        },
      });
    } catch (e: any) {
      this.logger.error(`[CreateRequest] Failed to create payment request: ${e.message}`);
      // In-memory fallback
      request = {
        id: `req-${Date.now()}`,
        requesterId,
        recipientId,
        recipientIdentifier: dto.recipientIdentifier.trim(),
        token,
        amount: dto.amount,
        note: dto.note || null,
        status: RequestStatus.PENDING,
        createdAt: new Date(),
        expiresAt,
      };
    }

    // Trigger Notification to recipient if recipient user is identified
    // Only send notification if we have a valid User.id
    if (recipientUserId) {
      try {
        await this.notificationsService.create({
          userId: recipientUserId, // Use User.id, not wallet address
          type: NotificationType.SPLIT_REQUEST,
          title: 'Payment Requested 💳',
          body: `You have a pending request for ${dto.amount} ${token}`,
          data: { requestId: request.id, deepLink: `${getAppBaseUrl()}/requests/${request.id}` },
        });
      } catch (e: any) {
        this.logger.warn(`[CreateRequest] Failed to create notification for recipient ${recipientUserId}: ${e.message}`);
      }
    }

    await this.activityService?.record({
      userIdentifier: requesterId,
      action: UserActivityAction.REQUEST_CREATED,
      amount: dto.amount,
      token,
      metadata: { requestId: request.id, recipientIdentifier: dto.recipientIdentifier },
    }).catch(() => {});

    return request;
  }

  async findAllForUser(userIdOrAddress: string, filter: 'sent' | 'received' | 'all' = 'all', status?: string) {
    // Resolve wallet address to user ID if needed
    let userId = userIdOrAddress;
    let walletAddress: string | undefined;

    try {
      // If it looks like an address (0x...), find the user
      if (userIdOrAddress.startsWith('0x')) {
        walletAddress = userIdOrAddress;
        const user = await this.prisma.user.findFirst({
          where: { smartWallet: { address: userIdOrAddress } },
          include: { smartWallet: true },
        });
        if (user) {
          userId = user.id;
        }
      }

      const statusFilter = status ? (status.toUpperCase() as RequestStatus) : undefined;

      const whereClause: any = {};
      if (filter === 'sent') {
        whereClause.requesterId = userId;
      } else if (filter === 'received') {
        whereClause.OR = [
          { recipientId: userId },
          { recipientIdentifier: userId },
          ...(walletAddress ? [{ recipientId: walletAddress }] : []),
        ];
      } else {
        whereClause.OR = [
          { requesterId: userId },
          { recipientId: userId },
          { recipientIdentifier: userId },
          ...(walletAddress ? [{ recipientId: walletAddress }] : []),
        ];
      }

      if (statusFilter) {
        whereClause.status = statusFilter;
      }

      const requests = await this.prisma.paymentRequest.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        include: {
          requester: {
            select: {
              username: true,
              smartWallet: { select: { address: true } },
            },
          },
        },
      });

      return requests;
    } catch (e: any) {
      this.logger.error(`Failed to fetch requests: ${e.message}`);
      return [];
    }
  }

  async findOne(id: string) {
    const request = await this.prisma.paymentRequest.findUnique({
      where: { id },
    });
    if (!request) {
      throw new NotFoundException('Payment request not found');
    }
    return request;
  }

  async payRequest(id: string, payerUserIdOrAddress: string) {
    const request = await this.findOne(id);
    if (request.status !== RequestStatus.PENDING) {
      throw new BadRequestException(`Cannot pay request with status: ${request.status}`);
    }

    // Resolve payer User.id from wallet address if needed
    let payerUserId: string = payerUserIdOrAddress;
    if (payerUserIdOrAddress.startsWith('0x')) {
      const payerUser = await this.prisma.user.findFirst({
        where: { smartWallet: { address: payerUserIdOrAddress } },
      });
      if (payerUser) {
        payerUserId = payerUser.id;
      } else {
        this.logger.warn(`[PayRequest] Payer with wallet ${payerUserIdOrAddress} not found in database`);
        throw new BadRequestException('Payer user not found. Please ensure you are logged in.');
      }
    }

    // Get payer and requester details
    const payer = await this.prisma.user.findUnique({
      where: { id: payerUserId },
      include: {
        smartWallet: true,
        sessionKeys: {
          where: {
            expiryAt: { gte: new Date() },
            revokedAt: null,
            activatedAt: { not: null },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!payer?.smartWallet) {
      throw new BadRequestException('Payer wallet not found');
    }

    const requester = await this.prisma.user.findUnique({
      where: { id: request.requesterId },
      include: { smartWallet: true },
    });

    if (!requester?.smartWallet) {
      throw new BadRequestException('Requester wallet not found');
    }

    // Execute actual transfer via relayer
    let txHash: string;
    try {
      // Use relayer service to execute transfer
      const { ethers } = await import('ethers');
      const decryptedKey = await this.relayerService.decryptSessionKey(payer.sessionKeys[0]);
      const sessionWallet = new ethers.Wallet(decryptedKey);
      const sessionKeyHash = ethers.keccak256(ethers.solidityPacked(['address'], [sessionWallet.address]));

      const provider = createBotChainProvider();
      let nonce = 0;
      try {
        const vaultAbi = ['function localSessionNonces(bytes32 sessionKeyHash) view returns (uint256)'];
        const vaultContract = new ethers.Contract(payer.smartWallet.address, vaultAbi, provider);
        const nonceVal = await vaultContract.localSessionNonces(sessionKeyHash);
        nonce = Number(nonceVal);
      } catch (err) {
        nonce = 0;
      }

      this.logger.log(`[PayRequest] Using on-chain nonce ${nonce} for session key ${sessionKeyHash.slice(0, 10)}...`);

      // Build ACTION_TRANSFER payload (must be exactly 97 bytes: 1 + 32 + 32 + 32)
      const { resolveToken } = await import('../config/tokens.config');
      const token = resolveToken(request.token) || resolveToken();
      if (!token) {
        throw new Error(`Token ${request.token} not supported`);
      }

      const amountWei = ethers.parseUnits(request.amount.toString(), token.decimals);

      const tokenBytes = ethers.zeroPadValue(token.address, 32);
      const recipientBytes = ethers.zeroPadValue(requester.smartWallet.address, 32);
      const amountBytes = ethers.zeroPadValue(ethers.toBeHex(amountWei), 32);
      const typeByte = Buffer.from([1]); // ACTION_TRANSFER = 1

      const actionPayload = ethers.hexlify(ethers.concat([
        typeByte,
        tokenBytes,
        recipientBytes,
        amountBytes
      ]));

      const relayerResult = await this.relayerService.executeLocalSessionAction(
        payer.id,
        payer.smartWallet.address,
        decryptedKey,
        actionPayload,
        request.amount,
        nonce
      );

      if (!relayerResult?.success || !relayerResult?.txHash) {
        throw new Error('Transfer execution failed');
      }

      txHash = relayerResult.txHash;
    } catch (err: any) {
      this.logger.error(`Payment request transfer failed: ${err.message}`);
      throw new BadRequestException(`Payment failed: ${err.message}`);
    }

    let persisted = false;
    try {
      await this.prisma.paymentRequest.update({
        where: { id },
        data: {
          status: RequestStatus.PAID,
          txHash,
        },
      });
      persisted = true;
    } catch (e) {
      // In-memory update
    }

    if (persisted) {
      await Promise.all([
        this.activityService.record({
          userIdentifier: payerUserId,
          action: UserActivityAction.TRANSFER_SENT,
          amount: request.amount,
          token: request.token,
          txHash,
          metadata: { paymentRequestId: id, counterparty: request.requesterId },
        }),
        this.activityService.record({
          userIdentifier: request.requesterId,
          action: UserActivityAction.TRANSFER_RECEIVED,
          amount: request.amount,
          token: request.token,
          txHash,
          metadata: { paymentRequestId: id, counterparty: payerUserId },
        }),
      ]);
    }

    // Notify requester that request has been paid
    await this.notificationsService.create({
      userId: request.requesterId,
      type: NotificationType.TRANSACTION_RECEIVED,
      title: 'Payment Request Received! 💰',
      body: `${request.recipientIdentifier || 'Recipient'} paid your request for ${request.amount} ${request.token}`,
      data: { requestId: id, txHash },
    });

    return { success: true, status: 'PAID', txHash };
  }

  async cancelRequest(id: string, requesterUserId: string) {
    const request = await this.findOne(id);
    if (request.requesterId !== requesterUserId) {
      throw new ForbiddenException('Only the requester can cancel this payment request');
    }

    try {
      await this.prisma.paymentRequest.update({
        where: { id },
        data: { status: RequestStatus.CANCELLED },
      });
    } catch (e) {
      // Fallback
    }

    if (request.recipientId || request.recipientIdentifier) {
      await this.notificationsService.create({
        userId: request.recipientId || request.recipientIdentifier,
        type: NotificationType.SYSTEM,
        title: 'Request Cancelled ❌',
        body: `Payment request for ${request.amount} ${request.token} was cancelled by requester`,
        data: { requestId: id },
      });
    }

    return { success: true, status: 'CANCELLED' };
  }

  async remindRequest(id: string, requesterUserId: string) {
    const request = await this.findOne(id);
    if (request.requesterId !== requesterUserId) {
      throw new ForbiddenException('Only the requester can trigger reminders for this request');
    }

    if (request.status !== RequestStatus.PENDING) {
      throw new BadRequestException('Reminders can only be sent for PENDING requests');
    }

    // Rate-limit: Enforce 1-hour minimum interval between reminders
    if (request.lastRemindedAt) {
      const lastRemindedTime = new Date(request.lastRemindedAt).getTime();
      const oneHourAgo = Date.now() - 60 * 60 * 1000;
      if (lastRemindedTime > oneHourAgo) {
        throw new ConflictException('Reminder already sent recently. Please wait before reminding again.');
      }
    }

    try {
      await this.prisma.paymentRequest.update({
        where: { id },
        data: { lastRemindedAt: new Date() },
      });
    } catch (e) {
      // Fallback
    }

    const targetUserId = request.recipientId || request.recipientIdentifier;
    await this.notificationsService.create({
      userId: targetUserId,
      type: NotificationType.SPLIT_REQUEST,
      title: 'Payment Reminder ⏰',
      body: `Reminder: You have a pending request from ${request.requesterId} for ${request.amount} ${request.token}`,
      data: { requestId: id, deepLink: `${getAppBaseUrl()}/requests/${id}` },
    });

    return { success: true, lastRemindedAt: new Date() };
  }
}
