import { beforeAll, afterAll, describe, expect, it, mock } from 'bun:test';
import { ethers } from 'ethers';

// The DI graph reaches @veridex/sdk, which sync-requires an ESM-only bundle and
// throws under the test runner. Nothing here exercises it.
mock.module('@veridex/sdk', () => ({ PasskeyManager: class {}, SessionKeyManager: class {} }));

const RPC = process.env.BOTCHAIN_RPC_URL || 'https://rpc.bohr.life/';
const TRANSFER = ethers.id('Transfer(address,address,uint256)');

let PrismaClient: any, DepositListenerService: any;
let prisma: any, provider: ethers.JsonRpcProvider;
let seededUserId: string | null = null;
let sample: ethers.Log | undefined;
let recipient = '';

/** Every user this file creates, cleaned up together in {@link afterAll}. */
const seededUserIds: string[] = [];

beforeAll(async () => {
  // Own cursor, set before the service module is loaded. Otherwise this spec
  // rewinds the position a running dev server is also advancing, and the two
  // listeners race over the same block range and the same Deposit rows.
  process.env.DEPOSIT_CURSOR_NAME = 'erc20-deposits-spec';

  ({ PrismaClient } = await import('@prisma/client'));
  ({ DepositListenerService } = await import('./deposit-listener.service'));
  prisma = new PrismaClient();
  provider = new ethers.JsonRpcProvider(RPC);
});

afterAll(async () => {
  // Deleting the user cascades to its SmartWallet, which is what actually
  // holds the unique address.
  for (const id of seededUserIds) {
    await prisma.user.delete({ where: { id } }).catch(() => {});
  }
  await prisma?.$disconnect();
});

/**
 * Ensures `address` is registered as one of our smart wallets.
 *
 * @dev Reuses the existing owner rather than replacing it. The addresses here
 *      come from real Transfer logs on a live chain, so one of them can belong
 *      to a genuine account in the same database — an earlier version deleted
 *      whatever held the address, which would have destroyed that account. It
 *      also swallowed the failure when a non-cascading relation blocked the
 *      delete, leaving the row in place and the subsequent create failing on
 *      `SmartWallet.address` with no visible cause.
 *
 *      Reuse is also what makes the spec re-runnable: only rows this file
 *      created are registered for cleanup, so a pre-existing owner survives.
 */
