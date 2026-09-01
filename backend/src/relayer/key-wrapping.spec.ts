/**
 * Covers the session data-key wrapping layer.
 *
 * The property that matters for the migration is that a row written before KMS
 * existed stays readable afterwards. If that breaks, every user with a live
 * session is signed out and their in-flight payments fail — so it is asserted
 * directly rather than inferred from the format tag.
 *
 * KMS itself is not exercised here; these tests cover format dispatch and the
 * local path. The KMS path needs credentials and belongs in an integration run.
 */

const REQUIRED_ENV: Record<string, string> = {
  JWT_SECRET: 'a'.repeat(48),
  ADMIN_JWT_SECRET: 'b'.repeat(48),
  DEEPLINK_SECRET: 'c'.repeat(48),
  INTERACTIVE_ACTION_SECRET: 'd'.repeat(48),
  GOOGLE_OAUTH_CLIENT_ID: 'e'.repeat(48),
  RELAYER_PRIVATE_KEY: '0x' + 'f'.repeat(64),
  SESSION_KEY_MASTER_SECRET: '9'.repeat(64),
};

for (const [key, value] of Object.entries(REQUIRED_ENV)) {
  process.env[key] = process.env[key] ?? value;
}
// Deliberately does NOT unset SESSION_KEY_KMS_KEY_ID. `secrets.ts` reads it
// once at module load and other specs may already have imported it, so a delete
// here changes nothing but the comparison below — it made this file assert
// against a value it had not actually changed.

// The runner may have loaded a .env, so the effective secret is whatever ended
// up in the environment — not necessarily the literal above. Read it back, or
// the legacy test encrypts under one key and the module decrypts under another.
const EFFECTIVE_MASTER_SECRET = process.env.SESSION_KEY_MASTER_SECRET!;

const CONTEXT = { purpose: 'session-key', keyHash: '0xabc' };

describe('session data-key wrapping', () => {
  it('round-trips a data key through the local path', async () => {
    const { wrapDataKey, unwrapDataKey } = await import('./key-wrapping');

    const dataKey = '1'.repeat(64);
    const wrapped = await wrapDataKey(dataKey, CONTEXT);

    expect(wrapped).not.toContain(dataKey);
    expect(await unwrapDataKey(wrapped, CONTEXT)).toBe(dataKey);
  });

  it('reads a row wrapped before KMS existed', async () => {
    const { unwrapDataKey, isLegacyWrapped } = await import('./key-wrapping');
    const { encryptSymmetric } = await import('./symmetric-crypto');

    // Exactly what provisionSessionKey used to write.
    const dataKey = '2'.repeat(64);
    const legacyBlob = encryptSymmetric(dataKey, EFFECTIVE_MASTER_SECRET);

    expect(isLegacyWrapped(legacyBlob)).toBe(true);
    expect(await unwrapDataKey(legacyBlob, CONTEXT)).toBe(dataKey);
  });

  it('reports KMS as enabled exactly when a key id is configured', async () => {
    const { kmsEnabled } = await import('./key-wrapping');
    // Asserted against the environment rather than hard-coded: `secrets.ts`
    // reads the variable once at module load, and other specs may have already
    // imported it, so a per-test `delete` cannot change the cached value. The
    // original form asserted `false` and broke the moment a real key was
    // configured — which is a property of the deployment, not of this code.
    expect(kmsEnabled()).toBe(Boolean(process.env.SESSION_KEY_KMS_KEY_ID));
  });

  it('refuses a blob in no recognised format rather than guessing', async () => {
    const { unwrapDataKey } = await import('./key-wrapping');

    await expect(unwrapDataKey('not-a-real-blob', CONTEXT)).rejects.toThrow(
      /Unrecognised session data key format/,
    );
  });

  it('does not treat a KMS blob as legacy', async () => {
    const { isLegacyWrapped } = await import('./key-wrapping');
    expect(isLegacyWrapped('kms:v1:AQIDAHh...')).toBe(false);
  });
});
