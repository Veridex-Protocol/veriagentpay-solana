import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Keypair, PublicKey } from '@solana/web3.js';
import * as crypto from 'crypto';
import {
  base64UrlToBytes,
  bytesToBase64Url,
  createGrantSessionInstruction,
  createInitializeVaultAndGrantSessionInstruction,
  createPasskeyTransferInstruction,
  createSolPasskeyTransferInstruction,
  createCancelSolPaymentLinkWithPasskeyInstruction,
  createSolPaymentLinkWithPasskeyInstruction,
  clusterDomainFromGenesisHash,
  deriveSession,
  initializeVaultAndGrantSessionChallenge,
  solPaymentLinkChallenge,
  solTransferChallenge,
  cancelSolPaymentLinkChallenge,
  sessionGrantChallenge,
  transferChallenge,
  SESSION_ACTION_TRANSFER,
} from '@veriagent/chain-solana';

import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../core/redis.service';
import { SolanaChainService } from '../chains/solana/solana-chain.service';
import {
  bytes32FromStored,
  compressedP256PublicKey,
} from '../chains/solana/solana-account';
import {
  base64UrlToBuffer,
  bufferToBase64Url,
} from './passkey-signature.util';
import { SolanaRelayerService } from './solana-relayer.service';

const PREPARE_TTL_MS = 5 * 60 * 1000;
type ActionKind = 'transfer' | 'sol_transfer' | 'sol_payment_link' | 'sol_payment_link_cancel' | 'session_grant';

interface PreparedAction {
  userId: string;
  vaultAddress: string;
  challengeB64Url: string;
  kind: ActionKind;
  expiresAtUnix: string;
  payload: Record<string, string | number | boolean>;
  meta?: { sessionKeyId?: string };
  summary: Record<string, unknown>;
}

@Injectable()
export class SolanaPasskeyExecutionService {
  private readonly logger = new Logger(SolanaPasskeyExecutionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly relayer: SolanaRelayerService,
    private readonly solana: SolanaChainService,
  ) {}

  async prepareTransfer(params: {
    userId: string;
    recipientAddress: string;
    tokenAddress: string;
    tokenDecimals: number;
    tokenSymbol: string;
    amount: number;
    toLabel: string;
  }) {
    if (params.tokenSymbol.toUpperCase() === 'SOL') {
      return this.prepareSolTransfer({
        userId: params.userId,
        recipientAddress: params.recipientAddress,
        amount: params.amount,
        toLabel: params.toLabel,
      });
    }
    if (params.tokenAddress !== this.solana.stablecoinMint.toBase58() || params.tokenDecimals !== 6) {
      throw new BadRequestException('The Solana edition supports native USDC only');
    }
    const user = await this.userWithWallet(params.userId);
    const vaultState = await this.solana.readVault(user.smartWallet.address);
    if (!vaultState) throw new BadRequestException('Authorize your Solana vault before sending');
    const expiresAtUnix = BigInt(Math.floor((Date.now() + PREPARE_TTL_MS) / 1000));
    const amountAtomic = amountToAtomic(params.amount);
    const vault = new PublicKey(user.smartWallet.address);
    const destination = this.solana.recipientTokenAccount(params.recipientAddress);
    const challenge = transferChallenge({
      clusterDomain: clusterDomain(),
      programId: this.solana.programId,
      config: this.solana.configAddress,
      vault,
      vaultTokenAccount: this.solana.vaultTokenAccount(user.smartWallet.address),
      destinationTokenAccount: destination,
      stablecoinMint: this.solana.stablecoinMint,
      amount: amountAtomic,
      vaultNonce: vaultState.nonce,
      expiresAtUnix,
    });
    return this.stage({
      userId: params.userId,
      vaultAddress: user.smartWallet.address,
      challengeB64Url: bytesToBase64Url(challenge),
      kind: 'transfer',
      expiresAtUnix: expiresAtUnix.toString(),
      payload: {
        recipientAddress: params.recipientAddress,
        destinationTokenAccount: destination.toBase58(),
        amountAtomic: amountAtomic.toString(),
        vaultNonce: vaultState.nonce.toString(),
      },
      summary: { to: params.toLabel, token: params.tokenSymbol, amount: params.amount },
    });
  }

