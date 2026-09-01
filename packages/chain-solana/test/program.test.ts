import { describe, expect, test } from "bun:test";

import { decodeVaultAccount } from "../src";

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