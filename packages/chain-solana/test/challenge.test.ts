import { describe, expect, test } from "bun:test";
import { PublicKey } from "@solana/web3.js";

import {
  bytesToHex,
  initializeVaultChallenge,
  transferChallenge,
  VERIAGENT_PROGRAM_ID,
} from "../src";

describe("program challenge parity", () => {
  test("produces a stable transfer challenge fixture", () => {
    const challenge = transferChallenge({
      clusterDomain: new Uint8Array(32).fill(1),
      programId: VERIAGENT_PROGRAM_ID,
      config: new PublicKey(new Uint8Array(32).fill(2)),
      vault: new PublicKey(new Uint8Array(32).fill(3)),
      vaultTokenAccount: new PublicKey(new Uint8Array(32).fill(4)),
      destinationTokenAccount: new PublicKey(new Uint8Array(32).fill(5)),
      stablecoinMint: new PublicKey(new Uint8Array(32).fill(6)),
      amount: 1_250_000n,
      vaultNonce: 7n,
      expiresAtUnix: 1_800_000_000n,
    });

    expect(bytesToHex(challenge)).toBe(
      "c067673dbd175cd306931261ef18b4818c9801eae75806f1567c6e8dc87b1d0c",
    );
  });

  test("produces the Rust vault initialization fixture", () => {
    const challenge = initializeVaultChallenge({
      clusterDomain: new Uint8Array(32).fill(1),
      programId: VERIAGENT_PROGRAM_ID,
      config: new PublicKey(new Uint8Array(32).fill(2)),
      vault: new PublicKey(new Uint8Array(32).fill(3)),
      vaultTokenAccount: new PublicKey(new Uint8Array(32).fill(4)),
      rootPublicKey: Uint8Array.from([2, ...new Uint8Array(32).fill(5)]),
      rootKeyHash: new Uint8Array(32).fill(6),
      userSalt: new Uint8Array(32).fill(7),
      expiresAtUnix: 1_800_000_000n,
    });

    expect(bytesToHex(challenge)).toBe(
      "03b1bd366a40c3f173c31c3b32fe46b4d795f278c8ddc4736ca1b17af8f01c5c",
    );
  });
});