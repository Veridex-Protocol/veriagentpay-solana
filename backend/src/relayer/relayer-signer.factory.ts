import { ethers } from 'ethers';
import { KmsSigner } from './kms-signer';
import {
  PRICE_ORACLE_SIGNER_PRIVATE_KEY,
  PRICE_SIGNER_KMS_KEY_ID,
  RELAYER_KMS_KEY_ID,
  RELAYER_PRIVATE_KEY,
} from '../config/secrets';

/**
 * The single place the relayer signer is constructed.
 *
 * Before this existed, nine call sites did `new ethers.Wallet(process.env
 * .RELAYER_PRIVATE_KEY)` independently, several reading `process.env` directly
 * rather than going through `config/secrets`. Moving the key to KMS with that
 * arrangement would have produced two signing paths and the appearance of a
 * migration rather than one.
 *
 * `RELAYER_KMS_KEY_ID` decides which is used. Falling back to a local key is
 * deliberate: development and tests have no KMS, and a hard requirement there
 * buys nothing. Production sets the variable, and {@link assertRelayerIsRemote}
 * is how a deployment proves it did.
 */
export function createRelayerSigner(provider?: ethers.Provider | null): ethers.Signer {
  if (RELAYER_KMS_KEY_ID) {
    return new KmsSigner(RELAYER_KMS_KEY_ID, provider ?? null);
  }

  if (!RELAYER_PRIVATE_KEY) {
    throw new Error(
      'Neither RELAYER_KMS_KEY_ID nor RELAYER_PRIVATE_KEY is set; the relayer cannot sign.',
    );
  }

  return provider
    ? new ethers.Wallet(RELAYER_PRIVATE_KEY, provider)
    : new ethers.Wallet(RELAYER_PRIVATE_KEY);
}

/** Whether signing currently goes through KMS rather than a local key. */
export function relayerUsesKms(): boolean {
  return Boolean(RELAYER_KMS_KEY_ID);
}

/**
 * Fails startup when a production deployment still holds the key locally.
 *
 * @dev The migration's failure mode is silent: the key is imported into KMS,
 *      the variable is missed, and everything keeps working from the env var
 *      while looking migrated. This turns that into a boot failure.
 */
export function assertRelayerIsRemote(): void {
  if (process.env.NODE_ENV !== 'production') return;
  if (RELAYER_KMS_KEY_ID) return;

  throw new Error(
    'Production requires RELAYER_KMS_KEY_ID. Import the relayer key with ' +
      'scripts/import-relayer-key-kms.ts, set the alias, and remove ' +
      'RELAYER_PRIVATE_KEY from the environment.',
  );
}

/**
 * The price-oracle signer, KMS-backed where configured.
 *
 * @returns `null` when neither a KMS key nor a raw key is set, which leaves the
 *          price pusher dormant rather than throwing. The USD ceiling ships
 *          inert and an unpublished price disables only that ceiling — the
 *          per-token caps still bind (ADR-008), so silence is the safe state.
 *
 * @dev Deliberately separate from {@link createRelayerSigner}: the two keys must
 *      differ, and `Deploy.s.sol` enforces it. Sharing them would let a relayer
 *      compromise lift every USD ceiling as well as sign payments.
 */
export function createPriceSigner(provider?: ethers.Provider | null): ethers.Signer | null {
  if (PRICE_SIGNER_KMS_KEY_ID) {
    return new KmsSigner(PRICE_SIGNER_KMS_KEY_ID, provider ?? null);
  }
  if (PRICE_ORACLE_SIGNER_PRIVATE_KEY) {
    return new ethers.Wallet(PRICE_ORACLE_SIGNER_PRIVATE_KEY, provider ?? null);
  }
  return null;
}

/** Whether price signing currently goes through KMS. */
export function priceSignerUsesKms(): boolean {
  return Boolean(PRICE_SIGNER_KMS_KEY_ID);
}
