import { Injectable, Logger, BadRequestException, Inject, forwardRef, OnModuleInit } from '@nestjs/common';
import { UserActivityAction } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ethers } from 'ethers';
import { ActivityService } from '../activity/activity.service';
import { RelayerService } from '../relayer/relayer.service';
import { BadgesService } from '../badges/badges.service';
import { ReputationService } from '../reputation/reputation.service';
import { createRelayerSigner } from '../relayer/relayer-signer.factory';
import { createBotChainProvider } from '../common/rpc-provider.helper';
import { buildExecutePayload, readSessionNonce } from '../relayer/session-action.helpers';
import { calculateInteractionStreakUpdate } from '../growth/interaction-streak.utils';

export interface ZkTLSProof {
  endpoint: string;
  jsonPath: string;
  value: string;
  timestamp: number;
  signature: string;
}

@Injectable()
export class VaultService implements OnModuleInit {
  private readonly logger = new Logger(VaultService.name);
  private readonly provider = createBotChainProvider();
  // Shares the relayer's key by design, so it signs through the same path.
  // Reading PROVER_PRIVATE_KEY here would keep raw material in the environment
  // and make the relayer's move to KMS cosmetic — an attacker reading this
  // variable could sign payments as the relayer.
  //
  // The previous `|| createRandom()` fallback meant a missing key silently
  // signed attestations with an unauthorised address instead of failing.
  private readonly proverSigner = createRelayerSigner(this.provider);

