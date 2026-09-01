/**
 * AES-GCM helpers for the session-key envelope.
 *
 * Extracted from `relayer.service.ts` so that `key-wrapping.ts` can use them
 * without importing the service that imports it. The behaviour is unchanged;
 * only the location moved.
 *
 * These encrypt the session private key under a per-record data key. Wrapping
 * of the data key itself lives in `key-wrapping.ts` and is what moved to KMS.
 */

import * as crypto from 'crypto';

const KDF_N = 16384,
  KDF_r = 8,
  KDF_p = 1,
  KEY_LEN = 32;

export function encryptSymmetric(plaintext: string, secretKeyHex: string): string {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(secretKeyHex, salt, KEY_LEN, { N: KDF_N, r: KDF_r, p: KDF_p });
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v2:${salt.toString('hex')}:${iv.toString('hex')}:${tag.toString('hex')}:${ct.toString('hex')}`;
}

export function decryptSymmetric(blob: string, secretKeyHex: string): string {
  const parts = blob.split(':');

  if (parts[0] === 'v2') {
    const [, saltHex, ivHex, tagHex, ctHex] = parts;
    const key = crypto.scryptSync(secretKeyHex, Buffer.from(saltHex, 'hex'), KEY_LEN, {
      N: KDF_N,
      r: KDF_r,
      p: KDF_p,
    });
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return Buffer.concat([
      decipher.update(Buffer.from(ctHex, 'hex')),
      decipher.final(),
    ]).toString('utf8');
  }

  // The legacy v1 AES-256-CBC branch was removed.
  //
  // It derived its key with `scryptSync(secret, 'veriagent_salt', …)` — a
  // literal, shared salt, which defeats the point of the KDF: one precomputation
  // works against every deployment that ever used it. CBC also carries no
  // authentication tag, so a stored blob was malleable.
  //
  // Removing it needs no data migration. Encryption has written `v2:` GCM for
  // some time, and `SESSION_KEY_MASTER_SECRET` has since been rotated — so any
  // surviving v1 blob was already undecryptable under the current secret. A
  // session key that cannot be read is re-granted by the user, which is the
  // correct outcome for key material of unknown integrity.
  //
  // @see docs/security-remaining-issues.md — BE-H-08

  throw new Error(
    'Session key blob is malformed, unencrypted, or uses a retired format; refusing to use it',
  );
}
