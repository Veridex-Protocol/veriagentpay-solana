import { IdentityService } from './identity.service';
import { deriveVaultAddress, identitySalt, isSolanaAddress } from '../chains/solana/solana-account';

describe('IdentityService Solana PDA parity', () => {
  let identityService: IdentityService;

  beforeEach(() => {
    const prisma = {
      socialNode: { findFirst: async () => null },
      user: {
        findFirst: async () => null,
        create: async () => ({ id: 'placeholder' }),
      },
    };
    identityService = new IdentityService(prisma as any);
    identityService.onModuleInit();
  });

  it('uses the same identity salt for unresolved contacts and passkey registration', async () => {
    const platform = 'telegram';
    const handle = '123456789';

    const resolvedAddress = await identityService.resolveContact(platform, handle);
    const salt = identitySalt(platform, handle);
    const expectedAddress = deriveVaultAddress(Buffer.alloc(32), salt);

    expect(resolvedAddress).toEqual(expectedAddress);
    expect(isSolanaAddress(resolvedAddress)).toBe(true);
  });
});
