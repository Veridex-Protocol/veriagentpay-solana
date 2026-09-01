import { Injectable, BadRequestException, UnauthorizedException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as jwt from 'jsonwebtoken';
import { ethers } from 'ethers';
import * as crypto from 'crypto';
import { RedisService } from '../core/redis.service';
import { JWT_SECRET } from '../config/secrets';

export interface ChallengeRequestDto {
  walletAddress: string;
}

export interface VerifyChallengeDto {
  walletAddress: string;
  signature: string;
  nonce: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly jwtSecret: string;
  private readonly localChallenges = new Map<string, { nonce: string; expiresAt: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {
    this.jwtSecret = JWT_SECRET;
  }

  /**
   * Generates a cryptographic nonce challenge for passkey / wallet signature auth.
   * Stored in Redis with a 5-minute TTL for cluster-wide availability, with local Map fallback.
   */
  async generateChallenge(walletAddress: string) {
    if (!walletAddress || !walletAddress.startsWith('0x')) {
      throw new BadRequestException('Valid EVM wallet address required');
    }

    const cleanAddress = walletAddress.toLowerCase();
    const nonce = `nonce_${crypto.randomBytes(16).toString('hex')}`;
    const ttlMs = 5 * 60 * 1000; // 5 minute TTL
    const expiresAt = Date.now() + ttlMs;

    try {
      await this.redis.setJson(`auth:challenge:${cleanAddress}`, { nonce, expiresAt }, ttlMs);
    } catch (err: any) {
      this.logger.warn(`Redis challenge store failed, using local memory: ${err.message}`);
    }
    this.localChallenges.set(cleanAddress, { nonce, expiresAt });

    const messageToSign = `VeriAgent Pay Authentication Nonce: ${nonce}`;
    return {
      walletAddress: cleanAddress,
      nonce,
      messageToSign,
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }

  /**
   * Verifies signature against nonce and returns short-lived JWT (24h).
   * Atomically consumes the challenge to prevent replay attacks.
   */
  async verifyChallenge(dto: VerifyChallengeDto) {
    if (!dto.walletAddress || !dto.signature || !dto.nonce) {
      throw new BadRequestException('walletAddress, signature, and nonce are required');
    }

    const cleanAddress = dto.walletAddress.toLowerCase();

    // Attempt atomic retrieval and deletion from Redis
    let storedChallenge: { nonce: string; expiresAt: number } | null = null;
    try {
      storedChallenge = await this.redis.takeJson<{ nonce: string; expiresAt: number }>(
        `auth:challenge:${cleanAddress}`,
      );
    } catch (err: any) {
      this.logger.warn(`Redis challenge read failed: ${err.message}`);
    }

    // Fallback to in-memory challenge if Redis did not return a record
    if (!storedChallenge) {
      storedChallenge = this.localChallenges.get(cleanAddress) || null;
    }
    this.localChallenges.delete(cleanAddress);

    if (!storedChallenge || storedChallenge.nonce !== dto.nonce) {
      throw new UnauthorizedException('Invalid or expired authentication challenge nonce');
    }

    if (Date.now() > storedChallenge.expiresAt) {
      throw new UnauthorizedException('Authentication challenge expired. Please request a new challenge.');
    }

    // Verify signature cryptographically
    const expectedMessage = `VeriAgent Pay Authentication Nonce: ${dto.nonce}`;
    try {
      const recoveredAddress = ethers.verifyMessage(expectedMessage, dto.signature);
      if (recoveredAddress.toLowerCase() !== cleanAddress) {
        throw new UnauthorizedException('Signature address mismatch');
      }
    } catch (e: any) {
      throw new UnauthorizedException(`Cryptographic signature verification failed: ${e.message}`);
    }

    // Resolve or create user with smart wallet address
    let user: any;
    try {
      user = await this.prisma.user.findFirst({
        where: {
          smartWallet: {
            address: { equals: cleanAddress, mode: 'insensitive' },
          },
        },
        include: { smartWallet: true, socialNodes: true },
      });

      if (!user) {
        // Create user for wallet address
        user = await this.prisma.user.create({
          data: {
            username: `user_${cleanAddress.slice(2, 8)}`,
            smartWallet: {
              create: {
                address: cleanAddress,
                publicKeyX: '0x0',
                publicKeyY: '0x0',
                salt: `salt_${Date.now()}`,
              },
            },
          },
          include: { smartWallet: true, socialNodes: true },
        });
      }
    } catch (dbErr: any) {
      this.logger.error(`Database error during wallet challenge verify: ${dbErr.message}`, dbErr.stack);
      throw new BadRequestException('Failed to resolve user account. Please try again.');
    }

    // `jti` is required: JwtAuthGuard only honours revocation for tokens that
    // carry one, so a token without it cannot be invalidated for 24 hours.
    // @see docs/security-remaining-issues.md — BE-H-04
    const accessToken = jwt.sign(
      { userId: user.id, walletAddress: cleanAddress, jti: crypto.randomUUID() },
      this.jwtSecret,
      { expiresIn: '24h' }
    );

    return {
      accessToken,
      user: {
        id: user.id,
        walletAddress: cleanAddress,
        email: user.email || null,
        username: user.username || null,
        hasPasskeyWallet: true,
        socialNodes: user.socialNodes || [],
      },
    };
  }

  async getProfile(userIdOrAddress: string) {
    try {
      const isAddress = userIdOrAddress.startsWith('0x');
      const user = await this.prisma.user.findFirst({
        where: isAddress
          ? { smartWallet: { address: { equals: userIdOrAddress.toLowerCase(), mode: 'insensitive' } } }
          : { id: userIdOrAddress },
        include: {
          smartWallet: true,
          socialNodes: true,
        },
      });

      if (!user) {
        throw new UnauthorizedException('User profile not found');
      }

      return {
        id: user.id,
        email: user.email,
        username: user.username,
        googleId: user.googleId,
        walletAddress: user.smartWallet?.address || null,
        hasPasskeyWallet: Boolean(user.smartWallet?.address),
        socialNodes: user.socialNodes || [],
      };
    } catch (e: any) {
      if (e instanceof UnauthorizedException) throw e;
      this.logger.error(`Failed to fetch user profile for ${userIdOrAddress}: ${e.message}`);
      throw new UnauthorizedException('Failed to fetch user profile');
    }
  }
}