  async prepareSolTransfer(params: {
    userId: string;
    recipientAddress: string;
    amount: number;
    toLabel: string;
  }) {
    const user = await this.userWithWallet(params.userId);
    const vaultState = await this.solana.readVault(user.smartWallet.address);
    if (!vaultState) throw new BadRequestException('Authorize your Solana vault before sending');
    const expiresAtUnix = BigInt(Math.floor((Date.now() + PREPARE_TTL_MS) / 1000));
    const amountLamports = solToLamports(params.amount);
    const vault = new PublicKey(user.smartWallet.address);
    const recipient = new PublicKey(params.recipientAddress);
    const challenge = solTransferChallenge({
      clusterDomain: clusterDomain(),
      programId: this.solana.programId,
      config: this.solana.configAddress,
      vault,
      recipient,
      amountLamports,
      vaultNonce: vaultState.nonce,
      expiresAtUnix,
    });
    return this.stage({
      userId: params.userId,
      vaultAddress: user.smartWallet.address,
      challengeB64Url: bytesToBase64Url(challenge),
      kind: 'sol_transfer',
      expiresAtUnix: expiresAtUnix.toString(),
      payload: {
        recipientAddress: recipient.toBase58(),
        amountLamports: amountLamports.toString(),
        vaultNonce: vaultState.nonce.toString(),
      },
      summary: { to: params.toLabel, token: 'SOL', amount: params.amount },
    });
  }

  async prepareSolPaymentLink(params: {
    userId: string;
    recipientHandle: string;
    platform: string;
    amount: number;
    fromUser?: string;
  }) {
    const user = await this.userWithWallet(params.userId);
    const vaultState = await this.solana.readVault(user.smartWallet.address);
    if (!vaultState) throw new BadRequestException('Authorize your Solana vault before sending');
    const expiresAtUnix = BigInt(Math.floor((Date.now() + PREPARE_TTL_MS) / 1000));
    const linkExpiresAtUnix = BigInt(Math.floor(Date.now() / 1000) + 24 * 60 * 60);
    const amountLamports = solToLamports(params.amount);
    const targetHandle = normalizeHandle(params.recipientHandle);
    const shortLink = await this.relayer.createPendingSolPaymentLink({
      userId: user.id,
      recipientHandle: targetHandle,
      platform: params.platform,
      amount: params.amount,
      fromUser: params.fromUser || user.username || 'sender',
      expiresAt: new Date(Number(linkExpiresAtUnix) * 1000),
    });
    const linkId = crypto.createHash('sha256').update(shortLink.code).digest();
    const recipientCommitment = paymentLinkRecipientCommitment(params.platform, targetHandle);
    const vault = new PublicKey(user.smartWallet.address);
    const paymentLink = this.solana.paymentLinkAddress(user.smartWallet.address, linkId);
    const challenge = solPaymentLinkChallenge({
      clusterDomain: clusterDomain(),
      programId: this.solana.programId,
      config: this.solana.configAddress,
      vault,
      paymentLink,
      linkId,
      recipientCommitment,
      amountLamports,
      linkExpiresAtUnix,
      vaultNonce: vaultState.nonce,
      proofExpiresAtUnix: expiresAtUnix,
    });
    return {
      ...(await this.stage({
        userId: params.userId,
        vaultAddress: user.smartWallet.address,
        challengeB64Url: bytesToBase64Url(challenge),
        kind: 'sol_payment_link',
        expiresAtUnix: expiresAtUnix.toString(),
        payload: {
          code: shortLink.code,
          paymentLink: paymentLink.toBase58(),
          linkId: bytesToBase64Url(linkId),
          recipientCommitment: bytesToBase64Url(recipientCommitment),
          amountLamports: amountLamports.toString(),
          linkExpiresAtUnix: linkExpiresAtUnix.toString(),
          vaultNonce: vaultState.nonce.toString(),
        },
        summary: { to: params.recipientHandle, token: 'SOL', amount: params.amount },
      })),
      code: shortLink.code,
      shortUrl: shortLink.shortUrl,
    };
  }

