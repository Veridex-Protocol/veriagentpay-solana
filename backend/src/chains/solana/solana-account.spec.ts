import {
  compressedP256PublicKey,
  deriveVaultFromPasskey,
  identitySalt,
  isSolanaAddress,
  rootKeyHash,
} from './solana-account';

describe('Solana account derivation', () => {
  it('derives stable, case-sensitive PDA addresses from passkey coordinates', () => {
    const first = deriveVaultFromPasskey('1', '2', 'web', 'web:user-1');
    const second = deriveVaultFromPasskey('1', '2', 'web', 'web:user-1');
    const otherIdentity = deriveVaultFromPasskey('1', '2', 'web', 'web:user-2');

    expect(first).toEqual(second);
    expect(first.address).not.toBe(otherIdentity.address);
    expect(isSolanaAddress(first.address)).toBe(true);
  });

  it('compresses P-256 keys and hashes the compressed representation', () => {
    expect(compressedP256PublicKey('1', '2')).toHaveLength(33);
    expect(compressedP256PublicKey('1', '2')[0]).toBe(2);
    expect(compressedP256PublicKey('1', '3')[0]).toBe(3);
    expect(rootKeyHash('1', '2')).toHaveLength(32);
    expect(identitySalt('telegram', '123')).toHaveLength(32);
  });

  it('rejects EVM addresses as Solana account identifiers', () => {
    expect(isSolanaAddress('0x0000000000000000000000000000000000000001')).toBe(false);
  });
});