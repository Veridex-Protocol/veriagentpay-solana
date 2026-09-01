/**
 * WebAuthn assertion → on-chain P-256 signature parameters.
 *
 * `PayVault.executeWithPasskey` takes the raw pieces an authenticator produced:
 * `authenticatorData`, `clientDataJSON`, and the signature split into `(r, s)`.
 * WebAuthn hands them over base64url-encoded, with the signature DER-wrapped, so
 * they need unpacking before they can be submitted.
 *
 * @see docs/audit/11th-august-2026-1.md — SEC-001
 */

import { solidityPackedKeccak256, keccak256 } from 'ethers';

/** Order of the P-256 curve. */
const P256_N = BigInt('0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551');

/** n/2 — signatures above this are non-canonical and the contract rejects them. */
const P256_HALF_N = P256_N / 2n;

export function base64UrlToBuffer(value: string): Buffer {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(padded, 'base64');
}

export function bufferToBase64Url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Extracts `(r, s)` from a DER-encoded ECDSA signature.
 *
 * Structure is `SEQUENCE { INTEGER r, INTEGER s }`. Both integers are signed
 * big-endian, so DER prepends a `0x00` byte whenever the leading bit would
 * otherwise read as negative — that padding has to come off, and a short value
 * has to be left-padded back to 32 bytes.
 */
export function parseDerSignature(der: Buffer): { r: bigint; s: bigint } {
  let offset = 0;

  if (der[offset++] !== 0x30) {
    throw new Error('Malformed signature: expected DER SEQUENCE');
  }

  // Length byte; long-form (0x81) appears for sequences over 127 bytes.
  const seqLen = der[offset++];
  if (seqLen & 0x80) {
    const lenBytes = seqLen & 0x7f;
    offset += lenBytes;
  }

  const readInt = (): bigint => {
    if (der[offset++] !== 0x02) {
      throw new Error('Malformed signature: expected DER INTEGER');
    }
    const len = der[offset++];
    const bytes = der.subarray(offset, offset + len);
    offset += len;
    return BigInt('0x' + bytes.toString('hex'));
  };

  const r = readInt();
  const s = readInt();

  return { r, s };
}

/**
 * Parsed assertion in the shape `executeWithPasskey` expects.
 */
export interface PasskeySignatureParams {
  authenticatorData: string; // 0x-hex
  clientDataJSON: string; // 0x-hex
  r: bigint;
  s: bigint;
  /** The challenge the authenticator actually signed, base64url as embedded. */
  challengeB64Url: string;
}

/**
 * Unpacks a WebAuthn assertion for on-chain submission.
 *
 * @dev `s` is normalized to the low half of the curve order. ECDSA admits both
 *      `s` and `n - s` for any signature, and authenticators differ on which
 *      they emit; `P256Verifier.isCanonicalSignature` rejects the high form, so
 *      an un-normalized assertion from a conforming authenticator would fail
 *      verification for no good reason. Flipping it does not weaken anything —
 *      both values verify against the same message and key.
 */
export function parseAssertion(assertion: {
  response: { authenticatorData: string; clientDataJSON: string; signature: string };
}): PasskeySignatureParams {
  const authenticatorData = base64UrlToBuffer(assertion.response.authenticatorData);
  const clientDataJSON = base64UrlToBuffer(assertion.response.clientDataJSON);
  const derSignature = base64UrlToBuffer(assertion.response.signature);

  const { r, s: rawS } = parseDerSignature(derSignature);
  const s = rawS > P256_HALF_N ? P256_N - rawS : rawS;

  let challengeB64Url = '';
  try {
    const parsed = JSON.parse(clientDataJSON.toString('utf8'));
    challengeB64Url = typeof parsed.challenge === 'string' ? parsed.challenge : '';
  } catch {
    throw new Error('Malformed clientDataJSON: not valid JSON');
  }

  return {
    authenticatorData: '0x' + authenticatorData.toString('hex'),
    clientDataJSON: '0x' + clientDataJSON.toString('hex'),
    r,
    s,
    challengeB64Url,
  };
}

/**
 * The challenge `PayVault.executeWithPasskey` will reconstruct and compare
 * against the one inside `clientDataJSON`.
 *
 * Must match the contract exactly:
 * `keccak256(abi.encodePacked(vault, chainId, keccak256(actionPayload), nonce))`
 */
export function buildPasskeyChallenge(
  vaultAddress: string,
  chainId: bigint,
  actionPayload: string,
  nonce: bigint,
): { challengeHex: string; challengeB64Url: string } {
  const challengeHex = solidityPackedKeccak256(
    ['address', 'uint256', 'bytes32', 'uint256'],
    [vaultAddress, chainId, keccak256(actionPayload), nonce],
  );

  return {
    challengeHex,
    // WebAuthn embeds the challenge base64url-encoded and unpadded, which is
    // the form the contract's Base64URL library reproduces on-chain.
    challengeB64Url: bufferToBase64Url(Buffer.from(challengeHex.slice(2), 'hex')),
  };
}