async function seedWalletOwner(address: string, tag: string) {
  const existing = await prisma.smartWallet.findUnique({
    where: { address },
    select: { user: { select: { id: true } } },
  });
  if (existing?.user) return existing.user;

  const user = await prisma.user.create({
    data: {
      // Random suffix, not a timestamp: two calls in the same millisecond
      // collide on the unique username.
      username: `${tag}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      smartWallet: { create: { address, publicKeyX: '1', publicKeyY: '2', salt: '0x0' } },
    },
  });
  seededUserIds.push(user.id);
  return user;
}

function makeService() {
  return new DepositListenerService(
    prisma,
    { record: async () => undefined } as any,
    { notifyUser: async () => undefined } as any,
    // Positional, and the constructor grew a `userTokens` parameter — without
    // a stub here the gateway lands in its slot and `onTokenListChanged` is
    // undefined. Only visible when the chain has traffic, since these tests
    // return early otherwise.
    { listAllActive: async () => [], onTokenListChanged: () => undefined } as any,
    { emitToUser: () => undefined } as any,
  );
}

describe('DepositListenerService (live BOTChain)', () => {
  it('credits a real on-chain ERC-20 transfer as an external deposit', async () => {
    const head = await provider.getBlockNumber();
    const logs = await provider.getLogs({ fromBlock: head - 400, toBlock: head, topics: [TRANSFER] });
    // Pick a transfer the service is actually supposed to credit.
    //
    // Taking the first non-zero log asserted against traffic the listener must
    // ignore. On this chain the window is usually a vault paying the pool
    // contract, which is neither external (the sender is one of our wallets)
    // nor a user deposit (the recipient is a protocol contract) — and seeding
    // the recipient made a *protocol address* look like a user's wallet.
    //
    // A creditable deposit is: an outside sender, paying an address that is not
    // one of our contracts.
    const protocolAddresses = new Set<string>(
      [
        process.env.SOCIAL_PAYMENTS_ADDRESS,
        process.env.ENVELOPE_ESCROW_ADDRESS,
        process.env.AGENT_VAULT_V2_ADDRESS,
        process.env.GROUP_LENDING_POOL_ADDRESS,
        process.env.POOL_CONTRACT_ADDRESS,
        process.env.PAY_VAULT_FACTORY_ADDRESS,
        process.env.PROTOCOL_TREASURY_ADDRESS,
        process.env.POOL_RESERVE_ADDRESS,
        await (async () => {
          const { createRelayerSigner } = await import('../relayer/relayer-signer.factory');
          return createRelayerSigner().getAddress().catch(() => undefined);
        })(),
      ]
        .filter((a): a is string => Boolean(a) && ethers.isAddress(a!))
        .map((a) => a.toLowerCase()),
    );

    const ourWallets = new Set<string>(
      (await prisma.smartWallet.findMany({ select: { address: true } })).map((w: any) =>
        w.address.toLowerCase(),
      ),
    );

    sample = logs.find((l) => {
      if (l.topics.length !== 3 || BigInt(l.data) === 0n) return false;
      const from = ethers.getAddress('0x' + l.topics[1].slice(-40)).toLowerCase();
      const to = ethers.getAddress('0x' + l.topics[2].slice(-40)).toLowerCase();
      // Internal sends and protocol payouts are logged by the originating
      // service; a protocol contract is never a user's wallet.
      return !protocolAddresses.has(from) && !ourWallets.has(from) && !protocolAddresses.has(to);
    });
    if (!sample) return; // No traffic in window; nothing to assert against.

    recipient = ethers.getAddress('0x' + sample.topics[2].slice(-40));

    const user = await seedWalletOwner(recipient, 'deposit_e2e');
    seededUserId = user.id;

    const chainId = Number((await provider.getNetwork()).chainId);
    await prisma.indexerCursor.upsert({
      where: { name_chainId: { name: process.env.DEPOSIT_CURSOR_NAME!, chainId } },
      update: { lastBlock: BigInt(sample.blockNumber - 1) },
      create: { name: process.env.DEPOSIT_CURSOR_NAME!, chainId, lastBlock: BigInt(sample.blockNumber - 1) },
    });

    const svc = makeService();
    await svc.onModuleInit();
    svc.onModuleDestroy();
    const result = await svc.scanOnce();

    expect(result.scannedTo).toBeGreaterThanOrEqual(sample.blockNumber);

    const deposits = await prisma.deposit.findMany({ where: { userId: user.id } });
    expect(deposits.length).toBeGreaterThan(0);

    const d = deposits[0];
    expect(d.toAddress.toLowerCase()).toBe(recipient.toLowerCase());
    expect(BigInt(d.amountRaw)).toBeGreaterThan(0n);
    expect(d.txHash).toMatch(/^0x[0-9a-f]{64}$/);
  }, 60_000);

  it('is idempotent — re-scanning the same range creates no duplicates', async () => {
    if (!sample || !seededUserId) return;

    const before = await prisma.deposit.count({ where: { userId: seededUserId } });
    const chainId = Number((await provider.getNetwork()).chainId);

    // Rewind the cursor and scan the identical range again.
    await prisma.indexerCursor.update({
      where: { name_chainId: { name: process.env.DEPOSIT_CURSOR_NAME!, chainId } },
      data: { lastBlock: BigInt(sample.blockNumber - 1) },
    });

    const svc = makeService();
    await svc.onModuleInit();
    svc.onModuleDestroy();
    await svc.scanOnce();

    const after = await prisma.deposit.count({ where: { userId: seededUserId } });
    // The (txHash, logIndex) unique constraint is what guarantees this.
    expect(after).toBe(before);
  }, 60_000);

  it('does not credit internal VeriAgent-to-VeriAgent transfers', async () => {
    if (!sample || !seededUserId) return;

    const sender = ethers.getAddress('0x' + sample.topics[1].slice(-40));
    // Register the SENDER as one of our smart wallets → now an internal send.
    await seedWalletOwner(sender, 'deposit_internal');

    // Scoped to the transaction this spec credited. `seededUserId` may now be a
    // pre-existing account whose real deposits must not be touched.
    await prisma.deposit.deleteMany({
      where: { userId: seededUserId, txHash: sample.transactionHash },
    });
    const chainId = Number((await provider.getNetwork()).chainId);
    await prisma.indexerCursor.update({
      where: { name_chainId: { name: process.env.DEPOSIT_CURSOR_NAME!, chainId } },
      data: { lastBlock: BigInt(sample.blockNumber - 1) },
    });

    const svc = makeService();
    await svc.onModuleInit();
    svc.onModuleDestroy();
    await svc.scanOnce();

    // Scoped to this transaction, matching the delete above. The recipient can
    // be a pre-existing account with genuine deposits from the same sender —
    // counting by sender alone asserted against the live listener's work
    // rather than this scan's.
    const credited = await prisma.deposit.count({
      where: { userId: seededUserId, fromAddress: sender, txHash: sample.transactionHash },
    });
    expect(credited).toBe(0);
  }, 60_000);
});
