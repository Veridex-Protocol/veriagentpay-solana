import { sha256 } from "@noble/hashes/sha256";
import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Buffer } from "buffer";

import { concatBytes, encodeVector, i64Le, u64Le, utf8 } from "./bytes.js";
import {
  CLAIM_AUTHORITY_SEED,
  INSTRUCTIONS_SYSVAR_ID,
  PAYMENT_LINK_SEED,
  PROTOCOL_SEED,
  SESSION_SEED,
  VAULT_SEED,
  VERIAGENT_PROGRAM_ID,
} from "./constants.js";

const VAULT_NONCE_OFFSET = 8 + 1 + 1 + 33 + 32 + 32;
const VAULT_ACCOUNT_SIZE = VAULT_NONCE_OFFSET + 8 + 8;
const SESSION_NONCE_OFFSET = 8 + 1 + 1 + 1 + 32 + 32 + 2 + 8 + 8 + 8 + 8 + 8;
const SESSION_ACCOUNT_SIZE = SESSION_NONCE_OFFSET + 8;
const PAYMENT_LINK_AMOUNT_OFFSET = 8 + 1 + 1 + 1 + 32 + 32 + 32 + 32;
const PAYMENT_LINK_ACCOUNT_SIZE = PAYMENT_LINK_AMOUNT_OFFSET + 8 + 8 + 8 + 8 + 32;

export interface DecodedVault {
  version: number;
  bump: number;
  rootPublicKey: Uint8Array;
  rootKeyHash: Uint8Array;
  userSalt: Uint8Array;
  nonce: bigint;
  createdAt: bigint;
}

export interface InitializeVaultInstructionInput {
  payer: PublicKey;
  config: PublicKey;
  vault: PublicKey;
  stablecoinMint: PublicKey;
  vaultTokenAccount: PublicKey;
  rootPublicKey: Uint8Array;
  rootKeyHash: Uint8Array;
  userSalt: Uint8Array;
  proofExpiresAt: bigint;
  authenticatorData: Uint8Array;
  clientDataJson: Uint8Array;
  programId?: PublicKey;
}

export interface PasskeyTransferInstructionInput {
  payer: PublicKey;
  config: PublicKey;
  vault: PublicKey;
  stablecoinMint: PublicKey;
  vaultTokenAccount: PublicKey;
  destinationTokenAccount: PublicKey;
  amount: bigint;
  vaultNonce: bigint;
  proofExpiresAt: bigint;
  authenticatorData: Uint8Array;
  clientDataJson: Uint8Array;
  programId?: PublicKey;
}

export interface SessionGrantInstructionInput {
  payer: PublicKey;
  config: PublicKey;
  vault: PublicKey;
  session: PublicKey;
  sessionPublicKey: PublicKey;
  actionBitmap: number;
  perActionLimit: bigint;
  cumulativeLimit: bigint;
  validAfterUnix: bigint;
  validUntilUnix: bigint;
  vaultNonce: bigint;
  proofExpiresAt: bigint;
  authenticatorData: Uint8Array;
  clientDataJson: Uint8Array;
  programId?: PublicKey;
}

export interface InitializeVaultAndGrantSessionInstructionInput
  extends Omit<SessionGrantInstructionInput, "vaultNonce"> {
  stablecoinMint: PublicKey;
  vaultTokenAccount: PublicKey;
  rootPublicKey: Uint8Array;
  rootKeyHash: Uint8Array;
  userSalt: Uint8Array;
}

export interface SessionTransferInstructionInput {
  config: PublicKey;
  vault: PublicKey;
  session: PublicKey;
  sessionSigner: PublicKey;
  stablecoinMint: PublicKey;
  vaultTokenAccount: PublicKey;
  destinationTokenAccount: PublicKey;
  amount: bigint;
  sessionNonce: bigint;
  programId?: PublicKey;
}

export interface InitializeClaimAuthorityInstructionInput {
  protocolAuthority: PublicKey;
  config: PublicKey;
  claimAuthorityConfig: PublicKey;
  authority: PublicKey;
  programId?: PublicKey;
}

export interface CreatePaymentLinkWithSessionInstructionInput {
  payer: PublicKey;
  config: PublicKey;
  vault: PublicKey;
  session: PublicKey;
  sessionSigner: PublicKey;
  stablecoinMint: PublicKey;
  vaultTokenAccount: PublicKey;
  paymentLink: PublicKey;
  escrowTokenAccount: PublicKey;
  linkId: Uint8Array;
  recipientCommitment: Uint8Array;
  amount: bigint;
  expiresAtUnix: bigint;
  sessionNonce: bigint;
  programId?: PublicKey;
}