  async prepareCancelSolPaymentLink(params: { userId: string; code: string }) {
    const link = await this.relayer.findOwnedSolPaymentLink(params.code, params.userId);
    const user = await this.userWithWallet(params.userId);
    const vaultState = await this.solana.readVault(user.smartWallet.address);
    if (!vaultState) throw new BadRequestException('Authorize your Solana vault before cancelling');
    const expiresAtUnix = BigInt(Math.floor((Date.now() + PREPARE_TTL_MS) / 1000));
    const vault = new PublicKey(user.smartWallet.address);
    const paymentLink = new PublicKey(link.envelopeId!);
    const challenge = cancelSolPaymentLinkChallenge({
      clusterDomain: clusterDomain(),
      programId: this.solana.programId,
      config: this.solana.configAddress,
      vault,
      paymentLink,
      vaultNonce: vaultState.nonce,
      proofExpiresAtUnix: expiresAtUnix,
    });
    return this.stage({
      userId: params.userId,
      vaultAddress: user.smartWallet.address,
      challengeB64Url: bytesToBase64Url(challenge),
      kind: 'sol_payment_link_cancel',
      expiresAtUnix: expiresAtUnix.toString(),
      payload: {
        code: link.code,
        paymentLink: paymentLink.toBase58(),
        vaultNonce: vaultState.nonce.toString(),
      },
      summary: { code: link.code, token: 'SOL', amount: link.amount },
    });
  }

  async prepareSessionGrant(params: {
    userId: string;
    durationHours?: number;
    durationDays?: number;
    perTxLimitUSD?: number;
    dailyLimitUSD?: number;
  }) {
    const user = await this.userWithWallet(params.userId);
    const durationHours = params.durationHours ?? (params.durationDays ?? 7) * 24;
    const perTxLimitUSD = params.perTxLimitUSD ?? 50;
    const dailyLimitUSD = params.dailyLimitUSD ?? 200;
    if (durationHours <= 0 || durationHours > 24 * 30) {
      throw new BadRequestException('Session duration must be between 1 hour and 30 days');
    }
    if (perTxLimitUSD <= 0 || dailyLimitUSD < perTxLimitUSD) {
      throw new BadRequestException('Session limits are invalid');
    }
    const durationSeconds = Math.round(durationHours * 3600);
    const provisioned = await this.relayer.provisionSessionKey(
      params.userId,
      user.smartWallet.address,
      durationSeconds,
      amountToAtomic(perTxLimitUSD),
      perTxLimitUSD,
      dailyLimitUSD,
    );
    const sessionPublicKey = new PublicKey(provisioned.sessionPublicKey);
    const vault = new PublicKey(user.smartWallet.address);
    const session = deriveSession(vault, sessionPublicKey, this.solana.programId);
    const now = BigInt(Math.floor(Date.now() / 1000));
    const validUntilUnix = now + BigInt(durationSeconds);
    const expiresAtUnix = BigInt(Math.floor((Date.now() + PREPARE_TTL_MS) / 1000));
    const perActionLimit = amountToAtomic(perTxLimitUSD);
    const cumulativeLimit = amountToAtomic(dailyLimitUSD);
    const vaultState = await this.solana.readVault(user.smartWallet.address);
    const common = {
      clusterDomain: clusterDomain(),
      programId: this.solana.programId,
      config: this.solana.configAddress,
      vault,
      session,
      sessionPublicKey,
      actionBitmap: SESSION_ACTION_TRANSFER,
      perActionLimit,
      cumulativeLimit,
      validAfterUnix: now,
      validUntilUnix,
      expiresAtUnix,
    };
    const challenge = vaultState
      ? sessionGrantChallenge({ ...common, vaultNonce: vaultState.nonce })
      : initializeVaultAndGrantSessionChallenge({
          ...common,
          vaultTokenAccount: this.solana.vaultTokenAccount(user.smartWallet.address),
          stablecoinMint: this.solana.stablecoinMint,
          rootPublicKey: compressedP256PublicKey(
            user.smartWallet.publicKeyX,
            user.smartWallet.publicKeyY,
          ),
          rootKeyHash: bytes32FromStored(user.smartWallet.salt === ''
            ? `0x${Buffer.alloc(32).toString('hex')}`
            : rootHashFromWallet(user.smartWallet.publicKeyX, user.smartWallet.publicKeyY)),
          userSalt: bytes32FromStored(user.smartWallet.salt),
        });
    return {
      ...(await this.stage({
        userId: params.userId,
        vaultAddress: user.smartWallet.address,
        challengeB64Url: bytesToBase64Url(challenge),
        kind: 'session_grant',
        expiresAtUnix: expiresAtUnix.toString(),
        payload: {
          initializeVault: !vaultState,
          session: session.toBase58(),
          sessionPublicKey: sessionPublicKey.toBase58(),
          actionBitmap: SESSION_ACTION_TRANSFER,
          perActionLimit: perActionLimit.toString(),
          cumulativeLimit: cumulativeLimit.toString(),
          validAfterUnix: now.toString(),
          validUntilUnix: validUntilUnix.toString(),
          vaultNonce: (vaultState?.nonce ?? 0n).toString(),
        },
        meta: { sessionKeyId: provisioned.sessionKeyId },
        summary: { durationHours, perTxLimitUSD, dailyLimitUSD },
      })),
      sessionKeyId: provisioned.sessionKeyId,
    };
  }

