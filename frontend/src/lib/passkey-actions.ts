/**
 * Passkey-authorized vault actions, verified on-chain.
 *
 * The older flow sent a WebAuthn assertion to the backend, which checked it and
 * then called `PayVault.execute`, a path authorized by the relayer, not by the
 * user. The contract only ever saw the backend's word that a passkey had
 * checked out.
 *
 * Here the assertion is signed over a challenge that commits to the exact
 * action (vault, chain, action payload, nonce) and the contract verifies it
 * itself. The backend becomes a submitter that pays gas and carries no
 * authority of its own.
 *
 * Two round trips, and the order matters: the challenge cannot exist until the
 * action does, so `prepare` must come first.
 *
 * @see docs/audit/11th-august-2026-1.md (SEC-001)
 */

import { api } from './api';
import { veridexSignatureToAssertion } from '@veriagent/chain-solana';
import { awaitDocumentFocus, passkeyManager, signWithBiometrics } from './veridex';

function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) {
    throw new Error('Value is not unpadded base64url');
  }
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const decoded = atob(value.replace(/-/g, '+').replace(/_/g, '/') + padding);
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

/**
 * WebAuthn wants raw bytes; the backend sends base64url, as embedded in
 * clientDataJSON.
 *
 * The array is built over an explicitly allocated `ArrayBuffer` rather than
 * `new Uint8Array(length)` so its type is `Uint8Array<ArrayBuffer>`: the
 * default is `ArrayBufferLike`, which admits `SharedArrayBuffer` and so does
 * not satisfy `BufferSource`.
 */
export interface PreparedAction {
  prepareId: string;
  challengeB64Url: string;
  vaultAddress: string;
  expiresAt: string;
}

/**
 * Prompts for the passkey and returns the assertion in the shape the backend
 * expects.
 *
 * @dev `allowCredentials` is deliberately empty: the credentials are resident
 *      (created with `residentKey: 'required'`), so the authenticator resolves
 *      which one to use. Passing a list would break the case where the user has
 *      a synced passkey on a device this browser has never seen.
 */
async function signChallenge(challengeB64Url: string) {
  // A ceremony that follows another one (granting a session key right after
  // enrolling the passkey) runs while the browser's own "Passkey saved"
  // bubble still holds focus, and an unfocused document cannot prompt.
  await awaitDocumentFocus();

  const challenge = decodeBase64Url(challengeB64Url);
  const signature = await signWithBiometrics(challenge);
  const credential = passkeyManager.getCredential();
  if (!credential) throw new Error('No Veridex passkey is active for this account.');

  return veridexSignatureToAssertion(credential.credentialId, {
    authenticatorData: signature.authenticatorData,
    clientDataJSON: signature.clientDataJSON,
    r: BigInt(signature.r),
    s: BigInt(signature.s),
  });
}

/**
 * Send funds, authorized by the user's passkey and verified on-chain.
 *
 * Use this whenever the amount exceeds the session-key allowance, or the user
 * has asked for confirmation on every payment. Below the allowance,
 * `api.transfer` stays the frictionless path.
 */
export async function transferWithPasskey(params: {
  to: string;
  token: string;
  amount: number;
  note?: string;
}): Promise<{ txHash: string; success: boolean; kind?: string; code?: string; shortUrl?: string }> {
  const prepared = await api.preparePasskeyTransfer(params);
  const assertion = await signChallenge(prepared.challengeB64Url);

  const result = await api.executePasskeyAction({
    prepareId: prepared.prepareId,
    assertion,
  });
  return {
    ...result,
    code: result.code || prepared.code,
    shortUrl: result.shortUrl || prepared.shortUrl,
  };
}

/**
 * Grant a session key, authorized by the user's passkey.
 *
 * A session key is what makes chat payments instant: the agent signs on the
 * user's behalf, within limits the user set. Those limits are enforced
 * on-chain, so the grant itself has to be authorized by the user rather than
 * minted by the backend.
 */
export async function grantSessionKeyWithPasskey(params?: {
  durationHours?: number;
  durationDays?: number;
  perTxLimitUSD?: number;
  dailyLimitUSD?: number;
}): Promise<{ txHash: string; success: boolean; sessionKeyId: string }> {
  const prepared = await api.preparePasskeySession(params ?? {});
  const assertion = await signChallenge(prepared.challengeB64Url);

  const result = await api.executePasskeyAction({
    prepareId: prepared.prepareId,
    assertion,
  });

  return { ...result, sessionKeyId: prepared.sessionKeyId };
}

export async function cancelSolPaymentLinkWithPasskey(code: string) {
  const prepared = await api.preparePasskeyLinkCancel(code);
  const assertion = await signChallenge(prepared.challengeB64Url);
  return api.executePasskeyAction({ prepareId: prepared.prepareId, assertion });
}

/**
 * Re-authorizes the vault's contract allowlist with the owner's passkey.
 *
 * A vault's allowlist is stamped in when it is created and the factory has no
 * setter, so a vault made before a protocol contract moved keeps pointing at
 * the old address and refuses the new one: the session path reverts with
 * `PayVault__SessionTargetNotAllowed`.
 *
 * This is the only way to widen it, and it deliberately requires a passkey: the
 * vault blocks every non-passkey path from reaching the spending module at all,
 * so a leaked session key cannot grant itself more reach.
 */
export async function refreshCallPolicyWithPasskey(): Promise<{ txHash: string; success: boolean }> {
  const prepared = await api.preparePolicyRefresh();
  const assertion = await signChallenge(prepared.challengeB64Url);
  return api.executePasskeyAction({ prepareId: prepared.prepareId, assertion });
}

/**
 * Whether a failed transfer was rejected for exceeding a spending limit.
 *
 * The vault refuses an over-limit transfer on the session path and the caller
 * is expected to retry through {transferWithPasskey}. Distinguishing this from
 * a genuine failure is what keeps the escalation from reading as an error.
 */
export function isSpendingLimitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return (
    message.includes('DailyLimitExceeded') ||
    message.includes('exceeds') ||
    message.includes('SESSION_KEY_REQUIRED') ||
    message.includes('limit')
  );
}
