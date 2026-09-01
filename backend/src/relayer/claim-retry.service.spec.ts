import { describe, expect, it, beforeEach } from 'bun:test';
import { ClaimRetryService } from './claim-retry.service';

describe('ClaimRetryService (BE-M-06 Atomic State Transition)', () => {
  let service: ClaimRetryService;
  let mockPrisma: any;
  let mockRelayerMonitor: any;
  let pendingClaims: any[];
  let processedItems: any[];

  beforeEach(() => {
    pendingClaims = [
      {
        id: 'claim-1',
        userId: 'user-1',
        type: 'ENVELOPE_CLAIM',
        payload: { envelopeId: 'env-1', claimerAddress: '0x123' },
        status: 'PENDING',
        retries: 0,
      },
      {
        id: 'claim-2',
        userId: 'user-2',
        type: 'ENVELOPE_CLAIM',
        payload: { envelopeId: 'env-2', claimerAddress: '0x456' },
        status: 'PENDING',
        retries: 2,
      },
    ];

    processedItems = [];

    mockPrisma = {
      pendingClaim: {
        findMany: async (args: any) => {
          return pendingClaims.filter(c => c.status === args.where.status && c.retries < args.where.retries.lt);
        },
        updateMany: async (args: any) => {
          const item = pendingClaims.find(c => c.id === args.where.id && c.status === args.where.status);
          if (!item) return { count: 0 };
          item.status = args.data.status;
          return { count: 1 };
        },
        update: async (args: any) => {
          const item = pendingClaims.find(c => c.id === args.where.id);
          if (item) {
            Object.assign(item, args.data);
          }
          return item;
        },
      },
    };

    mockRelayerMonitor = {
      checkBalance: async () => ({ isLow: false, balanceFormatted: '100' }),
    };

    service = new ClaimRetryService(mockRelayerMonitor, undefined, mockPrisma);
  });

  it('atomically claims item with PROCESSING status before executing and marks COMPLETED on success', async () => {
    const mockEnvelopes = {
      claimEnvelope: async (id: string, addr: string) => {
        processedItems.push({ id, addr });
        return { success: true };
      },
    };

    service.registerExecutors({ envelopesService: mockEnvelopes });
    await service.processPendingClaims();

    expect(processedItems.length).toBe(2);
    expect(pendingClaims[0].status).toBe('COMPLETED');
    expect(pendingClaims[1].status).toBe('COMPLETED');
  });

  it('skips item if another concurrent worker has already atomically transitioned it to PROCESSING', async () => {
    // Simulate claim-1 already being picked up by another pod
    mockPrisma.pendingClaim.updateMany = async (args: any) => {
      if (args.where.id === 'claim-1') {
        return { count: 0 }; // already PROCESSING
      }
      const item = pendingClaims.find(c => c.id === args.where.id);
      if (item) item.status = args.data.status;
      return { count: 1 };
    };

    const mockEnvelopes = {
      claimEnvelope: async (id: string, addr: string) => {
        processedItems.push({ id, addr });
      },
    };

    service.registerExecutors({ envelopesService: mockEnvelopes });
    await service.processPendingClaims();

    // Only claim-2 should have been processed by this instance
    expect(processedItems.length).toBe(1);
    expect(processedItems[0].id).toBe('env-2');
  });

  it('resets status back to PENDING if retry fails under max attempts', async () => {
    const mockEnvelopes = {
      claimEnvelope: async (id: string) => {
        if (id === 'env-1') throw new Error('Temporary RPC error');
      },
    };

    service.registerExecutors({ envelopesService: mockEnvelopes });
    await service.processPendingClaims();

    // claim-1 had retries=0, so after 1 fail it becomes retries=1 and status goes back to PENDING
    expect(pendingClaims[0].status).toBe('PENDING');
    expect(pendingClaims[0].retries).toBe(1);
    expect(pendingClaims[0].errorMessage).toBe('Temporary RPC error');

    // claim-2 succeeded
    expect(pendingClaims[1].status).toBe('COMPLETED');
  });

  it('marks status as FAILED when reaching max retries (3/3)', async () => {
    const mockEnvelopes = {
      claimEnvelope: async (id: string) => {
        if (id === 'env-2') throw new Error('Contract reverted');
      },
    };

    service.registerExecutors({ envelopesService: mockEnvelopes });
    await service.processPendingClaims();

    // claim-1 succeeded
    expect(pendingClaims[0].status).toBe('COMPLETED');

    // claim-2 had retries=2, so 2+1=3 >= 3 -> FAILED
    expect(pendingClaims[1].status).toBe('FAILED');
    expect(pendingClaims[1].retries).toBe(3);
    expect(pendingClaims[1].errorMessage).toBe('Contract reverted');
  });
});