  async preparePolicyUpdate() {
    throw new BadRequestException('Solana call policy is encoded in each bounded session grant');
  }

  async prepareTokenLimit() {
    throw new BadRequestException('The Solana edition supports one USDC policy per session');
  }

  async executeAction(params: {
    userId: string;
    prepareId: string;
    assertion: {
      id: string;
      response: { authenticatorData: string; clientDataJSON: string; signature: string };
    };
  }): Promise<{ txHash: string; success: true; kind: ActionKind; code?: string; shortUrl?: string; summary?: Record<string, unknown> }> {
    const prepared = await this.redis.takeJson<PreparedAction>(`passkey:prepare:${params.prepareId}`);
    if (!prepared) throw new BadRequestException('Approval expired or was already used');
    if (prepared.userId !== params.userId) {
      throw new UnauthorizedException('This approval belongs to another account');
    }
    const clientDataJson = base64UrlToBuffer(params.assertion.response.clientDataJSON);
    const clientData = JSON.parse(clientDataJson.toString('utf8'));
    if (clientData.challenge !== prepared.challengeB64Url) {
      throw new UnauthorizedException('Signature does not authorize this action');
    }
    const credential = await this.prisma.passkeyCredential.findUnique({
      where: { lookupHash: crypto.createHash('sha256').update(params.assertion.id).digest('hex') },
    });
    if (!credential || credential.userId !== params.userId || credential.revokedAt) {
      throw new UnauthorizedException('Passkey is not registered for this account');
    }
    const user = await this.userWithWallet(params.userId);
    const proof = {
      compressedPublicKey: compressedP256PublicKey(
        user.smartWallet.publicKeyX,
        user.smartWallet.publicKeyY,
      ),
      authenticatorData: base64UrlToBytes(params.assertion.response.authenticatorData),
      clientDataJson: base64UrlToBytes(params.assertion.response.clientDataJSON),
      signatureDer: base64UrlToBytes(params.assertion.response.signature),
    };
    const expiresAtUnix = BigInt(prepared.expiresAtUnix);
    let instruction;
    let beforeVerification = [];
    if (prepared.kind === 'transfer') {
      instruction = createPasskeyTransferInstruction({
        payer: this.solana.feePayer.publicKey,
        config: this.solana.configAddress,
        vault: new PublicKey(prepared.vaultAddress),
        stablecoinMint: this.solana.stablecoinMint,
        vaultTokenAccount: this.solana.vaultTokenAccount(prepared.vaultAddress),
        destinationTokenAccount: new PublicKey(String(prepared.payload.destinationTokenAccount)),
        amount: BigInt(String(prepared.payload.amountAtomic)),
        vaultNonce: BigInt(String(prepared.payload.vaultNonce)),
        proofExpiresAt: expiresAtUnix,
        authenticatorData: proof.authenticatorData,
        clientDataJson: proof.clientDataJson,
        programId: this.solana.programId,
      });
      beforeVerification = [
        this.solana.createRecipientAtaInstruction(String(prepared.payload.recipientAddress)),
      ];
    } else if (prepared.kind === 'sol_transfer') {
      instruction = createSolPasskeyTransferInstruction({
        payer: this.solana.feePayer.publicKey,
        config: this.solana.configAddress,
        vault: new PublicKey(prepared.vaultAddress),
        recipient: new PublicKey(String(prepared.payload.recipientAddress)),
        amountLamports: BigInt(String(prepared.payload.amountLamports)),
        vaultNonce: BigInt(String(prepared.payload.vaultNonce)),
        proofExpiresAt: expiresAtUnix,
        authenticatorData: proof.authenticatorData,
        clientDataJson: proof.clientDataJson,
        programId: this.solana.programId,
      });
    } else if (prepared.kind === 'sol_payment_link') {
      instruction = createSolPaymentLinkWithPasskeyInstruction({
        payer: this.solana.feePayer.publicKey,
        config: this.solana.configAddress,
        vault: new PublicKey(prepared.vaultAddress),
        paymentLink: new PublicKey(String(prepared.payload.paymentLink)),
        linkId: base64UrlToBytes(String(prepared.payload.linkId)),
        recipientCommitment: base64UrlToBytes(String(prepared.payload.recipientCommitment)),
        amountLamports: BigInt(String(prepared.payload.amountLamports)),
        linkExpiresAtUnix: BigInt(String(prepared.payload.linkExpiresAtUnix)),
        vaultNonce: BigInt(String(prepared.payload.vaultNonce)),
        proofExpiresAt: expiresAtUnix,
        authenticatorData: proof.authenticatorData,
        clientDataJson: proof.clientDataJson,
        programId: this.solana.programId,
      });
    } else if (prepared.kind === 'sol_payment_link_cancel') {
      instruction = createCancelSolPaymentLinkWithPasskeyInstruction({
        payer: this.solana.feePayer.publicKey,
        config: this.solana.configAddress,
        vault: new PublicKey(prepared.vaultAddress),
        paymentLink: new PublicKey(String(prepared.payload.paymentLink)),
        vaultNonce: BigInt(String(prepared.payload.vaultNonce)),
        proofExpiresAt: expiresAtUnix,
        authenticatorData: proof.authenticatorData,
        clientDataJson: proof.clientDataJson,
        programId: this.solana.programId,
      });
    } else {
      const sessionPublicKey = new PublicKey(String(prepared.payload.sessionPublicKey));
      const shared = {
        payer: this.solana.feePayer.publicKey,
        config: this.solana.configAddress,
        vault: new PublicKey(prepared.vaultAddress),
        session: new PublicKey(String(prepared.payload.session)),
        sessionPublicKey,
        actionBitmap: Number(prepared.payload.actionBitmap),
        perActionLimit: BigInt(String(prepared.payload.perActionLimit)),
        cumulativeLimit: BigInt(String(prepared.payload.cumulativeLimit)),
        validAfterUnix: BigInt(String(prepared.payload.validAfterUnix)),
        validUntilUnix: BigInt(String(prepared.payload.validUntilUnix)),
        proofExpiresAt: expiresAtUnix,
        authenticatorData: proof.authenticatorData,
        clientDataJson: proof.clientDataJson,
        programId: this.solana.programId,
      };
      instruction = prepared.payload.initializeVault
        ? createInitializeVaultAndGrantSessionInstruction({
            ...shared,
            stablecoinMint: this.solana.stablecoinMint,
            vaultTokenAccount: this.solana.vaultTokenAccount(prepared.vaultAddress),
            rootPublicKey: proof.compressedPublicKey,
            rootKeyHash: rootHashBytes(user.smartWallet.publicKeyX, user.smartWallet.publicKeyY),
            userSalt: bytes32FromStored(user.smartWallet.salt),
          })
        : createGrantSessionInstruction({
            ...shared,
            vaultNonce: BigInt(String(prepared.payload.vaultNonce)),
          });
    }
    let confirmed;
    try {
      confirmed = await this.solana.submitPasskeyInstruction({
        proof,
        instruction,
        beforeVerification,
      });
    } catch (error) {
      if (prepared.kind === 'sol_payment_link') {
        await this.relayer.failPendingSolPaymentLink(String(prepared.payload.code));
      }
      throw error;
    }
    if (prepared.kind === 'sol_payment_link') {
      await this.relayer.activateSolPaymentLink({
        code: String(prepared.payload.code),
        paymentLinkAddress: String(prepared.payload.paymentLink),
        fundingTxHash: confirmed.signature,
      });
    } else if (prepared.kind === 'sol_payment_link_cancel') {
      await this.relayer.markSolPaymentLinkCancelled({
        code: String(prepared.payload.code),
        transactionHash: confirmed.signature,
      });
    }
    await this.prisma.$transaction([
      this.prisma.passkeyCredential.update({
        where: { id: credential.id },
        data: { lastUsedAt: new Date() },
      }),
      this.prisma.smartWallet.update({
        where: { userId: params.userId },
        data: { isDeployed: true, derivationVersion: 'SOLANA_PDA_V1' },
      }),
      ...(prepared.kind === 'session_grant' && prepared.meta?.sessionKeyId
        ? [this.prisma.sessionKey.update({
            where: { id: prepared.meta.sessionKeyId },
            data: { activatedAt: new Date() },
          })]
        : []),
    ]);
    this.logger.log(`Solana ${prepared.kind} confirmed: ${confirmed.signature}`);
    return {
      txHash: confirmed.signature,
      success: true,
      kind: prepared.kind,
      summary: prepared.summary,
      ...(prepared.kind === 'sol_payment_link'
        ? {
            code: String(prepared.payload.code),
            shortUrl: `${process.env.PUBLIC_APP_URL?.replace(/\/$/, '')}/c/${String(prepared.payload.code)}`,
          }
        : {}),
    };
  }

