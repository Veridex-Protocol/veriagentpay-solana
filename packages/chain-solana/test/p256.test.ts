import { describe, expect, test } from "bun:test";

import { createSecp256r1Instruction, derToCompactLowS } from "../src";

function derInteger(bytes: number[]): number[] {
  return [0x02, bytes.length, ...bytes];
}

function derSignature(r: number[], s: number[]): Uint8Array {
  const values = [...derInteger(r), ...derInteger(s)];
  return Uint8Array.from([0x30, values.length, ...values]);
}

describe("P-256 WebAuthn proof encoding", () => {
  test("pads compact signature scalars", () => {
    const compact = derToCompactLowS(derSignature([1], [2]));
    expect(compact).toHaveLength(64);
    expect(compact[31]).toBe(1);
    expect(compact[63]).toBe(2);
  });

  test("rejects non-canonical DER integers", () => {
    expect(() => derToCompactLowS(derSignature([0, 1], [2]))).toThrow();
    expect(() => derToCompactLowS(derSignature([0x80], [2]))).toThrow();
  });

  test("builds the exact inline precompile layout expected on-chain", () => {
    const instruction = createSecp256r1Instruction({
      compressedPublicKey: Uint8Array.from([2, ...new Uint8Array(32).fill(7)]),
      authenticatorData: new Uint8Array(37).fill(8),
      clientDataJson: new TextEncoder().encode('{"type":"webauthn.get"}'),
      signatureDer: derSignature([1], [2]),
    });

    expect(instruction.keys).toHaveLength(0);
    expect(instruction.data[0]).toBe(1);
    expect(instruction.data.readUInt16LE(2)).toBe(49);
    expect(instruction.data.readUInt16LE(6)).toBe(16);
    expect(instruction.data.readUInt16LE(10)).toBe(113);
    expect(instruction.data.readUInt16LE(14)).toBe(0xffff);
  });
});