export interface ClaimPaymentLinkInstructionInput {
  claimAuthority: PublicKey;
  config: PublicKey;
  claimAuthorityConfig: PublicKey;
  recipientVault: PublicKey;
  paymentLink: PublicKey;
  stablecoinMint: PublicKey;
  escrowTokenAccount: PublicKey;
  destinationTokenAccount: PublicKey;
  programId?: PublicKey;
}

export interface CancelPaymentLinkWithSessionInstructionInput {
  config: PublicKey;
  vault: PublicKey;
  session: PublicKey;
  sessionSigner: PublicKey;
  paymentLink: PublicKey;
  stablecoinMint: PublicKey;
  escrowTokenAccount: PublicKey;
  vaultTokenAccount: PublicKey;
  sessionNonce: bigint;
  programId?: PublicKey;
}

export interface RefundExpiredPaymentLinkInstructionInput {
  config: PublicKey;
  senderVault: PublicKey;
  paymentLink: PublicKey;
  stablecoinMint: PublicKey;
  escrowTokenAccount: PublicKey;
  vaultTokenAccount: PublicKey;
  programId?: PublicKey;
}

export interface DecodedSession {
  version: number;
  bump: number;
  revoked: boolean;
  vault: PublicKey;
  publicKey: PublicKey;
  actionBitmap: number;
  perActionLimit: bigint;
  cumulativeLimit: bigint;
  spent: bigint;
  validAfter: bigint;
  validUntil: bigint;
  nonce: bigint;
}

export interface DecodedPaymentLink {
  version: number;
  bump: number;
  status: number;
  senderVault: PublicKey;
  mint: PublicKey;
  linkId: Uint8Array;
  recipientCommitment: Uint8Array;
  amount: bigint;
  expiresAt: bigint;
  createdAt: bigint;
  settledAt: bigint;
  claimedDestination: PublicKey;
}

export function deriveProtocolConfig(
  programId: PublicKey = VERIAGENT_PROGRAM_ID,
): PublicKey {
  return PublicKey.findProgramAddressSync([PROTOCOL_SEED], programId)[0];
}

export function deriveVault(
  rootKeyHash: Uint8Array,
  userSalt: Uint8Array,
  programId: PublicKey = VERIAGENT_PROGRAM_ID,
): PublicKey {
  if (rootKeyHash.length !== 32 || userSalt.length !== 32) {
    throw new Error("Vault root key hash and user salt must each contain 32 bytes");
  }
  return PublicKey.findProgramAddressSync(
    [VAULT_SEED, rootKeyHash, userSalt],
    programId,
  )[0];
}

export function deriveVaultTokenAccount(vault: PublicKey, mint: PublicKey): PublicKey {
  return getAssociatedTokenAddressSync(mint, vault, true, TOKEN_PROGRAM_ID);
}

export function deriveSession(
  vault: PublicKey,
  sessionPublicKey: PublicKey,
  programId: PublicKey = VERIAGENT_PROGRAM_ID,
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [SESSION_SEED, vault.toBytes(), sessionPublicKey.toBytes()],
    programId,
  )[0];
}

export function deriveClaimAuthorityConfig(
  programId: PublicKey = VERIAGENT_PROGRAM_ID,
): PublicKey {
  return PublicKey.findProgramAddressSync([CLAIM_AUTHORITY_SEED], programId)[0];
}

export function derivePaymentLink(
  senderVault: PublicKey,
  linkId: Uint8Array,
  programId: PublicKey = VERIAGENT_PROGRAM_ID,
): PublicKey {
  if (linkId.length !== 32) throw new Error("Payment-link ID must contain 32 bytes");
  return PublicKey.findProgramAddressSync(
    [PAYMENT_LINK_SEED, senderVault.toBytes(), linkId],
    programId,
  )[0];
}

export function derivePaymentLinkTokenAccount(paymentLink: PublicKey, mint: PublicKey): PublicKey {
  return getAssociatedTokenAddressSync(mint, paymentLink, true, TOKEN_PROGRAM_ID);
}

