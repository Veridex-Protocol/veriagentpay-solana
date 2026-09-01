/**
 * Re-wraps session data keys from the local master secret to KMS.
 *
 * Session private keys are encrypted under a per-record data key; only the
 * wrapping of that data key changes here. The session key itself is never
 * rotated, so live sessions keep working and users see nothing.
 *
 * Run order for the migration:
 *
 *   1. Deploy with both SESSION_KEY_KMS_KEY_ID and SESSION_KEY_MASTER_SECRET
 *      set. New sessions are wrapped by KMS immediately; existing rows are
 *      still readable through the local secret.
 *   2. Run this with --apply until it reports zero remaining.
 *   3. Remove SESSION_KEY_MASTER_SECRET from the environment and redeploy.
 *
 * Dry run by default. Pass --apply to write.
 *
 *   bun run scripts/backfill-session-keys-kms.ts
 *   bun run scripts/backfill-session-keys-kms.ts --apply
 */

import { PrismaClient } from '@prisma/client';
import { isLegacyWrapped, kmsEnabled, unwrapDataKey, wrapDataKey } from '../src/relayer/key-wrapping';

const prisma = new PrismaClient();
const apply = process.argv.includes('--apply');

function context(keyHash: string): Record<string, string> {
  return { purpose: 'session-key', keyHash };
}

async function main() {
  if (!kmsEnabled()) {
    throw new Error('SESSION_KEY_KMS_KEY_ID is not set; there is nothing to migrate to.');
  }

  // Revoked and expired rows are left alone: they can no longer be used to
  // sign, so re-wrapping them spends KMS calls to protect nothing. They are
  // reported separately so the count is not mistaken for incomplete work.
  const rows = await prisma.sessionKey.findMany({
    where: { revokedAt: null, expiryAt: { gt: new Date() } },
    select: { id: true, keyHash: true, encryptedSymmetricKey: true },
  });

  const legacy = rows.filter(
    (r) => r.encryptedSymmetricKey && isLegacyWrapped(r.encryptedSymmetricKey),
  );

  console.log(`${rows.length} active session keys, ${legacy.length} still locally wrapped.`);

  if (legacy.length === 0) {
    console.log('Nothing to do. SESSION_KEY_MASTER_SECRET can be removed once');
    console.log('no expired rows need reading either.');
    return;
  }

  if (!apply) {
    console.log('Dry run. Re-run with --apply to re-wrap them.');
    return;
  }

  let migrated = 0;
  let failed = 0;

  for (const row of legacy) {
    try {
      // Unwrap through the legacy path, re-wrap through KMS. The encrypted
      // session key itself is untouched, so a failure here leaves the row
      // exactly as it was rather than half-migrated.
      const dataKey = await unwrapDataKey(row.encryptedSymmetricKey!, context(row.keyHash));
      const rewrapped = await wrapDataKey(dataKey, context(row.keyHash));

      await prisma.sessionKey.update({
        where: { id: row.id },
        data: { encryptedSymmetricKey: rewrapped },
      });
      migrated++;
    } catch (err: any) {
      failed++;
      console.error(`  ${row.keyHash}: ${err.message}`);
    }
  }

  console.log(`Re-wrapped ${migrated}, failed ${failed}.`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
