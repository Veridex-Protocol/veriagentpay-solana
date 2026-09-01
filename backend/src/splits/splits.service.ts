import { Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException, Inject, forwardRef } from '@nestjs/common';
import { UserActivityAction } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NOTIFICATION_SERVICE, type UserNotifier } from '../common/service-contracts';
import { ActivityService } from '../activity/activity.service';
import { RelayerService } from '../relayer/relayer.service';
import { IdentityService } from '../identity/identity.service';
import { getAppBaseUrl } from '../config/app-url.config';
import { createBotChainProvider } from '../common/rpc-provider.helper';

export interface CreateSplitDto {
  token: string;
  totalAmount: number;
  participants: string[];
  customAmounts?: number[];
  description?: string;
}

export interface PaySplitDto {
  splitId: string;
  payerId: string;
}

@Injectable()
export class SplitsService {
  private readonly logger = new Logger(SplitsService.name);

  constructor(
    private readonly prisma: PrismaService,
    // Token, not class: importing the service here closes a module cycle that
    // `forwardRef` cannot break — see `service-contracts.ts`.
    @Inject(NOTIFICATION_SERVICE)
    private readonly notificationService: UserNotifier,
    @Inject(forwardRef(() => RelayerService))
    private readonly relayerService?: RelayerService,
    private readonly activityService?: ActivityService,
    private readonly identityService?: IdentityService,
  ) {}

