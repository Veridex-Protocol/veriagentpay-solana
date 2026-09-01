import { Keypair } from "@solana/web3.js";
import { Buffer } from "buffer";

export function feePayerFromSecret(value: string): Keypair {
  let decoded: unknown;
  try {
    const normalized = value.trim().startsWith("[")
      ? value
      : Buffer.from(value, "base64").toString("utf8");
    decoded = JSON.parse(normalized);
  } catch {
    throw new Error("Fee-payer keypair must be a JSON byte array or its base64 encoding");
  }

  if (
    !Array.isArray(decoded) ||
    decoded.length !== 64 ||
    !decoded.every(
      (item) => Number.isSafeInteger(item) && Number(item) >= 0 && Number(item) <= 255,
    )
  ) {
    throw new Error("Fee-payer keypair must contain exactly 64 bytes");
  }

  return Keypair.fromSecretKey(Uint8Array.from(decoded as number[]));
}