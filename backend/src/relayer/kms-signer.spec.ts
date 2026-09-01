/**
 * Covers the signature conversion between KMS and Ethereum.
 *
 * The KMS calls themselves are not exercised here — they need credentials. What
 * is exercised is the part that is easy to get subtly wrong and impossible to
 * notice: DER carries signed, minimally-encoded integers, so fixed 32-byte
 * reads corrupt exactly the signatures that carry a leading zero or a short
 * value. Those produce a valid-looking signature that recovers the wrong
 * address, which in production is a transaction rejected for no visible reason.
 */

import { ethers } from 'ethers';
import { decodeDerSignature, normaliseS } from './kms-signer';

const N = BigInt('0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141');

/** Builds the DER a signer would emit for a given (r, s). */
function encodeDer(r: bigint, s: bigint): Buffer {
  const int = (v: bigint) => {
    let hex = v.toString(16);
    if (hex.length % 2) hex = '0' + hex;
    let bytes = Buffer.from(hex, 'hex');
    // DER INTEGERs are signed: a leading high bit needs a zero byte in front.
    if (bytes[0] & 0x80) bytes = Buffer.concat([Buffer.from([0x00]), bytes]);
    return Buffer.concat([Buffer.from([0x02, bytes.length]), bytes]);
  };
  const body = Buffer.concat([int(r), int(s)]);
  return Buffer.concat([Buffer.from([0x30, body.length]), body]);
}

describe('decodeDerSignature', () => {
  it('round-trips a full-width signature', () => {
    const r = BigInt('0x' + '11'.repeat(32));
    const s = BigInt('0x' + '22'.repeat(32));

    expect(decodeDerSignature(encodeDer(r, s))).toEqual({ r, s });
  });

  it('handles the leading-zero padding DER adds to a high-bit value', () => {
    // 0xff… has the high bit set, so DER prefixes a zero byte and the INTEGER
    // is 33 bytes. Reading a fixed 32 would drop the last byte of r.
    const r = BigInt('0x' + 'ff'.repeat(32));
    const s = BigInt('0x' + '01'.repeat(32));

    const der = encodeDer(r, s);
    expect(der[3]).toBe(33);
    expect(decodeDerSignature(der)).toEqual({ r, s });
  });

  it('handles a short value, which DER encodes in fewer than 32 bytes', () => {
    const r = 1n;
    const s = BigInt('0x' + '7f'.repeat(32));

    expect(decodeDerSignature(encodeDer(r, s))).toEqual({ r, s });
  });

  it('refuses input that is not a DER sequence', () => {
    expect(() => decodeDerSignature(Buffer.from([0x02, 0x01, 0x01]))).toThrow(/SEQUENCE/);
  });
});

describe('normaliseS', () => {
  it('leaves a low-s signature alone', () => {
    const s = N / 2n - 1n;
    expect(normaliseS(s)).toBe(s);
  });

  it('folds a high-s signature to its low-s equivalent', () => {
    const s = N / 2n + 1n;
    expect(normaliseS(s)).toBe(N - s);
  });

  it('never returns a value above half the curve order', () => {
    // EIP-2 is the whole reason this exists: Ethereum rejects high-s outright,
    // and KMS has no opinion about which half it returns.
    for (const s of [1n, N / 2n, N / 2n + 1n, N - 1n]) {
      expect(normaliseS(s) <= N / 2n).toBe(true);
    }
  });

  it('is idempotent', () => {
    const s = N - 12345n;
    expect(normaliseS(normaliseS(s))).toBe(normaliseS(s));
  });
});

describe('signTransaction input handling', () => {
  /**
   * The regression that reached a running system.
   *
   * `AbstractSigner.sendTransaction` — the path every contract call takes —
   * populates the request and passes a `Transaction` *instance*. Its fields sit
   * behind prototype getters, so `resolveProperties` saw no own enumerable
   * properties and returned `{}`. The signer then produced a completely empty
   * transaction (`0x02f84c8080…`) and the node rejected it with "invalid chain
   * id for signer: have 0 want 968". A plain-object test passed throughout,
   * which is exactly why this one uses an instance.
   */
  it('a Transaction instance exposes nothing to resolveProperties', async () => {
    const tx = ethers.Transaction.from({
      to: '0x' + '11'.repeat(20),
      value: 1n,
      chainId: 968n,
      nonce: 7,
      gasLimit: 21000n,
      maxFeePerGas: 5n,
      maxPriorityFeePerGas: 1n,
      type: 2,
    });

    // The trap: own enumerable properties are empty, so anything that copies
    // the object rather than reading through it loses every field.
    expect(Object.keys(tx)).toHaveLength(0);
    expect(await ethers.resolveProperties(tx as any)).toEqual({});

    // Reading through the getters preserves them, which is what the fix does.
    const cloned = ethers.Transaction.from(tx);
    expect(cloned.chainId).toBe(968n);
    expect(cloned.nonce).toBe(7);
    expect(cloned.gasLimit).toBe(21000n);
  });

  it('an empty transaction serialises to the shape the node rejected', () => {
    // Pins the signature of the bug: chainId 0 is what "have 0" reported.
    const empty = ethers.Transaction.from({ type: 2 });
    expect(empty.chainId).toBe(0n);
    expect(empty.unsignedSerialized.startsWith('0x02')).toBe(true);
  });
});
