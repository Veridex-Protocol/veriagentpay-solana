import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { Keypair } from '@solana/web3.js';
import * as crypto from 'crypto';

import { PrismaService } from '../prisma/prisma.service';
import { HotStateService } from '../core/hot-state.service';
import { ActivityService } from '../activity/activity.service';
import { SolanaChainService } from '../chains/solana/solana-chain.service';
import { encryptSymmetric, decryptSymmetric } from './symmetric-crypto';
import { unwrapDataKey, wrapDataKey } from './key-wrapping';

function wrapContext(keyHash?: string): Record<string, string> {
  return keyHash ? { purpose: 'session-key', keyHash } : { purpose: 'session-key' };
}

@Injectable()
export class SolanaRelayerService {
  private readonly logger = new Logger(SolanaRelayerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly solana: SolanaChainService,
    @Optional() private readonly activityService?: ActivityService,
    @Optional() private readonly hotStateService?: HotStateService,
  ) {}

  async onModuleInit() {
    await this.checkRelayerBalance();
  }

  async checkRelayerBalance(): Promise<{
    address: string;
    balanceFormatted: string;
    isLow: boolean;
  }> {
    const balance = await this.solana.getFeePayerBalance();
    const minimum = BigInt(process.env.RELAYER_MIN_BALANCE_LAMPORTS || '50000000');
    const isLow = balance.lamports < minimum;
    if (isLow) {
      this.logger.warn(`Solana fee payer ${balance.address} is low: ${balance.sol} SOL`);
    }
    return {
      address: balance.address,
      balanceFormatted: balance.sol,
      isLow,
    };
  }

  async decryptSessionKey(sessionRecord: {
    encryptedKey: string;
    encryptedSymmetricKey?: string | null;
    keyHash?: string;
  }): Promise<string> {
    if (!sessionRecord.encryptedSymmetricKey) {
      throw new Error('Session key is missing its wrapped data key');
    }
    const symmetricKey = await unwrapDataKey(
      sessionRecord.encryptedSymmetricKey,
      wrapContext(sessionRecord.keyHash),
    );
    return decryptSymmetric(sessionRecord.encryptedKey, symmetricKey);
  }

  async provisionSessionKey(
    userId: string,
    _smartAccountAddress: string,
    durationSeconds: number,
    maxValueLimit: bigint,
    perTxLimitUSD = 50,
    dailyLimitUSD = 200,
  ) {
    const sessionKeypair = Keypair.generate();
    const sessionPublicKey = sessionKeypair.publicKey.toBase58();
    const sessionKeyHash = sessionPublicKey;
    const expiryAt = new Date(Date.now() + durationSeconds * 1000);
    const randomSymmetricKey = crypto.randomBytes(32).toString('hex');
    const encryptedKey = encryptSymmetric(
      this.solana.encodeKeypair(sessionKeypair),
      randomSymmetricKey,
    );
    const encryptedSymmetricKey = await wrapDataKey(
      randomSymmetricKey,
      wrapContext(sessionKeyHash),
    );
    const sessionRecord = await this.prisma.sessionKey.create({
      data: {
        userId,
        keyHash: sessionKeyHash,
        encryptedKey,
        encryptedSymmetricKey,
        credentialId: `solana:${sessionPublicKey}`,
        dailyLimitUSD,
        perTxLimitUSD,
        expiryAt,
      },
    });
    await this.hotStateService?.setSessionKey({
      id: sessionRecord.id,
      userId,
      keyHash: sessionKeyHash,
      encryptedKey,
      encryptedSymmetricKey,
      perTxLimitUSD,
      dailyLimitUSD,
      expiryAt,
    });
    await this.logAuditEvent(userId, 'SESSION_KEY_CREATED', {
      sessionPublicKey,
      expiryAt,
      dailyLimitUSD,
      perTxLimitUSD,
      chain: 'solana',
    }, 'SUCCESS');
    return {
      sessionKeyId: sessionRecord.id,
      sessionKeyHash,
      sessionPublicKey,
      expiryAt,
      maxValue: maxValueLimit.toString(),
      registerCalldata: '',
      setGlobalLimitCalldata: '',
    };
  }

