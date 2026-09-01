import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { RelayerService } from './relayer.service';
import { PrismaClient, Prisma } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateSessionKeyDto } from './dto/create-session-key.dto';
import { PrismaService } from '../prisma/prisma.service';

@Controller('api/session-keys')
@UseGuards(JwtAuthGuard)
export class SessionKeysController {
  constructor(
    private readonly relayerService: RelayerService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('status')
  async getSessionKeyStatus(@Req() req: any) {
    const userReq = req.user;
    const dbUser = await this.resolveUser(userReq.userId, userReq.walletAddress);

    const activeKey = await this.prisma.sessionKey.findFirst({
      where: {
        userId: dbUser.id,
        revokedAt: null,
        expiryAt: { gt: new Date() },
        // A row without an on-chain grant cannot sign anything —
        // `executeWithLocalSession` reverts on it. Every path that *uses* a
        // session key filters on this, so reporting without it told users they
        // had instant payments set up while every payment escalated instead.
        activatedAt: { not: null },
      },
      orderBy: { expiryAt: 'desc' },
    });

    if (!activeKey) {
      return {
        hasActiveKey: false,
        expiresAt: null,
        secondsRemaining: 0,
        perTxLimitUSD: 0,
        dailyLimitUSD: 0,
      };
    }

    const secondsRemaining = Math.max(0, Math.floor((new Date(activeKey.expiryAt).getTime() - Date.now()) / 1000));

    return {
      hasActiveKey: true,
      expiresAt: activeKey.expiryAt.toISOString(),
      secondsRemaining,
      perTxLimitUSD: Number(activeKey.perTxLimitUSD),
      dailyLimitUSD: Number(activeKey.dailyLimitUSD),
    };
  }

  @Get()
  async getSessionKeys(@Req() req: any) {
    const userReq = req.user;
    const dbUser = await this.resolveUser(userReq.userId, userReq.walletAddress);

    const keys = await this.prisma.sessionKey.findMany({
      where: {
        userId: dbUser.id,
        revokedAt: null,
        expiryAt: { gt: new Date() },
        // Same reason as the status endpoint: a key with no on-chain grant is
        // not a key the user has, so listing it invites them to rely on it.
        activatedAt: { not: null },
      },
      orderBy: { createdAt: 'desc' },
    });

    const formattedKeys = keys.map((k) => {
      const createdMs = new Date(k.createdAt).getTime();
      const expiryMs = new Date(k.expiryAt).getTime();
      const durationMins = Math.max(0, Math.round((expiryMs - createdMs) / 60000));
      const maxValueNum = Number(k.dailyLimitUSD ?? k.perTxLimitUSD ?? 0);

      return {
        ...k,
        durationMinutes: durationMins,
        maxValue: maxValueNum,
        dailyLimitUSD: Number(k.dailyLimitUSD),
        perTxLimitUSD: Number(k.perTxLimitUSD),
      };
    });

    return { keys: formattedKeys };
  }

  @Post()
  async createSessionKey(@Req() req: any, @Body() dto: CreateSessionKeyDto) {
    const userReq = req.user;
    const dbUser = await this.resolveUser(userReq.userId, userReq.walletAddress);

    if (!dbUser.smartWallet) {
      throw new BadRequestException('Smart wallet setup required prior to provisioning session keys.');
    }

    if (!dto.durationMinutes || dto.durationMinutes <= 0) {
      throw new BadRequestException('Duration minutes must be greater than 0');
    }

    if (!dto.maxValue || dto.maxValue <= 0) {
      throw new BadRequestException('Maximum session value must be greater than 0');
    }

    // Per-transaction and daily ceilings are separate figures. Passing
    // `dto.maxValue` for both silently collapsed them: a user asking for $50
    // per payment and $200 per day received $50 per day.
    //
    // @see docs/security-remediation-plan.md — BE-H-10
    const perTxLimitUSD = dto.maxValue;
    const dailyLimitUSD = dto.dailyLimitUSD ?? dto.maxValue;

    if (dailyLimitUSD < perTxLimitUSD) {
      throw new BadRequestException(
        'Daily limit cannot be lower than the per-payment limit.',
      );
    }

    // The registry ceiling is per-transaction, in the 6-decimal scale the vault
    // normalizes to before comparing.
    const maxValueLimit = BigInt(Math.floor(perTxLimitUSD * 1e6));

    const result = await this.relayerService.provisionSessionKey(
      dbUser.id,
      dbUser.smartWallet.address,
      dto.durationMinutes * 60,
      maxValueLimit,
      perTxLimitUSD,
      dailyLimitUSD
    );

    return result;
  }

  @Delete(':id')
  async deleteSessionKey(@Req() req: any, @Param('id') id: string) {
    const userReq = req.user;
    const dbUser = await this.resolveUser(userReq.userId, userReq.walletAddress);

    const sessionKey = await this.prisma.sessionKey.findFirst({
      where: {
        OR: [
          { id },
          { keyHash: id },
        ],
      },
    });

    if (!sessionKey || sessionKey.userId !== dbUser.id) {
      throw new NotFoundException('Session key not found or unauthorized');
    }

    return await this.relayerService.revokeSessionKey(dbUser.id, sessionKey.keyHash);
  }

  private async resolveUser(userId: string, walletAddress?: string) {
    const orConditions: Prisma.UserWhereInput[] = [{ id: userId }];
    if (walletAddress) {
      orConditions.push({
        smartWallet: {
          address: {
            equals: walletAddress,
            mode: 'insensitive' as Prisma.QueryMode,
          },
        },
      });
    }

    const user = await this.prisma.user.findFirst({
      where: { OR: orConditions },
      include: { smartWallet: true },
    });

    if (!user) {
      throw new NotFoundException('User profile not resolved');
    }

    return user;
  }
}
