import { describe, expect, test } from "bun:test";

import {
  base64UrlToBytes,
  derToCompactLowS,
  veridexSignatureToAssertion,
} from "../src";

describe("Veridex PasskeyManager assertion adapter", () => {
  test("round-trips normalized SDK scalars through canonical DER", () => {
    const assertion = veridexSignatureToAssertion("credential_123", {
      authenticatorData: `0x${"08".repeat(37)}`,
      clientDataJSON:
        '{"type":"webauthn.get","challenge":"abc","origin":"http://localhost:3000"}',
      r: 1n,
      s: 2n,
    });

    expect(base64UrlToBytes(assertion.response.authenticatorData)).toEqual(
      new Uint8Array(37).fill(8),
    );
    const compact = derToCompactLowS(
      base64UrlToBytes(assertion.response.signature),
    );
    expect(compact[31]).toBe(1);
    expect(compact[63]).toBe(2);
    expect(
      new TextDecoder().decode(base64UrlToBytes(assertion.response.clientDataJSON)),
    ).toContain('"type":"webauthn.get"');
  });

  test("prefixes positive DER integers whose high bit is set", () => {
    const assertion = veridexSignatureToAssertion("credential_123", {
      authenticatorData: `0x${"08".repeat(37)}`,
      clientDataJSON: "{}",
      r: 0x80n,
      s: 0xffn,
    });
    const der = base64UrlToBytes(assertion.response.signature);

    expect(Array.from(der)).toEqual([
      0x30, 0x08, 0x02, 0x02, 0x00, 0x80, 0x02, 0x02, 0x00, 0xff,
    ]);
  });
});