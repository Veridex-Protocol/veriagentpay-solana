import { IdentityService } from './identity.service';
import { isSolanaAddress } from '../chains/solana/solana-account';

describe('IdentityService', () => {
  let service: IdentityService;

  beforeEach(() => {
    service = new IdentityService({} as any);
    service.onModuleInit();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should compute a deterministic Solana vault PDA', async () => {
    const salt = '0x1234567890123456789012345678901234567890123456789012345678901234';
    const ownerKeyHash = `0x${'ab'.repeat(32)}`;
    const first = await service.computeCounterfactualAddress(salt, ownerKeyHash);
    const second = await service.computeCounterfactualAddress(salt, ownerKeyHash);
    const different = await service.computeCounterfactualAddress(
      `0x${'12'.repeat(32)}`,
      ownerKeyHash,
    );

    expect(first).toBe(second);
    expect(first).not.toBe(different);
    expect(isSolanaAddress(first)).toBe(true);
  });

  it('should validate Telegram initData HMAC correctly', () => {
    const isValid = service.validateTelegramInitData('', 'bot_token_123');
    expect(isValid).toBe(false);
  });
});
