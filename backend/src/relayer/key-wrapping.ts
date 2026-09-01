/**
 * Wrapping and unwrapping of the per-record data keys that encrypt session
 * private keys.
 *
 * Why this exists
 *
 *   Session private keys are stored encrypted under a per-record data key,
 *   which was itself encrypted under `SESSION_KEY_MASTER_SECRET` — a value
 *   loaded into the API process alongside `RELAYER_PRIVATE_KEY`. One process
 *   compromise therefore yielded both the relayer key and the ability to
 *   recover and sign with every user's session key offline, indefinitely, with
 *   nothing recorded anywhere.
 *
 *   Moving the wrapping key into KMS does not stop a compromised process from
 *   *asking* for a decryption — it holds the IAM credentials either way. What
 *   it changes is that the key material never enters the process, so it cannot
 *   be exfiltrated and used later; every unwrap becomes a CloudTrail event that
 *   can be rate-limited and alarmed on; and revocation is a KMS policy change
 *   rather than a redeploy plus re-encryption of every row.
 *
 * Blob formats
 *
 *   `kms:v1:<base64>` — data key wrapped by KMS. Written by new deployments.
 *   `v2:<salt>:<iv>:<tag>:<ct>` — legacy, wrapped by the local master secret.
 *
 *   Unwrapping dispatches on the prefix, so existing rows keep working with no
 *   migration and no downtime. Rows re-wrap to KMS naturally as sessions
 *   expire and are reissued; {@link isLegacyWrapped} lets a backfill find any
 *   that have not.
 */

import { KMSClient, EncryptCommand, DecryptCommand } from '@aws-sdk/client-kms';
import { Logger } from '@nestjs/common';
import {
  SESSION_KEY_KMS_KEY_ID,
  SESSION_KEY_KMS_REGION,
  SESSION_KEY_MASTER_SECRET,
} from '../config/secrets';
import { decryptSymmetric, encryptSymmetric } from './symmetric-crypto';

const KMS_PREFIX = 'kms:v1:';
const LEGACY_PREFIX = 'v2:';

const logger = new Logger('KeyWrapping');

let kmsClient: KMSClient | undefined;

function client(): KMSClient {
  if (!kmsClient) {
    kmsClient = new KMSClient(
      SESSION_KEY_KMS_REGION ? { region: SESSION_KEY_KMS_REGION } : {},
    );
  }
  return kmsClient;
}

/** Whether this deployment writes KMS-wrapped data keys. */
export function kmsEnabled(): boolean {
  return Boolean(SESSION_KEY_KMS_KEY_ID);
}

/** Whether a stored blob still uses the local master secret. */
export function isLegacyWrapped(blob: string): boolean {
  return blob.startsWith(LEGACY_PREFIX);
}

/**
 * Wrap a freshly generated data key.
 *
 * @param dataKey Hex-encoded 32-byte symmetric key.
 * @param context Encryption context bound into the KMS ciphertext. AWS refuses
 *        a decrypt whose context does not match, so a blob lifted from one
 *        user's row cannot be unwrapped while claiming to be another's.
 */
export async function wrapDataKey(
  dataKey: string,
  context: Record<string, string>,
): Promise<string> {
  if (!kmsEnabled()) {
    if (!SESSION_KEY_MASTER_SECRET) {
      throw new Error(
        'Neither SESSION_KEY_KMS_KEY_ID nor SESSION_KEY_MASTER_SECRET is set; ' +
          'refusing to store a session key unwrapped.',
      );
    }
    return encryptSymmetric(dataKey, SESSION_KEY_MASTER_SECRET);
  }

  const result = await client().send(
    new EncryptCommand({
      KeyId: SESSION_KEY_KMS_KEY_ID,
      Plaintext: Buffer.from(dataKey, 'utf8'),
      EncryptionContext: context,
    }),
  );

  if (!result.CiphertextBlob) {
    throw new Error('KMS returned no ciphertext for the session data key.');
  }

  return KMS_PREFIX + Buffer.from(result.CiphertextBlob).toString('base64');
}

/**
 * Unwrap a stored data key, in whichever format it was written.
 *
 * @param context Must match the context the blob was wrapped with. Ignored for
 *        legacy blobs, which carry no binding — one more reason to finish the
 *        backfill.
 */
export async function unwrapDataKey(
  blob: string,
  context: Record<string, string>,
): Promise<string> {
  if (blob.startsWith(KMS_PREFIX)) {
    const ciphertext = Buffer.from(blob.slice(KMS_PREFIX.length), 'base64');
    const result = await client().send(
      new DecryptCommand({
        CiphertextBlob: ciphertext,
        EncryptionContext: context,
        KeyId: SESSION_KEY_KMS_KEY_ID,
      }),
    );

    if (!result.Plaintext) {
      throw new Error('KMS returned no plaintext for the session data key.');
    }
    return Buffer.from(result.Plaintext).toString('utf8');
  }

  if (isLegacyWrapped(blob)) {
    if (!SESSION_KEY_MASTER_SECRET) {
      throw new Error(
        'A session key is still wrapped by the local master secret, but ' +
          'SESSION_KEY_MASTER_SECRET is not set. Keep it configured until the ' +
          'KMS backfill has re-wrapped every row.',
      );
    }
    if (kmsEnabled()) {
      logger.warn(
        'Unwrapped a legacy session data key while KMS is enabled; run the backfill.',
      );
    }
    return decryptSymmetric(blob, SESSION_KEY_MASTER_SECRET);
  }

  throw new Error('Unrecognised session data key format; refusing to guess.');
}
