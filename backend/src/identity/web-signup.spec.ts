import { beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test';

// Both services reach @veridex/sdk transitively, which require()s an ESM-only
// bundle and throws under the test runner. Stub it and import dynamically — a
// static import would hoist above the stub.
mock.module('@veridex/sdk', () => ({ PasskeyManager: class {} }));

let IdentityService: any;
let WebAuthnService: any;

beforeAll(async () => {
  process.env.RP_ID = 'localhost';
  // `??=`, not `=`. `config/secrets.ts` freezes DEEPLINK_SECRET at first import,
  // so a spec that overwrites it after that point desynchronises every other
  // spec which derived a signature from the original value — which made
  // payment-escalation.spec fail depending only on file order.
  process.env.DEEPLINK_SECRET ??= 'test-deeplink-secret-'.repeat(2);
  // config/secrets rejects anything shorter than 32 characters at import time.
  process.env.JWT_SECRET = 'test-jwt-secret-'.repeat(3);
  ({ IdentityService } = await import('./identity.service'));
  ({ WebAuthnService } = await import('./webauthn.service'));
});

type Row = Record<string, any>;

/**
 * Self-serve web signup: a visitor with no bot deep link, no claim code, and
 * therefore nothing for the server to verify. The identity is minted here
 * instead, which is what makes an unsigned registration safe.
 */
describe('WebAuthnService.registrationOptions — self-serve web signup', () => {
  function createService(challenges: Row[] = []) {
    const prisma = {
      webAuthnChallenge: {
        deleteMany: async () => ({ count: 0 }),
        create: async ({ data }: any) => {
          const row = { id: `ch_${challenges.length}`, ...data };
          challenges.push(row);
          return row;
        },
      },
    };
    // Only prisma is touched on this path; the rest of the graph stays unbuilt.
    return new WebAuthnService(prisma as any);
  }

  it('mints its own identity when the caller presents no authorization', async () => {
    const challenges: Row[] = [];
    const service = createService(challenges);

    const result = await service.registrationOptions({
      platform: 'web',
      platformId: '',
      username: '',
    });

    expect(result.challengeId).toBeTruthy();
    expect(challenges[0].context.platformId).toMatch(/^web:[0-9a-f-]{36}$/);
    expect(challenges[0].context.username).toMatch(/^web_[0-9a-f]{10}$/);
  });

  /**
   * The security property that lets this path skip the HMAC gate. If a caller
   * could name the identity, they could aim a fresh passkey at an account that
   * already exists (SEC-002) — so whatever they sent is discarded.
   */
  it('discards a caller-supplied platformId rather than trusting it', async () => {
    const challenges: Row[] = [];
    const service = createService(challenges);

    await service.registrationOptions({
      platform: 'web',
      // A real Telegram id belonging to someone else.
      platformId: '5551234567',
      username: 'victim',
    });

    expect(challenges[0].context.platformId).not.toBe('5551234567');
    expect(challenges[0].context.platformId.startsWith('web:')).toBe(true);
    expect(challenges[0].context.username).not.toBe('victim');
  });

  it('mints a distinct identity per signup', async () => {
    const challenges: Row[] = [];
    const service = createService(challenges);

    await service.registrationOptions({ platform: 'web', platformId: '', username: '' });
    await service.registrationOptions({ platform: 'web', platformId: '', username: '' });

    expect(challenges[0].context.platformId).not.toBe(challenges[1].context.platformId);
    expect(challenges[0].context.username).not.toBe(challenges[1].context.username);
  });

  it('still requires a signed link for a platform-bound registration', async () => {
    const service = createService();

    await expect(
      service.registrationOptions({
        platform: 'telegram',
        platformId: '5551234567',
        username: 'someone',
      }),
    ).rejects.toThrow(/Onboarding link/);
  });

  it('accepts a valid signed onboarding link with platformId', async () => {
    const crypto = await import('crypto');
    const secret = process.env.DEEPLINK_SECRET!;
    const expires = String(Math.floor(Date.now() / 1000) + 900);
    const params: Record<string, string> = {
      chatId: '8817489572',
      expires,
      platform: 'telegram',
      platformId: '8817489572',
      username: 'testuser',
    };
    const canonical = new URLSearchParams();
    Object.keys(params).sort().forEach((k) => canonical.append(k, params[k]));
    const sig = crypto.createHmac('sha256', secret).update(canonical.toString()).digest('hex');

    const challenges: Row[] = [];
    const service = createService(challenges);

    const result = await service.registrationOptions({
      platform: 'telegram',
      platformId: '8817489572',
      chatId: '8817489572',
      username: 'testuser',
      expires,
      sig,
    });

    expect(result.challengeId).toBeTruthy();
    expect(challenges[0].context.platformId).toBe('8817489572');
    expect(challenges[0].context.username).toBe('testuser');
  });

  it('accepts a legacy signed onboarding link signed with userId', async () => {
    const crypto = await import('crypto');
    const secret = process.env.DEEPLINK_SECRET!;
    const expires = String(Math.floor(Date.now() / 1000) + 900);
    const params: Record<string, string> = {
      chatId: '8817489572',
      expires,
      platform: 'telegram',
      userId: '8817489572',
      username: 'testuser',
    };
    const canonical = new URLSearchParams();
    Object.keys(params).sort().forEach((k) => canonical.append(k, params[k]));
    const sig = crypto.createHmac('sha256', secret).update(canonical.toString()).digest('hex');

    const challenges: Row[] = [];
    const service = createService(challenges);

    const result = await service.registrationOptions({
      platform: 'telegram',
      platformId: '8817489572',
      chatId: '8817489572',
      username: 'testuser',
      expires,
      sig,
    });

    expect(result.challengeId).toBeTruthy();
    expect(challenges[0].context.platformId).toBe('8817489572');
  });
});

/**
 * A web signup's handle is generated, so nobody can pay it by name. Linking a
 * social is the first moment a real handle exists.
 */
describe('IdentityService.linkAccount — handle promotion', () => {
  function createPrismaStub(users: Row[]) {
    const socialNodes: Row[] = [];
    return {
      users,
      socialNodes,
      socialNode: {
        findUnique: async ({ where }: any) => {
          const { platform, platformUserId } = where.platform_platformUserId;
          return (
            socialNodes.find(
              (n) => n.platform === platform && n.platformUserId === platformUserId,
            ) ?? null
          );
        },
        upsert: async ({ where, update, create }: any) => {
          const { platform, platformUserId } = where.platform_platformUserId;
          const existing = socialNodes.find(
            (n) => n.platform === platform && n.platformUserId === platformUserId,
          );
          if (existing) {
            Object.assign(existing, update);
            return existing;
          }
          const row = { id: `sn_${socialNodes.length}`, ...create };
          socialNodes.push(row);
          return row;
        },
      },
      user: {
        findUnique: async ({ where }: any) => users.find((u) => u.id === where.id) ?? null,
        update: async ({ where, data }: any) => {
          const user = users.find((u) => u.id === where.id);
          if (
            data.username &&
            users.some((other) => other.id !== where.id && other.username === data.username)
          ) {
            throw Object.assign(new Error('Unique constraint failed on the fields: (`username`)'), {
              code: 'P2002',
            });
          }
          if (user) Object.assign(user, data);
          return user;
        },
      },
    };
  }

  const createService = (prisma: any) =>
    new IdentityService(prisma as any, undefined, { record: async () => undefined } as any);

  it('adopts the real handle when a social is linked', async () => {
    const prisma = createPrismaStub([
      { id: 'u1', username: 'web_a1b2c3d4e5', smartWallet: { address: '0xWALLET' } },
    ]);
    const service = createService(prisma);

    await service.linkAccount('u1', 'telegram', '111', '@realhandle');

    expect(prisma.users[0].username).toBe('realhandle');
    expect(prisma.users[0].telegramId).toBe('111');
  });

  it('leaves a handle the user actually chose alone', async () => {
    const prisma = createPrismaStub([
      { id: 'u1', username: 'alice', smartWallet: { address: '0xWALLET' } },
    ]);
    const service = createService(prisma);

    await service.linkAccount('u1', 'telegram', '111', 'alice_on_telegram');

    expect(prisma.users[0].username).toBe('alice');
  });

  /**
   * A handle that merely looks placeholder-ish is not one. Only the exact
   * generated shape is eligible, so a chosen name is never overwritten.
   */
  it('does not treat a chosen web-prefixed name as a placeholder', async () => {
    const prisma = createPrismaStub([
      { id: 'u1', username: 'web_designer', smartWallet: { address: '0xWALLET' } },
    ]);
    const service = createService(prisma);

    await service.linkAccount('u1', 'telegram', '111', 'someoneelse');

    expect(prisma.users[0].username).toBe('web_designer');
  });

  it('keeps the placeholder, and the link, when the handle is already taken', async () => {
    const prisma = createPrismaStub([
      { id: 'u1', username: 'web_a1b2c3d4e5', smartWallet: { address: '0xWALLET' } },
      { id: 'u2', username: 'taken' },
    ]);
    const service = createService(prisma);

    const result = await service.linkAccount('u1', 'telegram', '111', 'taken');

    expect(result.linked).toBe(true);
    expect(prisma.users[0].username).toBe('web_a1b2c3d4e5');
    expect(prisma.users[0].telegramId).toBe('111');
  });
});