export function decodeVaultAccount(data: Uint8Array): DecodedVault {
  if (data.length < VAULT_ACCOUNT_SIZE) {
    throw new Error("Vault account data is truncated");
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return {
    version: data[8] ?? 0,
    bump: data[9] ?? 0,
    rootPublicKey: data.slice(10, 43),
    rootKeyHash: data.slice(43, 75),
    userSalt: data.slice(75, 107),
    nonce: view.getBigUint64(VAULT_NONCE_OFFSET, true),
    createdAt: view.getBigInt64(VAULT_NONCE_OFFSET + 8, true),
  };
}

export function decodeSessionAccount(data: Uint8Array): DecodedSession {
  if (data.length < SESSION_ACCOUNT_SIZE) {
    throw new Error("Session account data is truncated");
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return {
    version: data[8] ?? 0,
    bump: data[9] ?? 0,
    revoked: data[10] === 1,
    vault: new PublicKey(data.slice(11, 43)),
    publicKey: new PublicKey(data.slice(43, 75)),
    actionBitmap: view.getUint16(75, true),
    perActionLimit: view.getBigUint64(77, true),
    cumulativeLimit: view.getBigUint64(85, true),
    spent: view.getBigUint64(93, true),
    validAfter: view.getBigInt64(101, true),
    validUntil: view.getBigInt64(109, true),
    nonce: view.getBigUint64(SESSION_NONCE_OFFSET, true),
  };
}

export function decodePaymentLinkAccount(data: Uint8Array): DecodedPaymentLink {
  if (data.length < PAYMENT_LINK_ACCOUNT_SIZE) {
    throw new Error("Payment-link account data is truncated");
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return {
    version: data[8] ?? 0,
    bump: data[9] ?? 0,
    status: data[10] ?? 0,
    senderVault: new PublicKey(data.slice(11, 43)),
    mint: new PublicKey(data.slice(43, 75)),
    linkId: data.slice(75, 107),
    recipientCommitment: data.slice(107, 139),
    amount: view.getBigUint64(PAYMENT_LINK_AMOUNT_OFFSET, true),
    expiresAt: view.getBigInt64(PAYMENT_LINK_AMOUNT_OFFSET + 8, true),
    createdAt: view.getBigInt64(PAYMENT_LINK_AMOUNT_OFFSET + 16, true),
    settledAt: view.getBigInt64(PAYMENT_LINK_AMOUNT_OFFSET + 24, true),
    claimedDestination: new PublicKey(data.slice(PAYMENT_LINK_AMOUNT_OFFSET + 32, PAYMENT_LINK_AMOUNT_OFFSET + 64)),
  };
}

export function createInitializeVaultInstruction(
  input: InitializeVaultInstructionInput,
): TransactionInstruction {
  if (
    input.rootPublicKey.length !== 33 ||
    input.rootKeyHash.length !== 32 ||
    input.userSalt.length !== 32
  ) {
    throw new Error("Vault key material has an invalid length");
  }

  const programId = input.programId ?? VERIAGENT_PROGRAM_ID;
  const discriminator = sha256(utf8("global:initialize_vault")).slice(0, 8);
  const data = concatBytes(
    discriminator,
    input.rootPublicKey,
    input.rootKeyHash,
    input.userSalt,
    i64Le(input.proofExpiresAt),
    encodeVector(input.authenticatorData),
    encodeVector(input.clientDataJson),
  );

  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: input.payer, isSigner: true, isWritable: true },
      { pubkey: input.config, isSigner: false, isWritable: false },
      { pubkey: input.vault, isSigner: false, isWritable: true },
      { pubkey: input.stablecoinMint, isSigner: false, isWritable: false },
      { pubkey: input.vaultTokenAccount, isSigner: false, isWritable: true },
      { pubkey: INSTRUCTIONS_SYSVAR_ID, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(data),
  });
}

export function createPasskeyTransferInstruction(
  input: PasskeyTransferInstructionInput,
): TransactionInstruction {
  const programId = input.programId ?? VERIAGENT_PROGRAM_ID;
  const discriminator = sha256(utf8("global:transfer_with_passkey")).slice(0, 8);
  const data = concatBytes(
    discriminator,
    u64Le(input.amount),
    u64Le(input.vaultNonce),
    i64Le(input.proofExpiresAt),
    encodeVector(input.authenticatorData),
    encodeVector(input.clientDataJson),
  );

  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: input.payer, isSigner: true, isWritable: true },
      { pubkey: input.config, isSigner: false, isWritable: false },
      { pubkey: input.vault, isSigner: false, isWritable: true },
      { pubkey: input.stablecoinMint, isSigner: false, isWritable: false },
      { pubkey: input.vaultTokenAccount, isSigner: false, isWritable: true },
      { pubkey: input.destinationTokenAccount, isSigner: false, isWritable: true },
      { pubkey: INSTRUCTIONS_SYSVAR_ID, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(data),
  });
}

