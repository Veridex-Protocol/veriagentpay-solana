import { describe, expect, test } from "bun:test";
import { Keypair } from "@solana/web3.js";

import { feePayerFromSecret } from "../src";

describe("fee payer secret parsing", () => {
  test("loads JSON and base64-encoded JSON keypairs", () => {
    const keypair = Keypair.generate();
    const json = JSON.stringify(Array.from(keypair.secretKey));
    const encoded = Buffer.from(json).toString("base64");

    expect(feePayerFromSecret(json).publicKey).toEqual(keypair.publicKey);
    expect(feePayerFromSecret(encoded).publicKey).toEqual(keypair.publicKey);
  });

  test("rejects malformed secret material", () => {
    expect(() => feePayerFromSecret("[1,2,3]")).toThrow();
    expect(() => feePayerFromSecret("not-a-key")).toThrow();
  });
});