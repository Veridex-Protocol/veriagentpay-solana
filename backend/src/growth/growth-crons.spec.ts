import { describe, expect, it } from 'bun:test';
import { DormantUserWinbackCron } from './dormant-user-winback.cron';
import { RedEnvelopeFridayCron } from './red-envelope-friday.cron';

describe('DormantUserWinbackCron', () => {
  it('contacts a 14-day inactive user once for the current inactivity spell', async () => {
    const sent: any[] = [];
    const logs: any[] = [];
    let queried = false;
    const prisma: any = {
      user: {
        findMany: async () => {
          if (queried) return [];
          queried = true;
          return [{ id: 'quiet-user', createdAt: new Date('2026-01-01') }];
        },
      },
      userActivityLog: { groupBy: async () => [{ userId: 'quiet-user', _max: { createdAt: new Date('2026-07-01') } }] },
      notificationLog: {
        groupBy: async () => [],
        create: async ({ data }: any) => logs.push(data),
      },
    };
    const cron = new DormantUserWinbackCron(prisma, { notifyUser: async (message: any) => sent.push(message) } as any);

    await cron.sendDormantUserWinbacks();

    expect(sent).toHaveLength(1);
    expect(sent[0].metadata).toEqual({ campaign: 'dormant_win_back', inactivityDays: 14 });
    expect(logs[0].notificationType).toBe('dormant_win_back');
  });

  it('does not contact a user already nudged since their last activity', async () => {
    let queried = false;
    const notifications: any[] = [];
    const activityAt = new Date('2026-07-01');
    const prisma: any = {
      user: { findMany: async () => (queried ? [] : ((queried = true), [{ id: 'returned-user', createdAt: new Date('2026-01-01') }])) },
      userActivityLog: { groupBy: async () => [{ userId: 'returned-user', _max: { createdAt: activityAt } }] },
      notificationLog: {
        groupBy: async () => [{ userId: 'returned-user', _max: { sentAt: new Date('2026-07-02') } }],
        create: async () => undefined,
      },
    };
    const cron = new DormantUserWinbackCron(prisma, { notifyUser: async (message: any) => notifications.push(message) } as any);

    await cron.sendDormantUserWinbacks();

    expect(notifications).toHaveLength(0);
  });
});

describe('RedEnvelopeFridayCron', () => {
  it('creates the weekly public envelope from the persisted campaign configuration', async () => {
    const creates: any[] = [];
    const cron = new RedEnvelopeFridayCron({
      globalConfig: {
        findUnique: async () => ({
          value: {
            enabled: true,
            creatorId: 'operations-wallet',
            totalAmount: 250,
            maxClaims: 125,
            token: 'usdc',
          },
        }),
      },
      publicEnvelope: { create: async ({ data }: any) => (creates.push(data), { id: 'friday-drop' }) },
    } as any);

    await cron.createFridayDrop();
    expect(creates).toHaveLength(1);
    expect(creates[0]).toMatchObject({
      creatorId: 'operations-wallet', token: 'USDC', totalAmount: 250, maxClaims: 125,
    });
    expect(creates[0].scheduleKey).toMatch(/^red-envelope-friday:\d{4}-\d{2}-\d{2}$/);
  });

  it('does not create a drop until an enabled valid campaign is stored', async () => {
    const creates: any[] = [];
    const cron = new RedEnvelopeFridayCron({
      globalConfig: { findUnique: async () => ({ value: { enabled: false } }) },
      publicEnvelope: { create: async ({ data }: any) => creates.push(data) },
    } as any);

    await cron.createFridayDrop();

    expect(creates).toHaveLength(0);
  });
});
