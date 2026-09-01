import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { getSupportedTokens } from '../config/tokens.config';
import { SOLANA_CHAIN_REF, isSolanaAddress } from '../chains/solana/solana-account';

@Injectable()
export class DepositsService {
  private readonly logger = new Logger(DepositsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * The address an external wallet should send to.
   *
   * This is the smart account address, which is valid **before** the vault is
   * deployed: the CREATE2 address is deterministic and ERC-20 balances live in
   * the token contract, so funds sent to an undeployed address are held at the
   * exact address the vault later occupies.
   */
  async getDepositAddress(userId: string) {
    const wallet = await this.prisma.smartWallet.findUnique({ where: { userId } });
    if (!wallet) throw new NotFoundException('No smart account found. Create your wallet first.');

    const chainId = 0;
    const tokens = Object.values(getSupportedTokens())
      .filter((t) => isSolanaAddress(t.address))
      .map((t) => ({
        symbol: t.symbol,
        name: t.name,
        address: t.address,
        decimals: t.decimals,
        icon: t.icon,
      }));

    const usdc = tokens.find((token) => token.symbol === 'USDC');
    const paymentUri = usdc
      ? `solana:${wallet.address}?spl-token=${encodeURIComponent(usdc.address)}&label=${encodeURIComponent('VeriAgent Pay')}`
      : `solana:${wallet.address}`;
    const explorer = process.env.SOLANA_EXPLORER_URL || 'https://explorer.solana.com';
    const cluster = process.env.SOLANA_CLUSTER || 'devnet';

    return {
      address: wallet.address,
      chainId,
      chainRef: SOLANA_CHAIN_REF,
      network: `Solana ${cluster}`,
      isDeployed: wallet.isDeployed,
      /** Tokens credited automatically. Anything else is recorded but not credited. */
      supportedTokens: tokens,
      paymentUri,
      /**
       * Rendered server-side rather than via a third-party QR service, so a
       * user's deposit address is never disclosed to an outside host.
       */
      qrDataUri: await this.renderQr(paymentUri),
      explorerUrl: `${explorer}/address/${wallet.address}?cluster=${encodeURIComponent(cluster)}`,
    };
  }

  /** Returns a PNG data URI, or null if QR generation is unavailable. */
  private async renderQr(payload: string): Promise<string | null> {
    try {
      const QRCode = await import('qrcode');
      return await QRCode.toDataURL(payload, {
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 320,
        color: { dark: '#0B0F19', light: '#FFFFFF' },
      });
    } catch (err: any) {
      this.logger.warn(`QR generation failed: ${err.message}`);
      return null;
    }
  }

  async listDeposits(userId: string, take = 25) {
    const deposits = await this.prisma.deposit.findMany({
      where: { userId },
      orderBy: { occurredAt: 'desc' },
      take,
    });

    const explorer = process.env.SOLANA_EXPLORER_URL || 'https://explorer.solana.com';
    const cluster = process.env.SOLANA_CLUSTER || 'devnet';
    return {
      deposits: deposits.map((d) => ({
        id: d.id,
        amount: d.amount ? d.amount.toString() : null,
        amountRaw: d.amountRaw,
        token: d.tokenSymbol,
        tokenAddress: d.tokenAddress,
        from: d.fromAddress,
        txHash: d.txHash,
        status: d.status,
        recognized: d.recognized,
        occurredAt: d.occurredAt,
        explorerUrl: `${explorer}/tx/${d.txHash}?cluster=${encodeURIComponent(cluster)}`,
      })),
    };
  }
}
