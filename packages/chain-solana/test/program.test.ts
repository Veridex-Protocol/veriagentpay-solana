import { describe, expect, test } from "bun:test";

import { PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";

import {
  createPaymentLinkWithSessionInstruction,
  createSolPasskeyTransferInstruction,
  createSolPaymentLinkWithPasskeyInstruction,
  decodePaymentLinkAccount,
  decodeVaultAccount,
  derivePaymentLink,
  derivePaymentLinkTokenAccount,
} from "../src";

describe("vault account decoding", () => {
  test("reads the root key and nonce without losing u64 precision", () => {
    const data = new Uint8Array(123);
    data[8] = 1;
    data[9] = 254;
    data.set(new Uint8Array(33).fill(2), 10);
    data.set(new Uint8Array(32).fill(3), 43);
    data.set(new Uint8Array(32).fill(4), 75);
    const view = new DataView(data.buffer);
    view.setBigUint64(107, 9_007_199_254_740_999n, true);
    view.setBigInt64(115, 1_800_000_000n, true);

    const vault = decodeVaultAccount(data);
    expect(vault.version).toBe(1);
    expect(vault.bump).toBe(254);
    expect(vault.rootPublicKey).toEqual(new Uint8Array(33).fill(2));
    expect(vault.nonce).toBe(9_007_199_254_740_999n);
  });
});

describe("payment-link program helpers", () => {
  test("derives the link PDA and escrow token account deterministically", () => {
    const vault = new PublicKey(new Uint8Array(32).fill(7));
    const mint = new PublicKey(new Uint8Array(32).fill(8));
    const linkId = new Uint8Array(32).fill(9);
    const first = derivePaymentLink(vault, linkId);

    expect(derivePaymentLink(vault, linkId)).toEqual(first);
    expect(derivePaymentLinkTokenAccount(first, mint)).not.toEqual(first);
  });

  test("encodes session-funded creation with Anchor account ordering", () => {
    const keys = Array.from({ length: 9 }, (_, index) => new PublicKey(new Uint8Array(32).fill(index + 1)));
    const instruction = createPaymentLinkWithSessionInstruction({
      payer: keys[0]!,
      config: keys[1]!,
      vault: keys[2]!,
      session: keys[3]!,
      sessionSigner: keys[4]!,
      stablecoinMint: keys[5]!,
      vaultTokenAccount: keys[6]!,
      paymentLink: keys[7]!,
      escrowTokenAccount: keys[8]!,
      linkId: new Uint8Array(32).fill(10),
      recipientCommitment: new Uint8Array(32).fill(11),
      amount: 5_000_000n,
      expiresAtUnix: 1_800_000_000n,
      sessionNonce: 4n,
    });

    expect(instruction.keys).toHaveLength(12);
    expect(instruction.keys[0]).toMatchObject({ pubkey: keys[0], isSigner: true, isWritable: true });
    expect(instruction.keys[4]).toMatchObject({ pubkey: keys[4], isSigner: true, isWritable: false });
    expect(instruction.keys[9]?.pubkey).toEqual(TOKEN_PROGRAM_ID);
    expect(instruction.keys[11]?.pubkey).toEqual(SystemProgram.programId);
    expect(instruction.data).toHaveLength(96);
  });

  test("decodes payment-link state without losing atomic amounts", () => {
    const data = new Uint8Array(203);
    data[8] = 1;
    data[9] = 200;
    data[10] = 1;
    data.set(new Uint8Array(32).fill(2), 11);
    data.set(new Uint8Array(32).fill(3), 43);
    data.set(new Uint8Array(32).fill(4), 75);
    data.set(new Uint8Array(32).fill(5), 107);
    const view = new DataView(data.buffer);
    view.setBigUint64(139, 9_007_199_254_740_999n, true);
    view.setBigInt64(147, 1_800_000_000n, true);
    data.set(new Uint8Array(32).fill(6), 171);

    const link = decodePaymentLinkAccount(data);
    expect(link.status).toBe(1);
    expect(link.amount).toBe(9_007_199_254_740_999n);
    expect(link.claimedDestination).toEqual(new PublicKey(new Uint8Array(32).fill(6)));
  });
});

describe("native SOL program helpers", () => {
  test("encodes passkey SOL transfer account ordering", () => {
    const keys = Array.from({ length: 4 }, (_, index) => new PublicKey(new Uint8Array(32).fill(index + 10)));
    const instruction = createSolPasskeyTransferInstruction({
      payer: keys[0]!,
      config: keys[1]!,
      vault: keys[2]!,
      recipient: keys[3]!,
      amountLamports: 1_000_000_000n,
      vaultNonce: 3n,
      proofExpiresAt: 1_800_000_000n,
      authenticatorData: new Uint8Array(37),
      clientDataJson: new TextEncoder().encode("{}"),
    });

    expect(instruction.keys).toHaveLength(5);
    expect(instruction.keys[0]).toMatchObject({ pubkey: keys[0], isSigner: true, isWritable: true });
    expect(instruction.keys[2]).toMatchObject({ pubkey: keys[2], isSigner: false, isWritable: true });
    expect(instruction.keys[3]).toMatchObject({ pubkey: keys[3], isSigner: false, isWritable: true });
  });

  test("encodes passkey SOL payment-link identity and accounts", () => {
    const keys = Array.from({ length: 4 }, (_, index) => new PublicKey(new Uint8Array(32).fill(index + 20)));
    const instruction = createSolPaymentLinkWithPasskeyInstruction({
      payer: keys[0]!,
      config: keys[1]!,
      vault: keys[2]!,
      paymentLink: keys[3]!,
      linkId: new Uint8Array(32).fill(30),
      recipientCommitment: new Uint8Array(32).fill(31),
      amountLamports: 500_000_000n,
      linkExpiresAtUnix: 1_800_000_000n,
      vaultNonce: 4n,
      proofExpiresAt: 1_700_000_000n,
      authenticatorData: new Uint8Array(37),
      clientDataJson: new TextEncoder().encode("{}"),
    });

    expect(instruction.keys).toHaveLength(6);
    expect(instruction.keys[3]).toMatchObject({ pubkey: keys[3], isWritable: true });
    expect(instruction.keys[5]?.pubkey).toEqual(SystemProgram.programId);
    expect(instruction.data.slice(8, 40)).toEqual(new Uint8Array(32).fill(30));
    expect(instruction.data.slice(40, 72)).toEqual(new Uint8Array(32).fill(31));
  });
});