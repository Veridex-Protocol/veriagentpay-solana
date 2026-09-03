import { PublicKey, SystemProgram } from '@solana/web3.js';

import { SolanaChainService } from './solana-chain.service';

const VAULT_ADDRESS = '5u5xG3S68S9nDsWYaTQvtSuBsUnNAK11SR1jhgpsgBr9';

describe('SolanaChainService vault lookup', () => {
  it('treats a funded zero-data PDA as an uninitialized vault', async () => {
    const service = serviceWithAccount(SystemProgram.programId, Buffer.alloc(0));

    await expect(service.readVault(VAULT_ADDRESS)).resolves.toBeNull();
  });

  it('rejects an account owned by another program', async () => {
    const service = serviceWithAccount(new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'), Buffer.alloc(0));

    await expect(service.readVault(VAULT_ADDRESS)).rejects.toThrow(
      'Vault address is not owned by the VeriAgent Solana program',
    );
  });
});

function serviceWithAccount(owner: PublicKey, data: Buffer): SolanaChainService {
  const service = new SolanaChainService();
  Object.defineProperty(service.connection, 'getAccountInfo', {
    value: async () => ({
      data,
      executable: false,
      lamports: 5_000_000_000,
      owner,
      rentEpoch: 0,
    }),
  });
  return service;
}