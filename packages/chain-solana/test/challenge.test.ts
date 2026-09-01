import { describe, expect, test } from "bun:test";
import { PublicKey } from "@solana/web3.js";

import {
  bytesToHex,
  clusterDomainFromGenesisHash,
  initializeVaultChallenge,
  transferChallenge,
  VERIAGENT_PROGRAM_ID,
} from "../src";

describe("program challenge parity", () => {
  test("binds a cluster to the full genesis-hash string", () => {
    expect(
      bytesToHex(
        clusterDomainFromGenesisHash(
          "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG",
        ),
      ),
    ).toBe("3292b0a10ea716fb77d5a951acef59c2c6b0dec5850e1f6feb40da7386991ffe");
  });

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
      "65b21cd650129a80a4f0f1dcadcabfb4d64359057ba7f91d87e31e086d2ad883",
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
      "57ec07d353febe49b769543b3e6049ce55f8fa1fb15b24b5b46d2770c20e0af6",
    );
  });
});