export function createGrantSessionInstruction(
  input: SessionGrantInstructionInput,
): TransactionInstruction {
  const programId = input.programId ?? VERIAGENT_PROGRAM_ID;
  const discriminator = sha256(utf8("global:grant_session")).slice(0, 8);
  const data = concatBytes(
    discriminator,
    input.sessionPublicKey.toBytes(),
    u16Le(input.actionBitmap),
    u64Le(input.perActionLimit),
    u64Le(input.cumulativeLimit),
    i64Le(input.validAfterUnix),
    i64Le(input.validUntilUnix),
    u64Le(input.vaultNonce),
    i64Le(input.proofExpiresAt),
    encodeVector(input.authenticatorData),
    encodeVector(input.clientDataJson),
  );
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: input.payer, isSigner: true, isWritable: true },
      { pubkey: input.config, isSigner: false, isWritable: false },
      { pubkey: input.vault, isSigner: false, isWritable: true },
      { pubkey: input.session, isSigner: false, isWritable: true },
      { pubkey: INSTRUCTIONS_SYSVAR_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(data),
  });
}

export function createInitializeVaultAndGrantSessionInstruction(
  input: InitializeVaultAndGrantSessionInstructionInput,
): TransactionInstruction {
  const programId = input.programId ?? VERIAGENT_PROGRAM_ID;
  const discriminator = sha256(
    utf8("global:initialize_vault_and_grant_session"),
  ).slice(0, 8);
  const data = concatBytes(
    discriminator,
    input.rootPublicKey,
    input.rootKeyHash,
    input.userSalt,
    input.sessionPublicKey.toBytes(),
    u16Le(input.actionBitmap),
    u64Le(input.perActionLimit),
    u64Le(input.cumulativeLimit),
    i64Le(input.validAfterUnix),
    i64Le(input.validUntilUnix),
    i64Le(input.proofExpiresAt),
    encodeVector(input.authenticatorData),
    encodeVector(input.clientDataJson),
  );
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: input.payer, isSigner: true, isWritable: true },
      { pubkey: input.config, isSigner: false, isWritable: false },
      { pubkey: input.vault, isSigner: false, isWritable: true },
      { pubkey: input.session, isSigner: false, isWritable: true },
      { pubkey: input.stablecoinMint, isSigner: false, isWritable: false },
      { pubkey: input.vaultTokenAccount, isSigner: false, isWritable: true },
      { pubkey: INSTRUCTIONS_SYSVAR_ID, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(data),
  });
}

export function createSessionTransferInstruction(
  input: SessionTransferInstructionInput,
): TransactionInstruction {
  const programId = input.programId ?? VERIAGENT_PROGRAM_ID;
  const discriminator = sha256(utf8("global:transfer_with_session")).slice(0, 8);
  const data = concatBytes(
    discriminator,
    u64Le(input.amount),
    u64Le(input.sessionNonce),
  );
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: input.config, isSigner: false, isWritable: false },
      { pubkey: input.vault, isSigner: false, isWritable: false },
      { pubkey: input.session, isSigner: false, isWritable: true },
      { pubkey: input.sessionSigner, isSigner: true, isWritable: false },
      { pubkey: input.stablecoinMint, isSigner: false, isWritable: false },
      { pubkey: input.vaultTokenAccount, isSigner: false, isWritable: true },
      { pubkey: input.destinationTokenAccount, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(data),
  });
}

export function createInitializeClaimAuthorityInstruction(
  input: InitializeClaimAuthorityInstructionInput,
): TransactionInstruction {
  const programId = input.programId ?? VERIAGENT_PROGRAM_ID;
  const data = concatBytes(
    sha256(utf8("global:initialize_claim_authority")).slice(0, 8),
    input.authority.toBytes(),
  );
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: input.protocolAuthority, isSigner: true, isWritable: true },
      { pubkey: input.config, isSigner: false, isWritable: false },
      { pubkey: input.claimAuthorityConfig, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(data),
  });
}