  async revokeSessionKey(userId: string, sessionKeyHash: string) {
    const session = await this.prisma.sessionKey.findUnique({
      where: { keyHash: sessionKeyHash },
    });
    if (!session || session.userId !== userId) {
      throw new BadRequestException('Session key not found or unauthorized');
    }
    await this.prisma.sessionKey.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });
    await this.hotStateService?.revokeSessionKey(sessionKeyHash);
    await this.logAuditEvent(userId, 'SESSION_KEY_REVOKED', { sessionKeyHash }, 'SUCCESS');
    return { success: true, revokedAt: new Date() };
  }

  async executeSessionTransfer(params: {
    userId: string;
    vaultAddress: string;
    recipientAddress: string;
    encryptedSessionKey: string;
    txAmountUSD: number;
    skipBiometricCheck?: boolean;
  }): Promise<{ success: true; txHash: string }> {
    if (!params.skipBiometricCheck) {
      const user = await this.prisma.user.findUnique({
        where: { id: params.userId },
        select: { requireBiometricsAlways: true },
      });
      if (user?.requireBiometricsAlways) {
        const recent = await this.prisma.passkeyCredential.findFirst({
          where: {
            userId: params.userId,
            revokedAt: null,
            lastUsedAt: { gte: new Date(Date.now() - 120_000) },
          },
        });
        if (!recent) throw new ForbiddenException('Biometric authentication required');
      }
    }

    const sessionKeypair = this.solana.sessionKeypair(params.encryptedSessionKey);
    const sessionRecord = await this.prisma.sessionKey.findUnique({
      where: { keyHash: sessionKeypair.publicKey.toBase58() },
    });
    if (
      !sessionRecord ||
      sessionRecord.userId !== params.userId ||
      sessionRecord.revokedAt ||
      !sessionRecord.activatedAt ||
      sessionRecord.expiryAt <= new Date()
    ) {
      const error = new ForbiddenException('Session key is expired, revoked, or inactive');
      (error as any).code = 'SESSION_EXPIRED';
      throw error;
    }
    if (params.txAmountUSD > Number(sessionRecord.perTxLimitUSD)) {
      throw new ForbiddenException('Transaction exceeds the session per-payment limit');
    }
    const recent = await this.prisma.spendingRecord.aggregate({
      where: {
        sessionKeyId: sessionRecord.id,
        timestamp: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
      _sum: { amountUSD: true },
    });
    if (Number(recent._sum.amountUSD || 0) + params.txAmountUSD > Number(sessionRecord.dailyLimitUSD)) {
      throw new ForbiddenException('Transaction exceeds the session daily limit');
    }

    const session = await this.solana.readSession(
      params.vaultAddress,
      sessionKeypair.publicKey.toBase58(),
    );
    if (!session || session.state.revoked) {
      throw new ForbiddenException('Session grant is not active on Solana');
    }
    const amount = usdToAtomic(params.txAmountUSD);
    const balance = await this.solana.getVaultUsdcBalance(params.vaultAddress);
    if (balance < amount) {
      return Promise.reject(new BadRequestException('Insufficient USDC balance'));
    }
    const confirmed = await this.solana.transferWithSession({
      vaultAddress: params.vaultAddress,
      recipientAddress: params.recipientAddress,
      sessionKeypair,
      amount,
      sessionNonce: session.state.nonce,
    });
    await this.prisma.spendingRecord.create({
      data: {
        sessionKeyId: sessionRecord.id,
        amountUSD: params.txAmountUSD,
        txHash: confirmed.signature,
      },
    });
    await this.logAuditEvent(params.userId, 'PAYMENT_RELAYED', {
      vaultAddress: params.vaultAddress,
      recipientAddress: params.recipientAddress,
      amountUSD: params.txAmountUSD,
      slot: confirmed.slot,
      chain: 'solana',
    }, 'SUCCESS', confirmed.signature);
    return { success: true, txHash: confirmed.signature };
  }

  async executeLocalSessionAction(
    _userId: string,
    _vaultAddress: string,
    _sessionPrivateKey: string,
    _actionPayload: string,
    _txAmountUSD: number,
    _nonce: number,
  ) {
    throw new BadRequestException(
      'This feature has not yet been routed to its native Solana instruction.',
    );
  }

  async executeOwnerTransfer() {
    throw new BadRequestException('Use the passkey-prepared Solana transfer route');
  }

  async ensureVaultDeployed(vaultAddress: string): Promise<string> {
    const vault = await this.solana.readVault(vaultAddress);
    if (!vault) {
      throw new BadRequestException('The Solana vault must be authorized with your passkey first');
    }
    await this.prisma.smartWallet.updateMany({
      where: { address: vaultAddress, isDeployed: false },
      data: { isDeployed: true, derivationVersion: 'SOLANA_PDA_V1' },
    });
    return vaultAddress;
  }

  private async logAuditEvent(
    userId: string,
    action: string,
    details: any,
    status: string,
    txHash?: string,
  ) {
    await this.prisma.auditEvent.create({
      data: {
        userId,
        action,
        details,
        status,
        txHash: txHash || null,
        chainId: null,
      },
    }).catch((error) => this.logger.error(`Audit write failed: ${error.message}`));
  }
}

function usdToAtomic(amount: number): bigint {
  if (!Number.isFinite(amount) || amount <= 0) throw new BadRequestException('Invalid USDC amount');
  const normalized = amount.toFixed(6);
  const [whole, fraction = ''] = normalized.split('.');
  return BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'));
}