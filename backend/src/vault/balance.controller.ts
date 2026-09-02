import { Controller, Get, Req, UseGuards, Logger } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { VaultService } from './vault.service';
import { PrismaService } from '../prisma/prisma.service';
import { SolanaChainService } from '../chains/solana/solana-chain.service';
import { isSolanaAddress } from '../chains/solana/solana-account';

@Controller('api/balance')
@UseGuards(JwtAuthGuard)
export class BalanceController {
  private readonly logger = new Logger(BalanceController.name);

  constructor(
    private readonly vaultService: VaultService,
    private readonly prisma: PrismaService,
    private readonly solana: SolanaChainService,
  ) {}

  @Get()
  async getBalances(@Req() req: any) {
    const userReq = req.user;
    const walletAddress = await this.resolveWalletAddress(userReq.userId, userReq.walletAddress);

    const balances: Record<string, string> = {};
    const tokens: {
      symbol: string;
      name: string;
      balance: number;
      priceUsd: number | null;
      valueUsd: number;
    }[] = [];

    let totalUsd = 0;

    // USDC is the only spendable settlement asset in the current program.
    try {
      const rawBalance = await this.solana.getVaultUsdcBalance(walletAddress);
      const usdcBalance = Number(rawBalance) / 1_000_000;
      balances.USDC = usdcBalance.toFixed(2);
      tokens.push({
        symbol: 'USDC',
        name: 'USD Coin',
        balance: usdcBalance,
        priceUsd: 1,
        valueUsd: usdcBalance,
      });
      totalUsd = usdcBalance;
    } catch (e: any) {
      this.logger.warn(`Failed to fetch USDC balance for ${walletAddress}: ${e.message}`);
      balances.USDC = '0';
      tokens.push({ symbol: 'USDC', name: 'USD Coin', balance: 0, priceUsd: 1, valueUsd: 0 });
    }

    // SOL sent to the vault PDA is visible as its network balance. It is not
    // included in totalUsd or offered for payments because the program only
    // authorizes SPL USDC transfers today.
    try {
      const rawBalance = await this.solana.getVaultSolBalance(walletAddress);
      const solBalance = Number(rawBalance) / 1_000_000_000;
      balances.SOL = formatSol(solBalance);
      tokens.push({
        symbol: 'SOL',
        name: 'Solana',
        balance: solBalance,
        priceUsd: null,
        valueUsd: 0,
      });
    } catch (e: any) {
      this.logger.warn(`Failed to fetch SOL balance for ${walletAddress}: ${e.message}`);
      balances.SOL = '0';
      tokens.push({ symbol: 'SOL', name: 'Solana', balance: 0, priceUsd: null, valueUsd: 0 });
    }

    // Compute yield summary from activity logs
    const yieldSummary = await this.computeYieldSummary(userReq.userId, totalUsd);

    return {
      address: walletAddress,
      balances,
      totalUsd,
      tokens,
      yieldSummary,
    };
  }

  /**
   * Computes earning yield and available cash from vault activity logs + on-chain APY.
   */
  private async computeYieldSummary(userId: string, totalUsd: number) {
    let earningYield = 0;
    let apy = 0;

    try {
      // Sum vault deposits
      const depositsAgg = await this.prisma.userActivityLog.aggregate({
        where: { userId, action: 'VAULT_DEPOSIT' },
        _sum: { amount: true },
      });
      const totalDeposits = depositsAgg._sum.amount ? Number(depositsAgg._sum.amount) : 0;

      // Sum vault withdrawals
      const withdrawalsAgg = await this.prisma.userActivityLog.aggregate({
        where: { userId, action: 'VAULT_WITHDRAW' },
        _sum: { amount: true },
      });
      const totalWithdrawals = withdrawalsAgg._sum.amount ? Number(withdrawalsAgg._sum.amount) : 0;

      earningYield = Math.max(0, totalDeposits - totalWithdrawals);

      // Fetch on-chain APY
      const apyData = await this.vaultService.getVerifiedAPY();
      apy = apyData.apy;
    } catch (e: any) {
      this.logger.warn(`Failed to compute yield summary for ${userId}: ${e.message}`);
    }

    const availableCash = Math.max(0, totalUsd - earningYield);

    return {
      earningYield: earningYield.toFixed(2),
      apy: apy.toFixed(1),
      availableCash: availableCash.toFixed(2),
    };
  }

  private async resolveWalletAddress(userId: string, walletAddress?: string): Promise<string> {
    // If we already have a wallet address from the auth header, use it
    if (walletAddress && isSolanaAddress(walletAddress)) {
      return walletAddress;
    }

    // Otherwise look up from DB
    try {
      const user = await this.prisma.user.findFirst({
        where: { id: userId },
        include: { smartWallet: true },
      });

      if (user?.smartWallet?.address) {
        return user.smartWallet.address;
      }
    } catch (e: any) {
      this.logger.warn(`DB lookup failed for user ${userId}: ${e.message}`);
    }

    if (!walletAddress) {
      this.logger.warn(`No wallet address found for user ${userId}. Wallet not yet created.`);
    }
    return walletAddress || '';
  }
}

function formatSol(balance: number): string {
  return balance.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 9,
    useGrouping: false,
  });
}
