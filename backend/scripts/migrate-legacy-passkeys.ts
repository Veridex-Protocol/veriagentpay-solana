import { PrismaService } from '../src/prisma/prisma.service';
import { CredentialVaultService } from '../src/identity/credential-vault.service';

async function main() {
  const apply = process.argv.includes('--apply');
  const prisma = new PrismaService();
  const vault = new CredentialVaultService(prisma);
  vault.onModuleInit();

  try {
    const result = await vault.migrateLegacyWebAuthnPublicKeys({
      apply,
      requireAllCompatible: true,
    });
    console.log(JSON.stringify(result, null, 2));

    if (result.incompatible > 0 || result.mode === 'apply-aborted') {
      process.exitCode = 2;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(error => {
  console.error(`Legacy passkey migration failed: ${error.message}`);
  process.exitCode = 1;
});