  private async stage(prepared: Omit<PreparedAction, never>) {
    const prepareId = crypto.randomUUID();
    await this.redis.setJson(`passkey:prepare:${prepareId}`, prepared, PREPARE_TTL_MS);
    return {
      prepareId,
      challengeB64Url: prepared.challengeB64Url,
      vaultAddress: prepared.vaultAddress,
      expiresAt: new Date(Number(prepared.expiresAtUnix) * 1000).toISOString(),
    };
  }

  private async userWithWallet(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { smartWallet: true },
    });
    if (!user?.smartWallet) throw new NotFoundException('No smart wallet for this account');
    return user as typeof user & { smartWallet: NonNullable<typeof user.smartWallet> };
  }
}

function amountToAtomic(amount: number): bigint {
  if (!Number.isFinite(amount) || amount <= 0) throw new BadRequestException('Amount must be positive');
  return BigInt(amount.toFixed(6).replace('.', ''));
}

function solToLamports(amount: number): bigint {
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) {
    throw new BadRequestException('SOL amount must be positive and finite');
  }
  return BigInt(amount.toFixed(9).replace('.', ''));
}

function normalizeHandle(value: string): string {
  return value.trim().replace(/^@/, '').toLowerCase();
}

function paymentLinkRecipientCommitment(platform: string, handle: string): Buffer {
  return crypto.createHash('sha256')
    .update('veriagent:solana:payment-link-recipient:v1\0')
    .update(platform.toLowerCase())
    .update('\0')
    .update(normalizeHandle(handle))
    .digest();
}

function clusterDomain(): Uint8Array {
  const configured = process.env.SOLANA_CLUSTER_DOMAIN;
  if (!configured) throw new Error('SOLANA_CLUSTER_DOMAIN is required');
  return clusterDomainFromGenesisHash(configured);
}

function rootHashBytes(publicKeyX: string, publicKeyY: string): Buffer {
  return crypto.createHash('sha256')
    .update(compressedP256PublicKey(publicKeyX, publicKeyY))
    .digest();
}

function rootHashFromWallet(publicKeyX: string, publicKeyY: string): string {
  return `0x${rootHashBytes(publicKeyX, publicKeyY).toString('hex')}`;
}