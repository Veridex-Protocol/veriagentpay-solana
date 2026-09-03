import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import {
  Commitment,
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import {
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
  getAccount,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import {
  createCancelPaymentLinkWithSessionInstruction,
  createClaimPaymentLinkInstruction,
  createPaymentLinkWithSessionInstruction,
  createRefundExpiredPaymentLinkInstruction,
  createClaimSolPaymentLinkInstruction,
  createRefundExpiredSolPaymentLinkInstruction,
  createSecp256r1Instruction,
  createSessionTransferInstruction,
  decodePaymentLinkAccount,
  decodeSessionAccount,
  decodeVaultAccount,
  deriveClaimAuthorityConfig,
  derivePaymentLink,
  derivePaymentLinkTokenAccount,
  deriveProtocolConfig,
  deriveSession,
  feePayerFromSecret,
} from '@veriagent/chain-solana';

import {
  SOLANA_PROGRAM_ID,
  SOLANA_USDC_MINT,
  isSolanaAddress,
} from './solana-account';

export interface SolanaWebAuthnProof {
  compressedPublicKey: Uint8Array;
  authenticatorData: Uint8Array;
  clientDataJson: Uint8Array;
  signatureDer: Uint8Array;
}

export interface ConfirmedSolanaTransaction {
  signature: string;
  slot: number;
}

@Injectable()
export class SolanaChainService {
  private readonly logger = new Logger(SolanaChainService.name);
  readonly connection: Connection;
  readonly programId = SOLANA_PROGRAM_ID;
  readonly stablecoinMint = SOLANA_USDC_MINT;
  readonly configAddress = deriveProtocolConfig(this.programId);
  readonly claimAuthorityConfigAddress = deriveClaimAuthorityConfig(this.programId);
  readonly commitment: Commitment;
  private feePayerKeypair?: Keypair;

  constructor() {
    this.commitment = process.env.SOLANA_COMMITMENT === 'finalized' ? 'finalized' : 'confirmed';
    this.connection = new Connection(
      process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
      this.commitment,
    );
  }

  get feePayer(): Keypair {
    if (this.feePayerKeypair) return this.feePayerKeypair;
    const secretFile = process.env.SOLANA_FEE_PAYER_KEYPAIR_FILE;
    const secret = process.env.SOLANA_FEE_PAYER_KEYPAIR
      || (secretFile ? readFileSync(secretFile, 'utf8') : undefined);
    if (!secret) {
      throw new Error(
        'SOLANA_FEE_PAYER_KEYPAIR or SOLANA_FEE_PAYER_KEYPAIR_FILE is required for sponsored transactions',
      );
    }
    this.feePayerKeypair = feePayerFromSecret(secret);
    return this.feePayerKeypair;
  }

  async getFeePayerBalance(): Promise<{ address: string; lamports: bigint; sol: string }> {
    const address = this.feePayer.publicKey;
    const lamports = BigInt(await this.connection.getBalance(address, this.commitment));
    return {
      address: address.toBase58(),
      lamports,
      sol: formatLamports(lamports),
    };
  }

  async readVault(address: string) {
    const publicKey = this.publicKey(address, 'vault');
    const account = await this.connection.getAccountInfo(publicKey, this.commitment);
    if (!account) return null;
    if (!account.owner.equals(this.programId)) {
      if (account.owner.equals(SystemProgram.programId) && account.data.length === 0) {
        return null;
      }
      throw new BadRequestException('Vault address is not owned by the VeriAgent Solana program');
    }
    return decodeVaultAccount(account.data);
  }

  async readSession(vaultAddress: string, sessionPublicKey: string) {
    const vault = this.publicKey(vaultAddress, 'vault');
    const signer = this.publicKey(sessionPublicKey, 'session public key');
    const address = deriveSession(vault, signer, this.programId);
    const account = await this.connection.getAccountInfo(address, this.commitment);
    if (!account) return null;
    if (!account.owner.equals(this.programId)) {
      throw new BadRequestException('Session address is not owned by the VeriAgent Solana program');
    }
    return { address, state: decodeSessionAccount(account.data) };
  }

  async readPaymentLink(address: string) {
    const publicKey = this.publicKey(address, 'payment link');
    const account = await this.connection.getAccountInfo(publicKey, this.commitment);
    if (!account) return null;
    if (!account.owner.equals(this.programId)) {
      throw new BadRequestException('Payment link is not owned by the VeriAgent Solana program');
    }
    return decodePaymentLinkAccount(account.data);
  }

  vaultTokenAccount(vaultAddress: string): PublicKey {
    return getAssociatedTokenAddressSync(
      this.stablecoinMint,
      this.publicKey(vaultAddress, 'vault'),
      true,
      TOKEN_PROGRAM_ID,
    );
  }

  recipientTokenAccount(recipientAddress: string): PublicKey {
    return getAssociatedTokenAddressSync(
      this.stablecoinMint,
      this.publicKey(recipientAddress, 'recipient'),
      true,
      TOKEN_PROGRAM_ID,
    );
  }

  async getVaultUsdcBalance(vaultAddress: string): Promise<bigint> {
    try {
      const account = await getAccount(
        this.connection,
        this.vaultTokenAccount(vaultAddress),
        this.commitment,
        TOKEN_PROGRAM_ID,
      );
      return account.amount;
    } catch (error: any) {
      if (error?.name === 'TokenAccountNotFoundError') return 0n;
      throw error;
    }
  }

  async getVaultSolBalance(vaultAddress: string): Promise<bigint> {
    const address = this.publicKey(vaultAddress, 'vault');
    return BigInt(await this.connection.getBalance(address, this.commitment));
  }

  createRecipientAtaInstruction(recipientAddress: string): TransactionInstruction {
    const recipient = this.publicKey(recipientAddress, 'recipient');
    return createAssociatedTokenAccountIdempotentInstruction(
      this.feePayer.publicKey,
      this.recipientTokenAccount(recipientAddress),
      recipient,
      this.stablecoinMint,
      TOKEN_PROGRAM_ID,
    );
  }

  async submitPasskeyInstruction(params: {
    proof: SolanaWebAuthnProof;
    instruction: TransactionInstruction;
    beforeVerification?: TransactionInstruction[];
  }): Promise<ConfirmedSolanaTransaction> {
    const verification = createSecp256r1Instruction(params.proof);
    return this.submit(
      [...(params.beforeVerification || []), verification, params.instruction],
      [],
    );
  }

  async transferWithSession(params: {
    vaultAddress: string;
    recipientAddress: string;
    sessionKeypair: Keypair;
    amount: bigint;
    sessionNonce: bigint;
  }): Promise<ConfirmedSolanaTransaction> {
    const vault = this.publicKey(params.vaultAddress, 'vault');
    const session = deriveSession(vault, params.sessionKeypair.publicKey, this.programId);
    const transfer = createSessionTransferInstruction({
      config: this.configAddress,
      vault,
      session,
      sessionSigner: params.sessionKeypair.publicKey,
      stablecoinMint: this.stablecoinMint,
      vaultTokenAccount: this.vaultTokenAccount(params.vaultAddress),
      destinationTokenAccount: this.recipientTokenAccount(params.recipientAddress),
      amount: params.amount,
      sessionNonce: params.sessionNonce,
      programId: this.programId,
    });
    return this.submit(
      [this.createRecipientAtaInstruction(params.recipientAddress), transfer],
      [params.sessionKeypair],
    );
  }

  paymentLinkAddress(vaultAddress: string, linkId: Uint8Array): PublicKey {
    return derivePaymentLink(this.publicKey(vaultAddress, 'vault'), linkId, this.programId);
  }

  async createPaymentLinkWithSession(params: {
    vaultAddress: string;
    sessionKeypair: Keypair;
    linkId: Uint8Array;
    recipientCommitment: Uint8Array;
    amount: bigint;
    expiresAtUnix: bigint;
    sessionNonce: bigint;
  }): Promise<ConfirmedSolanaTransaction & { paymentLink: string }> {
    const vault = this.publicKey(params.vaultAddress, 'vault');
    const session = deriveSession(vault, params.sessionKeypair.publicKey, this.programId);
    const paymentLink = derivePaymentLink(vault, params.linkId, this.programId);
    const instruction = createPaymentLinkWithSessionInstruction({
      payer: this.feePayer.publicKey,
      config: this.configAddress,
      vault,
      session,
      sessionSigner: params.sessionKeypair.publicKey,
      stablecoinMint: this.stablecoinMint,
      vaultTokenAccount: this.vaultTokenAccount(params.vaultAddress),
      paymentLink,
      escrowTokenAccount: derivePaymentLinkTokenAccount(paymentLink, this.stablecoinMint),
      linkId: params.linkId,
      recipientCommitment: params.recipientCommitment,
      amount: params.amount,
      expiresAtUnix: params.expiresAtUnix,
      sessionNonce: params.sessionNonce,
      programId: this.programId,
    });
    return {
      ...(await this.submit([instruction], [params.sessionKeypair])),
      paymentLink: paymentLink.toBase58(),
    };
  }

  async claimPaymentLink(params: {
    paymentLinkAddress: string;
    recipientVaultAddress: string;
  }): Promise<ConfirmedSolanaTransaction> {
    const paymentLink = this.publicKey(params.paymentLinkAddress, 'payment link');
    const recipientVault = this.publicKey(params.recipientVaultAddress, 'recipient vault');
    const instruction = createClaimPaymentLinkInstruction({
      claimAuthority: this.feePayer.publicKey,
      config: this.configAddress,
      claimAuthorityConfig: this.claimAuthorityConfigAddress,
      recipientVault,
      paymentLink,
      stablecoinMint: this.stablecoinMint,
      escrowTokenAccount: derivePaymentLinkTokenAccount(paymentLink, this.stablecoinMint),
      destinationTokenAccount: this.recipientTokenAccount(params.recipientVaultAddress),
      programId: this.programId,
    });
    return this.submit([instruction], []);
  }

  async claimSolPaymentLink(params: {
    paymentLinkAddress: string;
    recipientVaultAddress: string;
  }): Promise<ConfirmedSolanaTransaction> {
    const paymentLink = this.publicKey(params.paymentLinkAddress, 'payment link');
    const instruction = createClaimSolPaymentLinkInstruction({
      claimAuthority: this.feePayer.publicKey,
      config: this.configAddress,
      claimAuthorityConfig: this.claimAuthorityConfigAddress,
      recipientVault: this.publicKey(params.recipientVaultAddress, 'recipient vault'),
      paymentLink,
      programId: this.programId,
    });
    return this.submit([instruction], []);
  }

  async cancelPaymentLinkWithSession(params: {
    vaultAddress: string;
    paymentLinkAddress: string;
    sessionKeypair: Keypair;
    sessionNonce: bigint;
  }): Promise<ConfirmedSolanaTransaction> {
    const vault = this.publicKey(params.vaultAddress, 'vault');
    const paymentLink = this.publicKey(params.paymentLinkAddress, 'payment link');
    const session = deriveSession(vault, params.sessionKeypair.publicKey, this.programId);
    const instruction = createCancelPaymentLinkWithSessionInstruction({
      config: this.configAddress,
      vault,
      session,
      sessionSigner: params.sessionKeypair.publicKey,
      paymentLink,
      stablecoinMint: this.stablecoinMint,
      escrowTokenAccount: derivePaymentLinkTokenAccount(paymentLink, this.stablecoinMint),
      vaultTokenAccount: this.vaultTokenAccount(params.vaultAddress),
      sessionNonce: params.sessionNonce,
      programId: this.programId,
    });
    return this.submit([instruction], [params.sessionKeypair]);
  }

  async refundExpiredPaymentLink(params: {
    senderVaultAddress: string;
    paymentLinkAddress: string;
  }): Promise<ConfirmedSolanaTransaction> {
    const senderVault = this.publicKey(params.senderVaultAddress, 'sender vault');
    const paymentLink = this.publicKey(params.paymentLinkAddress, 'payment link');
    const instruction = createRefundExpiredPaymentLinkInstruction({
      config: this.configAddress,
      senderVault,
      paymentLink,
      stablecoinMint: this.stablecoinMint,
      escrowTokenAccount: derivePaymentLinkTokenAccount(paymentLink, this.stablecoinMint),
      vaultTokenAccount: this.vaultTokenAccount(params.senderVaultAddress),
      programId: this.programId,
    });
    return this.submit([instruction], []);
  }

  async refundExpiredSolPaymentLink(params: {
    senderVaultAddress: string;
    paymentLinkAddress: string;
  }): Promise<ConfirmedSolanaTransaction> {
    const instruction = createRefundExpiredSolPaymentLinkInstruction({
      config: this.configAddress,
      senderVault: this.publicKey(params.senderVaultAddress, 'sender vault'),
      paymentLink: this.publicKey(params.paymentLinkAddress, 'payment link'),
      programId: this.programId,
    });
    return this.submit([instruction], []);
  }

  sessionKeypair(secret: string): Keypair {
    return feePayerFromSecret(secret);
  }

  encodeKeypair(keypair: Keypair): string {
    return Buffer.from(JSON.stringify(Array.from(keypair.secretKey)), 'utf8').toString('base64');
  }

  private async submit(
    instructions: TransactionInstruction[],
    additionalSigners: Keypair[],
  ): Promise<ConfirmedSolanaTransaction> {
    const latest = await this.connection.getLatestBlockhash(this.commitment);
    const message = new TransactionMessage({
      payerKey: this.feePayer.publicKey,
      recentBlockhash: latest.blockhash,
      instructions,
    }).compileToV0Message();
    const transaction = new VersionedTransaction(message);
    transaction.sign([this.feePayer, ...additionalSigners]);

    const simulation = await this.connection.simulateTransaction(transaction, {
      commitment: this.commitment,
      sigVerify: true,
    });
    if (simulation.value.err) {
      this.logger.error(
        `Solana simulation failed: ${JSON.stringify({
          error: simulation.value.err,
          logs: simulation.value.logs,
        })}`,
      );
      throw new BadRequestException('The Solana action failed simulation. No funds were moved.');
    }

    const signature = await this.connection.sendRawTransaction(transaction.serialize(), {
      maxRetries: 3,
      skipPreflight: false,
    });
    const confirmation = await this.connection.confirmTransaction(
      { signature, ...latest },
      this.commitment,
    );
    if (confirmation.value.err) {
      throw new BadRequestException('The Solana transaction was rejected. No success was recorded.');
    }
    return { signature, slot: confirmation.context.slot };
  }

  private publicKey(value: string, label: string): PublicKey {
    if (!isSolanaAddress(value)) {
      throw new BadRequestException(`${label} is not a valid Solana address`);
    }
    return new PublicKey(value);
  }
}

function formatLamports(lamports: bigint): string {
  const whole = lamports / 1_000_000_000n;
  const fraction = (lamports % 1_000_000_000n)
    .toString()
    .padStart(9, '0')
    .replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}