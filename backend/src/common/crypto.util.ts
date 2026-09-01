import * as crypto from 'crypto';

/**
 * Length-safe, constant-time string comparison for secrets.
 *
 * `crypto.timingSafeEqual` throws when the buffers differ in length, so the
 * length check has to happen first — and that check leaks length, which is
 * acceptable here because every value compared through this helper is a
 * fixed-length digest or token.
 *
 * @see docs/audit/11th-august-2026-1.md — SEC-054
 */
export function safeEqual(a: string | undefined | null, b: string | undefined | null): boolean {
  if (!a || !b) return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/** Constant-time comparison of two raw buffers, tolerant of unequal lengths. */
export function safeEqualBuffer(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