  /**
   * Resolve any user identifier (UUID, wallet address, username, telegram handle, etc.) to a User record
   */
  private async resolveUser(identifier: string, allowFallback = true) {
    if (!identifier) return null;

    const clean = identifier.trim();
    const cleanHandle = clean.replace(/^@/, '');

    let user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { id: clean },
          { username: cleanHandle },
          { email: { equals: clean, mode: 'insensitive' } },
          { telegramId: clean },
          { whatsappId: clean },
          { slackId: clean },
          { discordId: clean },
          { smartWallet: { address: { equals: clean, mode: 'insensitive' } } },
        ],
      },
      include: {
        smartWallet: true,
        socialNodes: true,
      },
    });

    if (user) return user;

    if (clean.startsWith('0x')) {
      const cleanAddress = clean.toLowerCase();
      user = await this.prisma.user.findFirst({
        where: { smartWallet: { address: { equals: cleanAddress, mode: 'insensitive' } } },
        include: { smartWallet: true, socialNodes: true },
      });
      if (user) return user;

      try {
        const uniqueSuffix = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        user = await this.prisma.user.create({
          data: {
            username: `user_${cleanAddress.slice(2, 8)}_${uniqueSuffix}`,
            smartWallet: {
              create: {
                address: cleanAddress,
                publicKeyX: '0x0',
                publicKeyY: '0x0',
                salt: `salt_${Date.now()}`,
              },
            },
          },
          include: {
            smartWallet: true,
            socialNodes: true,
          },
        });
        return user;
      } catch (e) {
        user = await this.prisma.user.findFirst({
          where: { smartWallet: { address: { equals: cleanAddress, mode: 'insensitive' } } },
          include: { smartWallet: true, socialNodes: true },
        });
        if (user) return user;
      }
    }

    if (clean && clean !== 'anonymous' && clean !== 'creator' && !clean.includes(' ')) {
      try {
        const uniqueSuffix = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        const handle = cleanHandle.length > 2 ? cleanHandle : `user_${uniqueSuffix}`;
        user = await this.prisma.user.create({
          data: {
            username: `${handle}_${uniqueSuffix}`,
          },
          include: {
            smartWallet: true,
            socialNodes: true,
          },
        });
        return user;
      } catch (e) {
        this.logger.warn(`Failed to auto-create user for handle ${clean}: ${e}`);
      }
    }

    return null;
  }

  /**
   * Create a new bill split
   */
  async createSplit(creatorIdentifier: string, dto: CreateSplitDto) {
    const { token, totalAmount, participants, customAmounts, description } = dto;

    const creator = await this.resolveUser(creatorIdentifier);
    if (!creator) {
      throw new BadRequestException('Creator user not found');
    }
    const creatorId = creator.id;

    if (participants.length === 0) {
      throw new BadRequestException('At least one participant is required');
    }

    if (totalAmount <= 0) {
      throw new BadRequestException('Total amount must be greater than 0');
    }

    // Check for duplicate participants
    const uniqueParticipants = new Set(participants);
    if (uniqueParticipants.size !== participants.length) {
      throw new BadRequestException('Duplicate participants are not allowed');
    }

    // Calculate shares
    let shareAmounts: number[];
    if (customAmounts && customAmounts.length > 0) {
      if (customAmounts.length !== participants.length) {
        throw new BadRequestException('Custom amounts must match participants count');
      }
      shareAmounts = customAmounts;
      const customTotal = shareAmounts.reduce((sum, amt) => sum + amt, 0);
      if (Math.abs(customTotal - totalAmount) > 0.01) {
        throw new BadRequestException('Sum of custom amounts must equal total amount');
      }
    } else {
      // Equal split
      const sharePerPerson = totalAmount / participants.length;
      shareAmounts = new Array(participants.length).fill(sharePerPerson);
    }

    // Set deadline to 7 days from now
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + 7);

    // Resolve participant userIds if existing users
    const participantData = await Promise.all(
      participants.map(async (identifier, index) => {
        const resolved = await this.resolveUser(identifier, false);
        return {
          userId: resolved?.id || null,
          userIdentifier: identifier,
          shareAmount: shareAmounts[index],
        };
      })
    );

    // Create split in database
    const split = await this.prisma.billSplit.create({
      data: {
        creatorId,
        description: description || `Split of ${totalAmount} ${token}`,
        token: token.toUpperCase(),
        totalAmount,
        deadline,
        participants: {
          create: participantData,
        },
      },
      include: {
        participants: true,
      },
    });

    // Send notifications to all participants
    await this.notifyParticipants(split.id);

    await this.activityService?.record({
      userIdentifier: creatorId,
      action: UserActivityAction.SPLIT_CREATED,
      amount: totalAmount,
      token: token.toUpperCase(),
      metadata: { splitId: split.id, participantsCount: participants.length },
    }).catch(() => {});

    this.logger.log(`Split created: ${split.id} for ${totalAmount} ${token} split ${participants.length} ways`);

    return split;
  }

  /**
   * Get all splits for a user (as creator or participant)
   */
  async getUserSplits(identifier: string) {
    const user = await this.resolveUser(identifier);

    if (!user) {
      return [];
    }
    const userId = user.id;

    // Build comprehensive list of all possible identifiers for this user
    const rawWallet = user.smartWallet?.address || '';
    const rawHandles = [
      user.username,
      ...user.socialNodes.map((n) => n.username).filter(Boolean),
    ].filter(Boolean) as string[];

    const cleanHandles = rawHandles.map((h) => h.replace(/^@/, ''));
    const atHandles = cleanHandles.map((h) => `@${h}`);

    const identifiers = Array.from(new Set([
      userId,
      user.username,
      user.email,
      user.telegramId,
      user.whatsappId,
      user.discordId,
      user.slackId,
      rawWallet,
      rawWallet.toLowerCase(),
      ...cleanHandles,
      ...atHandles,
    ].filter(Boolean) as string[]));

    // Handles remain exact. Wallets are included in both forms above because
    // EVM addresses are case-insensitive; usernames, including Telegram
    // handles, must never be folded into a lower-case match.
    const caseInsensitiveIdentifiers = Array.from(new Set([
      user.email,
      rawWallet,
      rawWallet.toLowerCase(),
    ].filter(Boolean) as string[])).map((identifier) => identifier.toLowerCase());

    // Find splits where user is creator or participant
    const splits = await this.prisma.billSplit.findMany({
      where: {
        OR: [
          { creatorId: userId },
          {
            participants: {
              some: {
                OR: [
                  { userId },
                  { userIdentifier: { in: identifiers } },
                  { userIdentifier: { in: caseInsensitiveIdentifiers } },
                ],
              },
            },
          },
        ],
      },
      include: {
        participants: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return splits.map((s) => {
      const isCreator = s.creatorId === userId;
      const myPart = s.participants.find(
        (p) =>
          p.userId === userId ||
          identifiers.includes(p.userIdentifier) ||
          caseInsensitiveIdentifiers.includes(p.userIdentifier.toLowerCase())
      );
      return {
        ...s,
        isCreator,
        yourShare: myPart ? myPart.shareAmount : s.totalAmount / (s.participants.length || 1),
        hasPaid: isCreator ? true : (myPart ? myPart.hasPaid : false),
      };
    });
  }

  /**
   * Get active (non-completed) splits for a user
   */
  async getActiveSplits(identifier: string) {
    const splits = await this.getUserSplits(identifier);
    return splits.filter((s: any) => s.status !== 'COMPLETED');
  }

  /**
   * Get split details by ID
   */
  async getSplit(splitId: string, callerIdentifier?: string) {
    const split = await this.prisma.billSplit.findUnique({
      where: { id: splitId },
      include: {
        participants: true,
      },
    });

    if (!split) {
      throw new NotFoundException('Split not found');
    }

    if (callerIdentifier) {
      const caller = await this.resolveUser(callerIdentifier);
      if (caller) {
        const callerHandles = [
          caller.id,
          caller.username,
          caller.telegramId,
          caller.whatsappId,
          caller.discordId,
          caller.slackId,
          caller.smartWallet?.address,
          ...caller.socialNodes.map((n) => n.username).filter(Boolean),
        ].filter(Boolean) as string[];

        const isCreator = split.creatorId === caller.id;
        const isParticipant = split.participants.some(
          (p) =>
            (p.userId && p.userId === caller.id) ||
            callerHandles.includes(p.userIdentifier) ||
            (caller.smartWallet?.address &&
              p.userIdentifier.toLowerCase() === caller.smartWallet.address.toLowerCase())
        );

        if (!isCreator && !isParticipant) {
          throw new ForbiddenException('You are not authorized to view this split');
        }
      }
    }

    return split;
  }

  /**
   * Pay a split share
   */
  async paySplit(splitId: string, payerIdentifier: string) {
    const split = await this.getSplit(splitId);

    if (split.status === 'COMPLETED') {
      throw new BadRequestException('Split is already completed');
    }

    if (split.status === 'CANCELLED') {
      throw new BadRequestException('Split has been cancelled');
    }

    if (new Date() > split.deadline) {
      await this.prisma.billSplit.update({
        where: { id: splitId },
        data: { status: 'EXPIRED' },
      });
      throw new BadRequestException('Split has expired');
    }

    const payer = await this.resolveUser(payerIdentifier);

    if (!payer?.smartWallet) {
      throw new BadRequestException('Payer must have a smart wallet');
    }

    const payerId = payer.id;

    if (payerId === split.creatorId) {
      throw new BadRequestException('The split creator does not need to pay — funds are collected to your wallet');
    }

    // Get payer's identifiers
    const payerIdentifiers = [
      payer.username,
      payer.telegramId,
      payer.whatsappId,
      payer.discordId,
      payer.slackId,
      ...payer.socialNodes.map((n) => n.username).filter(Boolean),
    ].filter(Boolean) as string[];

    // Find participant record
    const participant = split.participants.find(
      (p) => p.userId === payerId || payerIdentifiers.includes(p.userIdentifier)
    );

    if (!participant) {
      throw new BadRequestException('You are not a participant in this split');
    }

    // CRITICAL: Execute real on-chain split payment
    let txHash: string;
    if (!payer.smartWallet?.address || !this.relayerService) {
      throw new BadRequestException('Smart wallet and relayer service required for split payment');
    }

    try {
      const { ethers } = await import('ethers');
      const { resolveToken } = await import('../config/tokens.config');

      const tokenInfo = resolveToken(split.token);
      if (!tokenInfo) {
        throw new Error(`Token ${split.token} not configured`);
      }

      const sessionKeys = await this.prisma.sessionKey.findMany({
        // `activatedAt` is the difference between a key that exists and a key
        // that can sign: only a passkey-authorized grant is registered on the
        // vault. Matching without it picks up rows the relayer will refuse
        // with GRANT_MISSING, while the user's working key goes unused.
        where: {
          userId: payerId,
          revokedAt: null,
          expiryAt: { gt: new Date() },
          activatedAt: { not: null },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (sessionKeys.length === 0) {
        const err = new BadRequestException('Active session key required for split payment');
        (err as any).code = 'SESSION_KEY_REQUIRED';
        (err as any).requirePasskey = true;
        throw err;
      }

      const creator = await this.prisma.user.findUnique({
        where: { id: split.creatorId },
        include: { smartWallet: true },
      });

      if (!creator?.smartWallet) {
        throw new BadRequestException('Split creator wallet not found');
      }

      const amountWei = ethers.parseUnits(participant.shareAmount.toString(), tokenInfo.decimals || 6);

      const decryptedKey = await this.relayerService.decryptSessionKey(sessionKeys[0]);
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

      // Transfer from payer to split creator (97-byte padded payload)
      const tokenBytes = ethers.zeroPadValue(tokenInfo.address, 32);
      const recipientBytes = ethers.zeroPadValue(creator.smartWallet.address, 32);
      const amountBytes = ethers.zeroPadValue(ethers.toBeHex(amountWei), 32);
      const typeByte = Buffer.from([1]); // ACTION_TRANSFER = 1

      const actionPayload = ethers.hexlify(ethers.concat([
        typeByte,
        tokenBytes,
        recipientBytes,
        amountBytes
      ]));

      const result = await this.relayerService.executeLocalSessionAction(
        payerId,
        payer.smartWallet.address,
        decryptedKey,
        actionPayload,
        participant.shareAmount,
        nonce
      );

      if (!result?.success || !result?.txHash) {
        throw new Error('Split payment transaction failed');
      }

      txHash = result.txHash;
      this.logger.log(`Split payment: ${txHash} (${participant.shareAmount} ${split.token})`);
    } catch (relayerErr: any) {
      this.logger.error(`Split payment failed: ${relayerErr.message}`);
      throw new BadRequestException(`Split payment failed: ${relayerErr.message}`);
    }

    // Update participant record
    await this.prisma.splitParticipant.update({
      where: { id: participant.id },
      data: {
        hasPaid: true,
        paidAt: new Date(),
        txHash,
        userId: payerId,
      },
    });

    await this.activityService?.record({
      userIdentifier: payerId,
      action: UserActivityAction.SPLIT_PAID,
      amount: participant.shareAmount,
      token: split.token,
      txHash,
      metadata: { splitId, participantId: participant.id },
    }).catch(() => {});

    // Update split collected amount
    const updatedSplit = await this.prisma.billSplit.update({
      where: { id: splitId },
      data: {
        amountCollected: {
          increment: participant.shareAmount,
        },
      },
      include: {
        participants: true,
      },
    });

    // Check if split is complete
    const allPaid = updatedSplit.participants.every((p) => p.hasPaid);
    if (allPaid) {
      await this.prisma.billSplit.update({
        where: { id: splitId },
        data: { status: 'COMPLETED' },
      });
      // Notify creator that split is complete
      await this.notificationService.notifyUser({
        userId: split.creatorId,
        type: 'split_completed',
        title: 'Split Payment Completed! 🎉',
        body: `All participants have paid their share. You received ${split.totalAmount} ${split.token}.`,
        amount: split.totalAmount,
        token: split.token,
        link: `${getAppBaseUrl()}/splits/${splitId}`,
        metadata: { splitId },
      });
    } else {
      await this.prisma.billSplit.update({
        where: { id: splitId },
        data: { status: 'PARTIAL' },
      });
      // Notify creator of partial payment
      const paidCount = updatedSplit.participants.filter((p) => p.hasPaid).length;
      const totalCount = updatedSplit.participants.length;
      await this.notificationService.notifyUser({
        userId: split.creatorId,
        type: 'split_paid',
        title: 'Split Payment Received 💰',
        body: `${participant.userIdentifier} paid their share! ${paidCount}/${totalCount} collected.`,
        amount: participant.shareAmount,
        token: split.token,
        link: `${getAppBaseUrl()}/splits/${splitId}`,
        metadata: { splitId },
      });
    }

    this.logger.log(`Split ${splitId} paid by ${payerId}. TxHash: ${txHash}`);

    return {
      success: true,
      splitId,
      txHash,
      participant: participant.userIdentifier,
      amount: participant.shareAmount,
    };
  }

  /**
   * Send notifications to all participants
   */
  private async notifyParticipants(splitId: string) {
    const split = await this.getSplit(splitId);

    for (const participant of split.participants) {
      // Try to find user by identifier
      const user = await this.resolveUser(participant.userIdentifier, false);

      if (user) {
        await this.notificationService.notifyUser({
          userId: user.id,
          type: 'split_request',
          title: 'New Split Payment Request',
          body: `You owe ${participant.shareAmount} ${split.token} for "${split.description}"`,
          amount: participant.shareAmount,
          token: split.token,
          link: `${getAppBaseUrl()}/splits/${splitId}`,
          metadata: { splitId, participantId: participant.id },
        });
      }
    }
  }
}
