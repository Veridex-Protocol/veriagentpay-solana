import { PrismaService } from '../prisma/prisma.service';
import { BadRequestException } from '@nestjs/common';

/**
 * Helper to resolve wallet addresses to user UUIDs consistently across the app
 */
export class WalletResolver {
  /**
   * Resolves a wallet address (or fallback) to a user UUID
   * @param prisma - PrismaService instance
   * @param walletAddress - Wallet address from request header (may be undefined)
   * @param defaultAddress - Default wallet address to use if header not provided
   * @returns User UUID
   * @throws BadRequestException if user not found
   */
  static async resolveToUserId(
    prisma: PrismaService,
    walletAddress: string | undefined,
    defaultAddress?: string
  ): Promise<string> {
    const address = walletAddress || defaultAddress;
    if (!address) {
      throw new BadRequestException('Wallet address is required. Provide x-wallet-address header.');
    }

    const user = await prisma.user.findFirst({
      where: { smartWallet: { address: { equals: address, mode: 'insensitive' } } },
      include: { smartWallet: true },
    });

    if (!user) {
      throw new BadRequestException(`User not found for wallet address: ${address}`);
    }

    return user.id;
  }

  /**
   * Resolves wallet address to user UUID, returns null if not found (no throw)
   */
  static async resolveToUserIdSafe(
    prisma: PrismaService,
    walletAddress: string | undefined,
    defaultAddress?: string
  ): Promise<string | null> {
    const address = walletAddress || defaultAddress;

    const user = await prisma.user.findFirst({
      where: { smartWallet: { address: { equals: address, mode: 'insensitive' } } },
      include: { smartWallet: true },
    });

    return user?.id || null;
  }
}
