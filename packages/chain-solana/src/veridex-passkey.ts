import { Buffer } from "buffer";

import { bytesToBase64Url, concatBytes } from "./bytes.js";

export interface VeridexWebAuthnSignature {
  authenticatorData: string;
  clientDataJSON: string;
  r: bigint;
  s: bigint;
}

export interface WebAuthnAssertionJson {
  id: string;
  rawId: string;
  type: "public-key";
  clientExtensionResults: Record<string, never>;
  response: {
    authenticatorData: string;
    clientDataJSON: string;
    signature: string;
  };
}

export function veridexSignatureToAssertion(
  credentialId: string,
  signature: VeridexWebAuthnSignature,
): WebAuthnAssertionJson {
  if (!/^[A-Za-z0-9_-]+$/.test(credentialId)) {
    throw new Error("Credential ID must be unpadded base64url");
  }

  const authenticatorData = hexToBytes(signature.authenticatorData);
  const clientDataJson = new TextEncoder().encode(signature.clientDataJSON);
  return {
    id: credentialId,
    rawId: credentialId,
    type: "public-key",
    clientExtensionResults: {},
    response: {
      authenticatorData: bytesToBase64Url(authenticatorData),
      clientDataJSON: bytesToBase64Url(clientDataJson),
      signature: bytesToBase64Url(compactScalarsToDer(signature.r, signature.s)),
    },
  };
}

export function compactScalarsToDer(r: bigint, s: bigint): Uint8Array {
  const rBytes = derInteger(r);
  const sBytes = derInteger(s);
  const body = concatBytes(
    Uint8Array.of(0x02, rBytes.length),
    rBytes,
    Uint8Array.of(0x02, sBytes.length),
    sBytes,
  );
  return concatBytes(Uint8Array.of(0x30, body.length), body);
}

function derInteger(value: bigint): Uint8Array {
  if (value <= 0n || value >= 1n << 256n) {
    throw new Error("P-256 signature scalar is outside the 256-bit positive range");
  }

  let hex = value.toString(16);
  if (hex.length % 2 !== 0) {
    hex = `0${hex}`;
  }
  const bytes: Uint8Array = Uint8Array.from(Buffer.from(hex, "hex"));
  return (bytes[0] ?? 0) & 0x80
    ? concatBytes(Uint8Array.of(0), bytes)
    : bytes;
}

function hexToBytes(value: string): Uint8Array {
  if (!/^0x(?:[0-9a-fA-F]{2})+$/.test(value)) {
    throw new Error("Authenticator data must be an even-length 0x-prefixed hex string");
  }
  return Uint8Array.from(Buffer.from(value.slice(2), "hex"));
}