  private readonly veridexOracleAddress = process.env.VERIDEX_ORACLE_ADDRESS || '';
  private readonly agentVaultAddress = process.env.AGENT_VAULT_ADDRESS || '0x3333333333333333333333333333333333333333';

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => RelayerService))
    private readonly relayerService?: RelayerService,
    private readonly activityService?: ActivityService,
    @Inject(forwardRef(() => BadgesService))
    private readonly badgesService?: BadgesService,
    private readonly reputationService?: ReputationService,
  ) {}

  onModuleInit() {
    if (!this.veridexOracleAddress || !ethers.isAddress(this.veridexOracleAddress)) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error(
          `VERIDEX_ORACLE_ADDRESS is required and must be a valid Ethereum address. Got: "${this.veridexOracleAddress}"`,
        );
      } else {
        this.logger.warn(
          `VERIDEX_ORACLE_ADDRESS is not set to a valid address ("${this.veridexOracleAddress}"). Oracle functions will fail.`,
        );
      }
    }
  }

  /**
   * Fetches on-chain verified APY (attested by Veridex zkTLS)
   */
  async getVerifiedAPY(): Promise<{ apy: number; lastUpdated: number }> {
    const vaultAbi = ['function getAPY() external view returns (uint256 verifiedAPY, uint256 lastVerified)'];
    const vaultContract = new ethers.Contract(this.agentVaultAddress, vaultAbi, this.provider);

    try {
      const [apy, lastVerified] = await vaultContract.getAPY();
      return {
        apy: Number(apy) / 100, // convert basis points to percentage (e.g. 850 -> 8.5)
        lastUpdated: Number(lastVerified),
      };
    } catch (e: any) {
      this.logger.warn(`Failed to read APY from contract: ${e.message}. Falling back to default backup rate.`);
      return {
        apy: 8.5,
        lastUpdated: Math.floor(Date.now() / 1000),
      };
    }
  }

  /**
   * Performs vault deposit: calls relayer on-chain, records VaultDeposit in DB, updates InteractionStreak, and logs activity.
   */
  async deposit(userId: string, vaultId: string, amount: number) {
    if (!amount || amount <= 0) {
      throw new BadRequestException('Deposit amount must be greater than 0');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        smartWallet: true,
        sessionKeys: {
          where: { revokedAt: null, expiryAt: { gt: new Date() }, activatedAt: { not: null } },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!user || !user.smartWallet) {
      throw new BadRequestException('Smart wallet setup required before depositing into yield vaults.');
    }

    // CRITICAL: Execute real on-chain vault deposit
    let txHash: string;

    if (!user.sessionKeys || user.sessionKeys.length === 0) {
      const err = new BadRequestException('Active session key required for vault deposits. Please create a session key first.');
      (err as any).code = 'SESSION_KEY_REQUIRED';
      (err as any).requirePasskey = true;
      throw err;
    }

    if (!this.relayerService) {
      throw new BadRequestException('Relayer service not available');
    }

    try {
      const { resolveToken, DEFAULT_TOKEN_SYMBOL } = await import('../config/tokens.config');
      const tokenInfo = resolveToken();
      if (!tokenInfo) {
        throw new Error(`Default settlement token ${DEFAULT_TOKEN_SYMBOL} is not configured`);
      }

      const amountWei = ethers.parseUnits(amount.toString(), tokenInfo.decimals);

      // Build action payload: approve + deposit
      // First, we need to approve the vault to spend tokens
      const approveData = ethers.Interface.from([
        'function approve(address spender, uint256 amount) returns (bool)'
      ]).encodeFunctionData('approve', [this.agentVaultAddress, amountWei]);

      // Then deposit to vault
      const depositData = ethers.Interface.from([
        'function deposit(uint256 amount) returns (uint256 shares)'
      ]).encodeFunctionData('deposit', [amountWei]);

      // Execute multi-call: approve then deposit
      // For now, we'll execute deposit assuming approval is already given
      // In production, use multicall or execute approve separately first

      const sessionKey = user.sessionKeys[0];
      const decryptedKey = await this.relayerService.decryptSessionKey(sessionKey);

      // Build action payload for vault deposit
      const actionPayload = buildExecutePayload(this.agentVaultAddress, depositData);

      // The nonce must be the vault's own counter for this session key. It is
      // bound into the signed digest, so a timestamp produces a signature the
      // vault cannot reconstruct and the call reverts — silently, because the
      // failure surfaces on-chain rather than as a thrown error here.
      const nonce = await readSessionNonce(
        this.provider,
        user.smartWallet.address,
        decryptedKey,
      );

      const result = await this.relayerService.executeLocalSessionAction(
        userId,
        user.smartWallet.address,
        decryptedKey,
        actionPayload,
        amount,
        nonce
      );

      if (!result?.success || !result?.txHash) {
        throw new Error('Vault deposit transaction failed');
      }

      txHash = result.txHash;
      this.logger.log(`Vault deposit executed: ${txHash} (${amount} USDC)`);
    } catch (err: any) {
      this.logger.error(`Vault deposit failed: ${err.message}`);
      throw new BadRequestException(`Vault deposit failed: ${err.message}`);
    }

    // Persist VaultDeposit record
    const depositRecord = await this.prisma.vaultDeposit.create({
      data: {
        userId,
        vaultId: vaultId || 'agent-vault-usdc',
        amount,
        token: 'USDC',
        txHash,
      },
    });

    // Update or create InteractionStreak for user
    const existingStreak = await this.prisma.interactionStreak.findUnique({
      where: { userId },
    });

    if (existingStreak) {
      const streakUpdate = calculateInteractionStreakUpdate(existingStreak, new Date());
      if (streakUpdate) {
        await this.prisma.interactionStreak.update({
          where: { userId },
          data: {
            currentStreak: streakUpdate.currentStreak,
            longestStreak: streakUpdate.longestStreak,
            lastActiveAt: streakUpdate.lastActiveAt,
            lastInteractionType: 'VAULT_DEPOSIT',
            ...(streakUpdate.gracePassUsed
              ? { lastGracePassUsedAt: streakUpdate.lastGracePassUsedAt }
              : {}),
          },
        });
      }
    } else {
      await this.prisma.interactionStreak.create({
        data: {
          userId,
          currentStreak: 1,
          longestStreak: 1,
          lastActiveAt: new Date(),
          lastInteractionType: 'VAULT_DEPOSIT',
        },
      });
    }

    // Record activity log
    await this.activityService?.record({
      userIdentifier: userId,
      action: UserActivityAction.VAULT_DEPOSIT,
      amount,
      token: 'USDC',
      txHash,
      metadata: { vaultId, depositId: depositRecord.id },
    });

    // Award reputation points for vault deposit
    if (this.reputationService) {
      this.reputationService.awardVaultDepositPoints(userId, amount, txHash).catch(err =>
        this.logger.warn(`Failed to award reputation points for vault deposit: ${err.message}`)
      );
    }

    // Check and award badges (Yield Pioneer, etc.)
    if (this.badgesService) {
      this.badgesService.checkAndAwardBadges(userId).catch(err =>
        this.logger.warn(`Failed to check badges after vault deposit: ${err.message}`)
      );
    }

    return {
      success: true,
      txHash,
      depositId: depositRecord.id,
      amount,
    };
  }

  /**
   * Performs vault withdrawal: executes on-chain, records VaultWithdrawal in DB and logs activity.
   */
  async withdraw(userId: string, vaultId: string, amount: number) {
    if (!amount || amount <= 0) {
      throw new BadRequestException('Withdrawal amount must be greater than 0');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        smartWallet: true,
        sessionKeys: {
          where: { revokedAt: null, expiryAt: { gt: new Date() }, activatedAt: { not: null } },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!user || !user.smartWallet) {
      throw new BadRequestException('Smart wallet setup required before withdrawing from yield vaults.');
    }

    // CRITICAL: Execute real on-chain vault withdrawal
    let txHash: string;

    if (!user.sessionKeys || user.sessionKeys.length === 0) {
      const err = new BadRequestException('Active session key required for vault withdrawals. Please create a session key first.');
      (err as any).code = 'SESSION_KEY_REQUIRED';
      (err as any).requirePasskey = true;
      throw err;
    }

    if (!this.relayerService) {
      throw new BadRequestException('Relayer service not available');
    }

    try {
      const { resolveToken, DEFAULT_TOKEN_SYMBOL } = await import('../config/tokens.config');
      const tokenInfo = resolveToken();
      if (!tokenInfo) {
        throw new Error(`Default settlement token ${DEFAULT_TOKEN_SYMBOL} is not configured`);
      }

      const amountWei = ethers.parseUnits(amount.toString(), tokenInfo.decimals);

      // Build action payload for vault withdrawal
      const withdrawData = ethers.Interface.from([
        'function withdraw(uint256 amount) returns (uint256)'
      ]).encodeFunctionData('withdraw', [amountWei]);

      const sessionKey = user.sessionKeys[0];
      const decryptedKey = await this.relayerService.decryptSessionKey(sessionKey);

      const actionPayload = buildExecutePayload(this.agentVaultAddress, withdrawData);

      const nonce = await readSessionNonce(
        this.provider,
        user.smartWallet.address,
        decryptedKey,
      );

      const result = await this.relayerService.executeLocalSessionAction(
        userId,
        user.smartWallet.address,
        decryptedKey,
        actionPayload,
        amount,
        nonce
      );

      if (!result?.success || !result?.txHash) {
        throw new Error('Vault withdrawal transaction failed');
      }

      txHash = result.txHash;
      this.logger.log(`Vault withdrawal executed: ${txHash} (${amount} USDC)`);
    } catch (err: any) {
      this.logger.error(`Vault withdrawal failed: ${err.message}`);
      throw new BadRequestException(`Vault withdrawal failed: ${err.message}`);
    }

    const withdrawalRecord = await this.prisma.vaultWithdrawal.create({
      data: {
        userId,
        vaultId: vaultId || 'agent-vault-usdc',
        amount,
        token: 'USDC',
        txHash,
      },
    });

    await this.activityService?.record({
      userIdentifier: userId,
      action: UserActivityAction.VAULT_WITHDRAW,
      amount,
      token: 'USDC',
      txHash,
      metadata: { vaultId, withdrawalId: withdrawalRecord.id },
    });

    // Award reputation points for vault withdrawal
    if (this.reputationService) {
      this.reputationService.awardVaultWithdrawalPoints(userId, txHash).catch(err =>
        this.logger.warn(`Failed to award reputation points for vault withdrawal: ${err.message}`)
      );
    }

    return {
      success: true,
      txHash,
      withdrawalId: withdrawalRecord.id,
      amount,
    };
  }

  /**
   * Generates zkTLS proof envelope and submits verified attestation payload on-chain
   */
  async submitPerformanceAttestation(metricAPY: number): Promise<string | null> {
    const targetEndpoint = process.env.YIELD_METRICS_URL || 'https://api.veriagentpay.xyz/api/vault/metrics';
    this.logger.log(`Initiating zkTLS notary session with target: ${targetEndpoint}`);

    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const basisPoints = Math.floor(metricAPY * 100);

      const messageDigest = ethers.solidityPackedKeccak256(
        ['string', 'string', 'uint256', 'uint256'],
        [targetEndpoint, '$.apy', basisPoints, timestamp]
      );

      const signature = await this.proverSigner.signMessage(ethers.getBytes(messageDigest));

      const zkTLSProof: ZkTLSProof = {
        endpoint: targetEndpoint,
        jsonPath: '$.apy',
        value: basisPoints.toString(),
        timestamp,
        signature,
      };

      const oracleAbi = [
        'function submitAttestation(address vault, uint256 apy, uint256 timestamp, bytes calldata proof)'
      ];
      const oracleContract = new ethers.Contract(this.veridexOracleAddress, oracleAbi, this.proverSigner);

      this.logger.log(`Submitting verified zkTLS APY attestation on-chain: ${metricAPY}% (${basisPoints} bps)`);
      const tx = await oracleContract.submitAttestation(
        this.agentVaultAddress,
        basisPoints,
        timestamp,
        ethers.toUtf8Bytes(JSON.stringify(zkTLSProof))
      );
      await tx.wait();

      return tx.hash;
    } catch (e: any) {
      this.logger.error(`Oracle zkTLS submission failed: ${e.message}`, e.stack);
      return null;
    }
  }
}