export function createPaymentLinkWithSessionInstruction(
  input: CreatePaymentLinkWithSessionInstructionInput,
): TransactionInstruction {
  if (input.linkId.length !== 32 || input.recipientCommitment.length !== 32) {
    throw new Error("Payment-link ID and recipient commitment must each contain 32 bytes");
  }
  const programId = input.programId ?? VERIAGENT_PROGRAM_ID;
  const data = concatBytes(
    sha256(utf8("global:create_payment_link_with_session")).slice(0, 8),
    input.linkId,
    input.recipientCommitment,
    u64Le(input.amount),
    i64Le(input.expiresAtUnix),
    u64Le(input.sessionNonce),
  );
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: input.payer, isSigner: true, isWritable: true },
      { pubkey: input.config, isSigner: false, isWritable: false },
      { pubkey: input.vault, isSigner: false, isWritable: false },
      { pubkey: input.session, isSigner: false, isWritable: true },
      { pubkey: input.sessionSigner, isSigner: true, isWritable: false },
      { pubkey: input.stablecoinMint, isSigner: false, isWritable: false },
      { pubkey: input.vaultTokenAccount, isSigner: false, isWritable: true },
      { pubkey: input.paymentLink, isSigner: false, isWritable: true },
      { pubkey: input.escrowTokenAccount, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(data),
  });
}

export function createClaimPaymentLinkInstruction(
  input: ClaimPaymentLinkInstructionInput,
): TransactionInstruction {
  const programId = input.programId ?? VERIAGENT_PROGRAM_ID;
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: input.claimAuthority, isSigner: true, isWritable: true },
      { pubkey: input.config, isSigner: false, isWritable: false },
      { pubkey: input.claimAuthorityConfig, isSigner: false, isWritable: false },
      { pubkey: input.recipientVault, isSigner: false, isWritable: false },
      { pubkey: input.paymentLink, isSigner: false, isWritable: true },
      { pubkey: input.stablecoinMint, isSigner: false, isWritable: false },
      { pubkey: input.escrowTokenAccount, isSigner: false, isWritable: true },
      { pubkey: input.destinationTokenAccount, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(sha256(utf8("global:claim_payment_link")).slice(0, 8)),
  });
}

export function createCancelPaymentLinkWithSessionInstruction(
  input: CancelPaymentLinkWithSessionInstructionInput,
): TransactionInstruction {
  const programId = input.programId ?? VERIAGENT_PROGRAM_ID;
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: input.config, isSigner: false, isWritable: false },
      { pubkey: input.vault, isSigner: false, isWritable: false },
      { pubkey: input.session, isSigner: false, isWritable: true },
      { pubkey: input.sessionSigner, isSigner: true, isWritable: false },
      { pubkey: input.paymentLink, isSigner: false, isWritable: true },
      { pubkey: input.stablecoinMint, isSigner: false, isWritable: false },
      { pubkey: input.escrowTokenAccount, isSigner: false, isWritable: true },
      { pubkey: input.vaultTokenAccount, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(concatBytes(
      sha256(utf8("global:cancel_payment_link_with_session")).slice(0, 8),
      u64Le(input.sessionNonce),
    )),
  });
}

export function createRefundExpiredPaymentLinkInstruction(
  input: RefundExpiredPaymentLinkInstructionInput,
): TransactionInstruction {
  const programId = input.programId ?? VERIAGENT_PROGRAM_ID;
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: input.config, isSigner: false, isWritable: false },
      { pubkey: input.senderVault, isSigner: false, isWritable: false },
      { pubkey: input.paymentLink, isSigner: false, isWritable: true },
      { pubkey: input.stablecoinMint, isSigner: false, isWritable: false },
      { pubkey: input.escrowTokenAccount, isSigner: false, isWritable: true },
      { pubkey: input.vaultTokenAccount, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(sha256(utf8("global:refund_expired_payment_link")).slice(0, 8)),
  });
}

function u16Le(value: number): Uint8Array {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff) {
    throw new Error("Value is outside the u16 range");
  }
  const bytes = new Uint8Array(2);
  new DataView(bytes.buffer).setUint16(0, value, true);
  return bytes;
}

export const solanaProgramIds = {
  associatedToken: ASSOCIATED_TOKEN_PROGRAM_ID,
  system: SystemProgram.programId,
  token: TOKEN_PROGRAM_ID,
} as const;