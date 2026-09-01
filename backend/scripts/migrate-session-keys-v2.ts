import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';
import { decryptSymmetric, encryptSymmetric } from '../src/relayer/relayer.service';
import { SESSION_KEY_MASTER_SECRET } from '../src/config/secrets';

const prisma = new PrismaClient();

async function main() {
  // Now optional, because KMS wrapping replaced it. This script predates that
  // and only understands locally-wrapped rows, so it needs the secret present.
  if (!SESSION_KEY_MASTER_SECRET) {
    throw new Error(
      'SESSION_KEY_MASTER_SECRET is not set. This script only migrates rows ' +
        'wrapped by the local secret; for the KMS migration use ' +
        'scripts/backfill-session-keys-kms.ts instead.',
    );
  }

  const rows = await prisma.sessionKey.findMany({ where: { revokedAt: null } });
  let migrated = 0;
  let revoked = 0;

  for (const row of rows) {
    // A missing wrapped DEK means the key may be plaintext. It is not safe to
    // guess or re-wrap; revoke it and require fresh provisioning.
    if (!row.encryptedSymmetricKey) {
      await prisma.sessionKey.update({ where: { id: row.id }, data: { revokedAt: new Date() } });
      revoked++;
      continue;
    }
    if (row.encryptedKey.startsWith('v2:') && row.encryptedSymmetricKey.startsWith('v2:')) continue;

    const oldDek = decryptSymmetric(row.encryptedSymmetricKey, SESSION_KEY_MASTER_SECRET);
    const privateKey = decryptSymmetric(row.encryptedKey, oldDek);
    const newDek = crypto.randomBytes(32).toString('hex');
    await prisma.sessionKey.update({
      where: { id: row.id },
      data: {
        encryptedKey: encryptSymmetric(privateKey, newDek),
        encryptedSymmetricKey: encryptSymmetric(newDek, SESSION_KEY_MASTER_SECRET),
      },
    });
    migrated++;
  }

  console.info(`Session-key migration complete: migrated=${migrated} revoked_plaintext_or_unwrapped=${revoked}`);
}

main().finally(() => prisma.$disconnect());
