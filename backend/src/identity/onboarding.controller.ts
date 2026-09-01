import { Controller, Post, Body, BadRequestException, UnauthorizedException, Logger, Inject, forwardRef } from '@nestjs/common';
import { IdentityService } from './identity.service';
import { CredentialVaultService } from './credential-vault.service';
import { TelegramBotDriver } from '../platform/drivers/telegram-bot';
import { RelayerService } from '../relayer/relayer.service';
import { PrismaService } from '../prisma/prisma.service';
import * as jwt from 'jsonwebtoken';
import * as crypto from 'crypto';
import { Public } from '../auth/decorators/public.decorator';

export interface OnboardingCompleteDto {
  chatId: string;
  platform?: string;
  platformId?: string;
  username?: string;
  walletAddress?: string;
  publicKeyX?: string;
  publicKeyY?: string;
  credentialId?: string;
}

export interface AuthenticateDto {
  credentialId: string;
  publicKeyX: string;
  publicKeyY: string;
}

// Onboarding precedes having a token. Entry is authorized by an HMAC-signed
// deep link or a claim code, verified inside the service.
@Public()
@Controller('api/onboarding')
export class OnboardingController {
  private readonly logger = new Logger(OnboardingController.name);

  constructor(
    private readonly identityService: IdentityService,
    private readonly credentialVault: CredentialVaultService,
    private readonly relayerService: RelayerService,
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => TelegramBotDriver))
    private readonly telegramBotDriver?: TelegramBotDriver
  ) {}

  @Post('complete')
  async completeOnboarding(@Body() dto: OnboardingCompleteDto) {
    if (dto.publicKeyX || dto.publicKeyY || dto.credentialId) {
      throw new UnauthorizedException('Legacy public-key onboarding is disabled. Use the verified WebAuthn registration ceremony.');
    }
    if (!dto.chatId && !dto.platformId) {
      throw new BadRequestException('chatId or platformId is required');
    }

    const platform = dto.platform || 'telegram';
    const platformId = dto.platformId || dto.chatId;
    const username = dto.username || `user_${platformId}`;

    this.logger.log(`Completing onboarding for ${platform}:${platformId} (${username})`);

    let walletAddress = dto.walletAddress;
    let accessToken: string | undefined;

    // Register or link user record & smart wallet
    let userId: string | undefined;
    if (dto.publicKeyX && dto.publicKeyY) {
      const result = await this.identityService.registerUser(
        platform as any,
        platformId,
        username,
        dto.publicKeyX,
        dto.publicKeyY,
        dto.credentialId,
      );
      walletAddress = result.smartAccountAddress;
      accessToken = result.accessToken;
      userId = result.userId;

      // Store credential in encrypted vault (envelope encryption)
      if (dto.credentialId) {
        try {
          await this.credentialVault.storeCredential(dto.credentialId, {
            userId,
            publicKeyX: dto.publicKeyX,
            publicKeyY: dto.publicKeyY,
            walletAddress,
          });
          this.logger.log(`Credential stored in encrypted vault for user ${userId}`);
        } catch (err: any) {
          this.logger.warn(`Failed to store credential in vault: ${err.message}`);
        }
      }

      // No session key is created here on purpose.
      //
      // Provisioning one at signup produced a row that could never sign: only a
      // passkey-authorized `registerSession` sets `activatedAt`, and the
      // relayer is not permitted to send one. It also generated and stored a
      // real session private key for that unusable row. The client grants a
      // session key with the user's passkey immediately after onboarding, which
      // provisions its own.
    } else {
      walletAddress = await this.identityService.linkTelegramChatId(
        platform,
        platformId,
        dto.chatId,
        username,
        dto.walletAddress
      );
    }

    // Send follow-up success notification to Telegram chat if platform is telegram
    if (platform === 'telegram' && dto.chatId && this.telegramBotDriver) {
      try {
        await this.telegramBotDriver.sendOnboardingSuccess(dto.chatId, walletAddress);
      } catch (err: any) {
        this.logger.warn(`Failed to send onboarding success Telegram message: ${err.message}`);
      }
    }

    return {
      success: true,
      platform,
      platformId,
      chatId: dto.chatId,
      walletAddress,
      accessToken,
    };
  }

  @Post('authenticate')
  async authenticate(@Body() dto: AuthenticateDto) {
    throw new UnauthorizedException('Legacy passkey authentication is disabled. Use /api/webauthn/authentication/options and /verify.');
    /* istanbul ignore next -- retained temporarily for database migration reference */
    /*
    if (!dto.credentialId) {
      throw new BadRequestException('credentialId is required');
    }
    if (!dto.publicKeyX || !dto.publicKeyY) {
      throw new BadRequestException('publicKeyX and publicKeyY are required');
    }

    const lookupHash = this.credentialVault.computeLookupHash(dto.credentialId);
    this.logger.log(`Authentication attempt [lookup: ${lookupHash.slice(0, 12)}...]`);

    // Decrypt credential from vault
    const decrypted = await this.credentialVault.lookupAndDecrypt(dto.credentialId);

    if (!decrypted) {
      throw new UnauthorizedException('Passkey not recognized. Please register first.');
    }

    // Constant-time comparison of public keys to prevent timing attacks
    const xMatch = crypto.timingSafeEqual(
      Buffer.from(dto.publicKeyX),
      Buffer.from(decrypted.publicKeyX),
    );
    const yMatch = crypto.timingSafeEqual(
      Buffer.from(dto.publicKeyY),
      Buffer.from(decrypted.publicKeyY),
    );

    if (!xMatch || !yMatch) {
      throw new UnauthorizedException('Passkey verification failed.');
    }

    // Increment auth counter (replay detection)
    await this.credentialVault.incrementCounter(dto.credentialId);

    // Opportunistic migration: upgrade legacy records to envelope encryption
    this.credentialVault.migrateLegacyRecord(dto.credentialId).catch(() => {});

    // Fetch user + wallet for JWT
    const user = await this.prisma.user.findUnique({
      where: { id: decrypted.userId },
      include: { smartWallet: true },
    });

    if (!user) {
      throw new UnauthorizedException('User account not found.');
    }

    const walletAddress = decrypted.walletAddress || user.smartWallet?.address;

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) throw new Error('JWT_SECRET environment variable is required');

    const accessToken = jwt.sign(
      { userId: user.id, walletAddress, jti: crypto.randomUUID() },
      jwtSecret,
      { expiresIn: '24h' }
    );

    this.logger.log(`Authentication successful for user ${user.id}`);

    return {
      success: true,
      userId: user.id,
      username: user.username,
      walletAddress,
      accessToken,
    };
    */
  }
}
