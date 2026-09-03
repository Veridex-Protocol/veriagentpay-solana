import { sha256 } from "@noble/hashes/sha256";
import type { PublicKey } from "@solana/web3.js";

import { concatBytes, i64Le, u64Le } from "./bytes.js";
import {
  ACTION_INITIALIZE_VAULT,
  ACTION_GRANT_SESSION,
  ACTION_INITIALIZE_VAULT_AND_GRANT_SESSION,
  ACTION_TRANSFER,
  CHALLENGE_DOMAIN,
} from "./constants.js";

export interface InitializeVaultChallengeInput {
  clusterDomain: Uint8Array;
  programId: PublicKey;
  config: PublicKey;
  vault: PublicKey;
  vaultTokenAccount: PublicKey;
  rootPublicKey: Uint8Array;
  rootKeyHash: Uint8Array;
  userSalt: Uint8Array;
  expiresAtUnix: bigint;
}

export interface TransferChallengeInput {
  clusterDomain: Uint8Array;
  programId: PublicKey;
  config: PublicKey;
  vault: PublicKey;
  vaultTokenAccount: PublicKey;
  destinationTokenAccount: PublicKey;
  stablecoinMint: PublicKey;
  amount: bigint;
  vaultNonce: bigint;
  expiresAtUnix: bigint;
}

export interface SessionGrantChallengeInput {
  clusterDomain: Uint8Array;
  programId: PublicKey;
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
  expiresAtUnix: bigint;
}

export interface InitializeVaultAndGrantSessionChallengeInput
  extends Omit<SessionGrantChallengeInput, "vaultNonce"> {
  vaultTokenAccount: PublicKey;
  stablecoinMint: PublicKey;
  rootPublicKey: Uint8Array;
  rootKeyHash: Uint8Array;
  userSalt: Uint8Array;
}

export function challenge(parts: readonly Uint8Array[]): Uint8Array {
  return sha256(concatBytes(CHALLENGE_DOMAIN, ...parts));
}

export function clusterDomainFromGenesisHash(genesisHash: string): Uint8Array {
  const normalized = genesisHash.trim();
  if (normalized.length === 0) {
    throw new Error("Genesis hash is required for cluster-domain binding");
  }
  return sha256(new TextEncoder().encode(normalized));
}

export function initializeVaultChallenge(
  input: InitializeVaultChallengeInput,
): Uint8Array {
  assertBytes(input.clusterDomain, 32, "cluster domain");
  assertBytes(input.rootPublicKey, 33, "root public key");
  assertBytes(input.rootKeyHash, 32, "root key hash");
  assertBytes(input.userSalt, 32, "user salt");
  return challenge([
    input.clusterDomain,
    input.programId.toBytes(),
    Uint8Array.of(ACTION_INITIALIZE_VAULT),
    input.config.toBytes(),
    input.vault.toBytes(),
    input.vaultTokenAccount.toBytes(),
    input.rootPublicKey,
    input.rootKeyHash,
    input.userSalt,
    u64Le(0n),
    i64Le(input.expiresAtUnix),
  ]);
}

export function transferChallenge(input: TransferChallengeInput): Uint8Array {
  assertBytes(input.clusterDomain, 32, "cluster domain");
  return challenge([
    input.clusterDomain,
    input.programId.toBytes(),
    Uint8Array.of(ACTION_TRANSFER),
    input.config.toBytes(),
    input.vault.toBytes(),
    input.vaultTokenAccount.toBytes(),
    input.destinationTokenAccount.toBytes(),
    input.stablecoinMint.toBytes(),
    u64Le(input.amount),
    u64Le(input.vaultNonce),
    i64Le(input.expiresAtUnix),
  ]);
}

export function sessionGrantChallenge(input: SessionGrantChallengeInput): Uint8Array {
  assertBytes(input.clusterDomain, 32, "cluster domain");
  return challenge([
    input.clusterDomain,
    input.programId.toBytes(),
    Uint8Array.of(ACTION_GRANT_SESSION),
    input.config.toBytes(),
    input.vault.toBytes(),
    input.session.toBytes(),
    input.sessionPublicKey.toBytes(),
    u16Le(input.actionBitmap),
    u64Le(input.perActionLimit),
    u64Le(input.cumulativeLimit),
    i64Le(input.validAfterUnix),
    i64Le(input.validUntilUnix),
    u64Le(input.vaultNonce),
    i64Le(input.expiresAtUnix),
  ]);
}

export function initializeVaultAndGrantSessionChallenge(
  input: InitializeVaultAndGrantSessionChallengeInput,
): Uint8Array {
  assertBytes(input.clusterDomain, 32, "cluster domain");
  assertBytes(input.rootPublicKey, 33, "root public key");
  assertBytes(input.rootKeyHash, 32, "root key hash");
  assertBytes(input.userSalt, 32, "user salt");
  return challenge([
    input.clusterDomain,
    input.programId.toBytes(),
    Uint8Array.of(ACTION_INITIALIZE_VAULT_AND_GRANT_SESSION),
    input.config.toBytes(),
    input.vault.toBytes(),
    input.session.toBytes(),
    input.vaultTokenAccount.toBytes(),
    input.stablecoinMint.toBytes(),
    input.rootPublicKey,
    input.rootKeyHash,
    input.userSalt,
    input.sessionPublicKey.toBytes(),
    u16Le(input.actionBitmap),
    u64Le(input.perActionLimit),
    u64Le(input.cumulativeLimit),
    i64Le(input.validAfterUnix),
    i64Le(input.validUntilUnix),
    u64Le(0n),
    i64Le(input.expiresAtUnix),
  ]);
}

function assertBytes(value: Uint8Array, length: number, name: string): void {
  if (value.length !== length) {
    throw new Error(`${name} must contain ${length} bytes`);
  }
}

function u16Le(value: number): Uint8Array {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff) {
    throw new Error("Value is outside the u16 range");
  }
  const bytes = new Uint8Array(2);
  new DataView(bytes.buffer).setUint16(0, value, true);
  return bytes;
}