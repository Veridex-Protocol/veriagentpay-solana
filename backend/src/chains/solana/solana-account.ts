import { createHash } from 'crypto';
import { PublicKey } from '@solana/web3.js';

export const SOLANA_CHAIN_REF = process.env.SOLANA_CHAIN_REF || 'solana:devnet';
export const SOLANA_PROGRAM_ID = new PublicKey(
  process.env.SOLANA_PROGRAM_ID || '9QQaAmTaW6FR3q8qYnAoCFr8kcmKwPE99terRZ95txmR',
);
export const SOLANA_USDC_MINT = new PublicKey(
  process.env.SOLANA_USDC_MINT || '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
);

const VAULT_SEED = Buffer.from('vault');

export function isSolanaAddress(value: string): boolean {
  try {
    return new PublicKey(value).toBase58() === value;
  } catch {
    return false;
  }
}

export function identitySalt(platform: string, platformId: string): Buffer {
  return createHash('sha256')
    .update('veriagent:solana:identity:v1\0')
    .update(platform)
    .update('\0')
    .update(platformId)
    .digest();
}

export function compressedP256PublicKey(publicKeyX: string, publicKeyY: string): Buffer {
  const x = bigintTo32Bytes(BigInt(publicKeyX));
  const y = bigintTo32Bytes(BigInt(publicKeyY));
  return Buffer.concat([Buffer.from([2 + Number(BigInt(publicKeyY) & 1n)]), x]);
}

export function rootKeyHash(publicKeyX: string, publicKeyY: string): Buffer {
  return createHash('sha256')
    .update(compressedP256PublicKey(publicKeyX, publicKeyY))
    .digest();
}

export function deriveVaultAddress(rootHash: Uint8Array, salt: Uint8Array): string {
  if (rootHash.length !== 32 || salt.length !== 32) {
    throw new Error('Solana vault root hash and identity salt must each contain 32 bytes');
  }
  return PublicKey.findProgramAddressSync(
    [VAULT_SEED, Buffer.from(rootHash), Buffer.from(salt)],
    SOLANA_PROGRAM_ID,
  )[0].toBase58();
}

export function deriveVaultFromPasskey(
  publicKeyX: string,
  publicKeyY: string,
  platform: string,
  platformId: string,
): { address: string; rootHash: Buffer; salt: Buffer } {
  const rootHash = rootKeyHash(publicKeyX, publicKeyY);
  const salt = identitySalt(platform, platformId);
  return { address: deriveVaultAddress(rootHash, salt), rootHash, salt };
}

export function bytes32FromStored(value: string): Buffer {
  const normalized = value.startsWith('0x') ? value.slice(2) : value;
  if (/^[0-9a-fA-F]{64}$/.test(normalized)) return Buffer.from(normalized, 'hex');
  const decoded = Buffer.from(value, 'base64url');
  if (decoded.length !== 32) throw new Error('Stored Solana seed must contain 32 bytes');
  return decoded;
}

function bigintTo32Bytes(value: bigint): Buffer {
  if (value < 0n || value >= 1n << 256n) {
    throw new Error('P-256 coordinate is outside the uint256 range');
  }
  return Buffer.from(value.toString(16).padStart(64, '0'), 'hex');
}