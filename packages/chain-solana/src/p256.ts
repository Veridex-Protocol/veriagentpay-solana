import { sha256 } from "@noble/hashes/sha256";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { Buffer } from "buffer";

import { concatBytes } from "./bytes.js";
import { SECP256R1_PROGRAM_ID } from "./constants.js";

const CURVE_ORDER = 0xffff_ffff_0000_0000_ffff_ffff_ffff_ffff_bce6_faad_a717_9e84_f3b9_cac2_fc63_2551n;
const HALF_CURVE_ORDER = CURVE_ORDER >> 1n;
const PUBLIC_KEY_SIZE = 33;
const COMPACT_SIGNATURE_SIZE = 64;
const OFFSETS_SIZE = 14;
const DATA_START = 2 + OFFSETS_SIZE;

export interface WebAuthnProof {
  compressedPublicKey: Uint8Array;
  authenticatorData: Uint8Array;
  clientDataJson: Uint8Array;
  signatureDer: Uint8Array;
}

export function webAuthnSignedMessage(
  authenticatorData: Uint8Array,
  clientDataJson: Uint8Array,
): Uint8Array {
  if (authenticatorData.length < 37) {
    throw new Error("Authenticator data must contain RP hash, flags, and sign count");
  }
  return concatBytes(authenticatorData, sha256(clientDataJson));
}

export function derToCompactLowS(signatureDer: Uint8Array): Uint8Array {
  const sequence = readDerElement(signatureDer, 0, 0x30);
  if (sequence.end !== signatureDer.length) {
    throw new Error("DER signature contains trailing data");
  }
  const rElement = readDerElement(signatureDer, sequence.contentStart, 0x02);
  const sElement = readDerElement(signatureDer, rElement.end, 0x02);
  if (sElement.end !== sequence.end) {
    throw new Error("DER signature must contain exactly two integers");
  }

  const r = parseDerInteger(signatureDer.subarray(rElement.contentStart, rElement.end));
  let s = parseDerInteger(signatureDer.subarray(sElement.contentStart, sElement.end));
  if (r <= 0n || r >= CURVE_ORDER || s <= 0n || s >= CURVE_ORDER) {
    throw new Error("P-256 signature scalar is outside the curve order");
  }
  if (s > HALF_CURVE_ORDER) {
    s = CURVE_ORDER - s;
  }

  return concatBytes(bigIntTo32Bytes(r), bigIntTo32Bytes(s));
}

export function createSecp256r1Instruction(proof: WebAuthnProof): TransactionInstruction {
  if (proof.compressedPublicKey.length !== PUBLIC_KEY_SIZE) {
    throw new Error("P-256 public key must use 33-byte compressed SEC1 encoding");
  }
  if (proof.compressedPublicKey[0] !== 2 && proof.compressedPublicKey[0] !== 3) {
    throw new Error("P-256 compressed public key has an invalid prefix");
  }

  const signature = derToCompactLowS(proof.signatureDer);
  const message = webAuthnSignedMessage(proof.authenticatorData, proof.clientDataJson);
  const publicKeyOffset = DATA_START;
  const signatureOffset = publicKeyOffset + PUBLIC_KEY_SIZE;
  const messageOffset = signatureOffset + COMPACT_SIGNATURE_SIZE;
  if (message.length > 0xffff) {
    throw new Error("WebAuthn signed message exceeds the precompile offset range");
  }

  const header = new Uint8Array(DATA_START);
  header[0] = 1;
  const view = new DataView(header.buffer);
  view.setUint16(2, signatureOffset, true);
  view.setUint16(4, 0xffff, true);
  view.setUint16(6, publicKeyOffset, true);
  view.setUint16(8, 0xffff, true);
  view.setUint16(10, messageOffset, true);
  view.setUint16(12, message.length, true);
  view.setUint16(14, 0xffff, true);

  return new TransactionInstruction({
    programId: SECP256R1_PROGRAM_ID,
    keys: [],
    data: Buffer.from(
      concatBytes(header, proof.compressedPublicKey, signature, message),
    ),
  });
}

function readDerElement(
  input: Uint8Array,
  offset: number,
  expectedTag: number,
): { contentStart: number; end: number } {
  if (input[offset] !== expectedTag) {
    throw new Error("DER signature has an unexpected tag");
  }
  const firstLength = input[offset + 1];
  if (firstLength === undefined) {
    throw new Error("DER signature is truncated");
  }

  let length: number;
  let contentStart: number;
  if (firstLength < 0x80) {
    length = firstLength;
    contentStart = offset + 2;
  } else if (firstLength === 0x81) {
    const longLength = input[offset + 2];
    if (longLength === undefined || longLength < 0x80) {
      throw new Error("DER signature uses a non-canonical length");
    }
    length = longLength;
    contentStart = offset + 3;
  } else {
    throw new Error("DER signature length encoding is unsupported");
  }

  const end = contentStart + length;
  if (end > input.length) {
    throw new Error("DER signature is truncated");
  }
  return { contentStart, end };
}

function parseDerInteger(value: Uint8Array): bigint {
  if (value.length === 0 || value.length > 33) {
    throw new Error("DER integer has an invalid length");
  }
  if ((value[0] ?? 0) & 0x80) {
    throw new Error("DER integer must be positive");
  }
  if (value.length > 1 && value[0] === 0 && ((value[1] ?? 0) & 0x80) === 0) {
    throw new Error("DER integer has redundant leading zeroes");
  }
  const normalized = value[0] === 0 ? value.subarray(1) : value;
  const hex = Buffer.from(normalized).toString("hex") || "0";
  return BigInt(`0x${hex}`);
}

function bigIntTo32Bytes(value: bigint): Uint8Array {
  const hex = value.toString(16).padStart(64, "0");
  return new Uint8Array(Buffer.from(hex, "hex"));
}