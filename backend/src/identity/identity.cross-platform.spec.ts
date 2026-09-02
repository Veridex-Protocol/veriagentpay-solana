import { beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test';

// IdentityService pulls in @veridex/sdk, which performs a synchronous require()
// of an ESM-only bundle and throws under the test runner. None of it is
// exercised here, so stub it and import the service dynamically — a static
// import would hoist above the stub.
mock.module('@veridex/sdk', () => ({ PasskeyManager: class {} }));

let IdentityService: any;

beforeAll(async () => {
  ({ IdentityService } = await import('./identity.service'));
});

type Row = Record<string, any>;

/**
 * Minimal in-memory Prisma stub covering the tables identity resolution reads.
 */
function createPrismaStub(seed: { users?: Row[]; socialNodes?: Row[] } = {}) {
  const users: Row[] = seed.users ?? [];
  const socialNodes: Row[] = seed.socialNodes ?? [];

  const findNode = (platform: string, platformUserId: string) =>
    socialNodes.find(
      (n) => n.platform === platform && n.platformUserId === platformUserId,
    ) ?? null;

  const hydrate = (user: Row | null) =>
    user
      ? { ...user, smartWallet: user.smartWallet ?? null, sessionKeys: user.sessionKeys ?? [] }
      : null;

  return {
    users,
    socialNodes,
    socialNode: {
      findUnique: async ({ where, include }: any) => {
        const { platform, platformUserId } = where.platform_platformUserId;
        const node = findNode(platform, platformUserId);
        if (!node) return null;
        if (include?.user) {
          const user = users.find((u) => u.id === node.userId) ?? null;
          return { ...node, user: hydrate(user) };
        }
        return node;
      },
      upsert: async ({ where, update, create }: any) => {
        const { platform, platformUserId } = where.platform_platformUserId;
        const existing = findNode(platform, platformUserId);
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const row = { id: `sn_${socialNodes.length}`, ...create };
        socialNodes.push(row);
        return row;
      },
      deleteMany: async ({ where }: any) => {
        const before = socialNodes.length;
        for (let i = socialNodes.length - 1; i >= 0; i--) {
          if (socialNodes[i].userId === where.userId && socialNodes[i].platform === where.platform) {
            socialNodes.splice(i, 1);
          }
        }
        return { count: before - socialNodes.length };
      },
    },
    user: {
      findUnique: async ({ where, include }: any) => {
        const user = users.find((u) => u.id === where.id) ?? null;
        if (!user) return null;
        if (include?.socialNodes) {
          return { ...user, socialNodes: socialNodes.filter((n) => n.userId === user.id) };
        }
        return include ? hydrate(user) : user;
      },
      findFirst: async ({ where }: any) => {
        const [column, value] = Object.entries(where)[0] as [string, unknown];
        return hydrate(users.find((u) => u[column] === value) ?? null);
      },
      update: async ({ where, data }: any) => {
        const user = users.find((u) => u.id === where.id);
        if (user) Object.assign(user, data);
        return user;
      },
    },
  };
}

function createService(prismaStub: any) {
  const service = new IdentityService(prismaStub as any, undefined, {
    record: async () => undefined,
  } as any);
  return service;
}

const WALLET = { address: '0xVAULT', isDeployed: true };

describe('IdentityService.resolveUser', () => {
  it('resolves via the SocialNode link table', async () => {
    const prisma = createPrismaStub({
      users: [{ id: 'u1', username: 'alice', smartWallet: WALLET }],
      socialNodes: [
        { id: 'sn1', userId: 'u1', platform: 'telegram', platformUserId: '111' },
      ],
    });
    const service = createService(prisma);

    const user = await service.resolveUser('telegram', '111');

    expect(user?.id).toBe('u1');
    expect(user?.smartWallet?.address).toBe('0xVAULT');
  });

  it('returns the same user regardless of which platform asks', async () => {
    const prisma = createPrismaStub({
      users: [{ id: 'u1', username: 'alice', smartWallet: WALLET }],
      socialNodes: [
        { id: 'sn1', userId: 'u1', platform: 'telegram', platformUserId: '111' },
        { id: 'sn2', userId: 'u1', platform: 'whatsapp', platformUserId: '+15551234' },
        { id: 'sn3', userId: 'u1', platform: 'discord', platformUserId: 'd-999' },
      ],
    });
    const service = createService(prisma);

    const viaTelegram = await service.resolveUser('telegram', '111');
    const viaWhatsapp = await service.resolveUser('whatsapp', '+15551234');
    const viaDiscord = await service.resolveUser('discord', 'd-999');

    // The whole point of unified identity: one wallet behind every platform.
    expect(viaTelegram.id).toBe('u1');
    expect(viaWhatsapp.id).toBe('u1');
    expect(viaDiscord.id).toBe('u1');
    expect(viaWhatsapp.smartWallet.address).toBe(viaDiscord.smartWallet.address);
  });

  /**
   * Regression: resolution used to match `{ username }` across every platform,
   * so a Discord user named "alice" resolved to Telegram's "alice" — and got
   * that account's wallet.
   */
  it('never resolves across platforms by username', async () => {
    const prisma = createPrismaStub({
      users: [{ id: 'telegram-alice', username: 'alice', telegramId: '111', smartWallet: WALLET }],
      socialNodes: [
        { id: 'sn1', userId: 'telegram-alice', platform: 'telegram', platformUserId: '111' },
      ],
    });
    const service = createService(prisma);

    // A different person, same display name, different platform.
    const impostor = await service.resolveUser('discord', 'alice');

    expect(impostor).toBeNull();
  });

  it('does not match a platform id against another platform column', async () => {
    const prisma = createPrismaStub({
      users: [{ id: 'u1', username: 'alice', telegramId: '111', smartWallet: WALLET }],
    });
    const service = createService(prisma);

    // '111' is a Telegram id; asking as Discord must not match it.
    expect(await service.resolveUser('discord', '111')).toBeNull();
    expect((await service.resolveUser('telegram', '111'))?.id).toBe('u1');
  });

  it('falls back to the legacy column and self-heals the SocialNode', async () => {
    const prisma = createPrismaStub({
      users: [{ id: 'u1', username: 'alice', telegramId: '111', smartWallet: WALLET }],
    });
    const service = createService(prisma);

    const user = await service.resolveUser('telegram', '111');
    expect(user?.id).toBe('u1');

    // The self-heal is fire-and-forget; let the microtask queue drain.
    await new Promise((r) => setTimeout(r, 0));
    expect(prisma.socialNodes).toHaveLength(1);
    expect(prisma.socialNodes[0]).toMatchObject({
      userId: 'u1',
      platform: 'telegram',
      platformUserId: '111',
    });
  });

  it('returns null for unknown identities and blank input', async () => {
    const service = createService(createPrismaStub({}));
    expect(await service.resolveUser('telegram', 'nobody')).toBeNull();
    expect(await service.resolveUser('telegram', '')).toBeNull();
    expect(await service.resolveUser('', '111')).toBeNull();
  });

  it('returns null for an unsupported platform', async () => {
    const prisma = createPrismaStub({
      users: [{ id: 'u1', username: 'alice', smartWallet: WALLET }],
    });
    const service = createService(prisma);
    expect(await service.resolveUser('myspace', 'alice')).toBeNull();
  });
});

describe('IdentityService.linkAccount', () => {
  let prisma: ReturnType<typeof createPrismaStub>;
  let service: any;

  beforeEach(() => {
    prisma = createPrismaStub({
      users: [
        { id: 'u1', username: 'alice', telegramId: '111', email: 'a@example.com' },
        { id: 'u2', username: 'bob', telegramId: '222', email: 'b@example.com' },
      ],
      socialNodes: [
        { id: 'sn1', userId: 'u1', platform: 'telegram', platformUserId: '111' },
      ],
    });
    service = createService(prisma);
  });

  it('links a second platform to an existing account', async () => {
    const result = await service.linkAccount('u1', 'whatsapp', '+15551234', 'alice');

    expect(result).toEqual({ linked: true, alreadyLinked: false });
    expect(prisma.socialNodes).toHaveLength(2);

    // The same wallet must now be reachable from WhatsApp.
    const viaWhatsapp = await service.resolveUser('whatsapp', '+15551234');
    expect(viaWhatsapp.id).toBe('u1');
  });

  it('lets Telegram resolve the existing web wallet immediately after linking', async () => {
    const webWallet = { address: '5u5xG3S68S9nDsWYaTQvtSuBsUnNAK11SR1jhgpsgBr9', isDeployed: false };
    prisma = createPrismaStub({
      users: [{ id: 'web-user', username: 'web_signup', telegramId: null, smartWallet: webWallet }],
    });
    service = createService(prisma);

    await service.linkAccount('web-user', 'telegram', '8817489572', 'lordzenith0');

    const resolvedByBot = await service.resolveUser('telegram', '8817489572', 'lordzenith0');
    expect(resolvedByBot?.id).toBe('web-user');
    expect(resolvedByBot?.smartWallet?.address).toBe(webWallet.address);
    expect(prisma.users[0].telegramId).toBe('8817489572');
  });

  it('is idempotent when the identity is already linked to the same user', async () => {
    const result = await service.linkAccount('u1', 'telegram', '111', 'alice');
    expect(result).toEqual({ linked: true, alreadyLinked: true });
    expect(prisma.socialNodes).toHaveLength(1);
  });

  /** Re-pointing an identity would silently transfer wallet access. */
  it('refuses to steal an identity linked to another account', async () => {
    await expect(service.linkAccount('u2', 'telegram', '111', 'bob')).rejects.toThrow(
      /already linked to a different/i,
    );
    expect(prisma.socialNodes[0].userId).toBe('u1');
  });

  it('rejects an unsupported platform', async () => {
    await expect(service.linkAccount('u1', 'myspace', 'x')).rejects.toThrow(/Unsupported platform/i);
  });

  it('rejects an unknown user', async () => {
    await expect(service.linkAccount('ghost', 'whatsapp', '+1555')).rejects.toThrow(/not found/i);
  });

  it('writes the denormalized column so legacy lookups stay correct', async () => {
    await service.linkAccount('u1', 'discord', 'd-42', 'alice');
    expect(prisma.users.find((u) => u.id === 'u1')?.discordId).toBe('d-42');
  });
});

describe('IdentityService.unlinkAccount', () => {
  it('clears both the SocialNode and the denormalized column', async () => {
    const prisma = createPrismaStub({
      users: [{ id: 'u1', username: 'alice', telegramId: '111', discordId: 'd-1', email: 'a@x.com' }],
      socialNodes: [
        { id: 'sn1', userId: 'u1', platform: 'telegram', platformUserId: '111' },
        { id: 'sn2', userId: 'u1', platform: 'discord', platformUserId: 'd-1' },
      ],
    });
    const service = createService(prisma);

    await service.unlinkAccount('u1', 'discord');

    expect(prisma.socialNodes).toHaveLength(1);
    // Leaving the column set would let the legacy fallback keep resolving them.
    expect(prisma.users[0].discordId).toBeNull();
    expect(await service.resolveUser('discord', 'd-1')).toBeNull();
  });

  it('refuses to remove the only remaining sign-in method', async () => {
    const prisma = createPrismaStub({
      users: [{ id: 'u1', username: 'alice', telegramId: '111', email: null }],
      socialNodes: [
        { id: 'sn1', userId: 'u1', platform: 'telegram', platformUserId: '111' },
      ],
    });
    const service = createService(prisma);

    await expect(service.unlinkAccount('u1', 'telegram')).rejects.toThrow(/only sign-in method/i);
    expect(prisma.socialNodes).toHaveLength(1);
  });

  it('allows unlinking the last platform when an email remains', async () => {
    const prisma = createPrismaStub({
      users: [{ id: 'u1', username: 'alice', telegramId: '111', email: 'a@x.com' }],
      socialNodes: [
        { id: 'sn1', userId: 'u1', platform: 'telegram', platformUserId: '111' },
      ],
    });
    const service = createService(prisma);

    await expect(service.unlinkAccount('u1', 'telegram')).resolves.toEqual({ unlinked: true });
  });
});
