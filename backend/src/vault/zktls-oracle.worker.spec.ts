import {
  beforeAll,
  beforeEach,
  afterEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
  setSystemTime,
} from 'bun:test';

/**
 * This suite was originally written for Jest, but the project has no Jest
 * runner configured — `bun test` is what actually runs. Bun does not implement
 * Jest's argument-less auto-mock (`jest.mock('axios')`), so axios is stubbed
 * with an explicit factory and the worker is imported dynamically, after the
 * stub is registered (a static import would hoist above it).
 */
const axiosGet = mock(async (..._args: any[]) => ({ data: {} }));

class MockAxiosError extends Error {}

const axiosStub: any = {
  get: axiosGet,
  isAxiosError: (e: any) => e instanceof MockAxiosError,
};

mock.module('axios', () => ({
  __esModule: true,
  default: axiosStub,
  ...axiosStub,
  AxiosError: MockAxiosError,
}));

let ZkTlsOracleWorker: any;

beforeAll(async () => {
  ({ ZkTlsOracleWorker } = await import('./zktls-oracle.worker'));
});

/** Fresh protocol state for the composite/health assertions. */
function protocolState(
  overrides: Record<string, Partial<Record<string, unknown>>> = {},
): Record<string, unknown> {
  const fresh = (apy: number) => ({
    apy,
    lastSuccessfulFetch: new Date(),
    consecutiveFailures: 0,
    circuitBreakerOpen: false,
  });
  return {
    ethena: { ...fresh(10.5), ...(overrides.ethena ?? {}) },
    aave: { ...fresh(6.2), ...(overrides.aave ?? {}) },
    sky: { ...fresh(8.0), ...(overrides.sky ?? {}) },
  };
}

/** A yields-API chart response carrying a single latest point. */
function chart(apy: number, tvlUsd = 1_000_000) {
  return { data: { data: [{ timestamp: new Date().toISOString(), apy, tvlUsd }] } };
}

describe('ZkTlsOracleWorker', () => {
  let worker: any;

  beforeEach(() => {
    axiosGet.mockReset();
    // The worker is a plain injectable with no constructor dependencies;
    // instantiating directly avoids booting the Nest DI container (and its
    // @Cron registrations) for a pure unit test.
    worker = new ZkTlsOracleWorker();

    // Collapse the exponential backoff. Each fetch otherwise sleeps 1s + 2s of
    // real time, so three sequential failures exceed the default test timeout
    // and the circuit never reaches its threshold. Retry *counts* are
    // unaffected — only the waiting is removed.
    worker['RETRY_DELAY_MS'] = 1;
  });

  afterEach(() => {
    setSystemTime(); // restore the real clock
  });

  describe('Circuit Breaker', () => {
    it('opens after 3 consecutive failures', async () => {
      axiosGet.mockRejectedValue(new Error('Connection refused'));

      await worker['fetchSourceApy'](worker['sources'][0]);
      await worker['fetchSourceApy'](worker['sources'][0]);
      await worker['fetchSourceApy'](worker['sources'][0]);

      const status = worker.getOracleStatus();
      expect(status.protocols.ethena.circuitBreakerOpen).toBe(true);
      expect(status.protocols.ethena.consecutiveFailures).toBeGreaterThanOrEqual(3);
    });

    it('serves the cached APY while the circuit is open', async () => {
      axiosGet.mockResolvedValueOnce(chart(12.5));
      expect(await worker['fetchSourceApy'](worker['sources'][0])).toBe(12.5);

      axiosGet.mockRejectedValue(new Error('Service unavailable'));
      await worker['fetchSourceApy'](worker['sources'][0]);
      await worker['fetchSourceApy'](worker['sources'][0]);
      await worker['fetchSourceApy'](worker['sources'][0]);

      // Circuit is open: the last good value is returned rather than re-calling.
      expect(await worker['fetchSourceApy'](worker['sources'][0])).toBe(12.5);
    });

    it('closes again after the cooldown elapses', async () => {
      axiosGet.mockRejectedValue(new Error('Timeout'));
      await worker['fetchSourceApy'](worker['sources'][0]);
      await worker['fetchSourceApy'](worker['sources'][0]);
      await worker['fetchSourceApy'](worker['sources'][0]);

      expect(worker.getOracleStatus().protocols.ethena.circuitBreakerOpen).toBe(true);

      // Jump past the 5-minute cooldown.
      setSystemTime(new Date(Date.now() + 6 * 60 * 1000));

      axiosGet.mockReset();
      axiosGet.mockResolvedValue(chart(11.0));

      expect(await worker['fetchSourceApy'](worker['sources'][0])).toBe(11.0);

      const status = worker.getOracleStatus();
      expect(status.protocols.ethena.circuitBreakerOpen).toBe(false);
      expect(status.protocols.ethena.consecutiveFailures).toBe(0);
    });
  });

  describe('Composite APY Calculation', () => {
    it('weights protocols 50/30/20', () => {
      worker['protocolStatus'] = protocolState({
        ethena: { apy: 10.0 },
        aave: { apy: 6.0 },
        sky: { apy: 8.0 },
      });

      // (10 * 0.5) + (8 * 0.3) + (6 * 0.2) = 8.6
      expect(worker['calculateCompositeApy']()).toBeCloseTo(8.6, 1);
    });

    it('still computes when one protocol has an open circuit', () => {
      worker['protocolStatus'] = protocolState({
        ethena: { apy: 10.5 },
        aave: {
          apy: 6.2,
          lastSuccessfulFetch: new Date(Date.now() - 60 * 60 * 1000),
          consecutiveFailures: 3,
          circuitBreakerOpen: true,
        },
        sky: { apy: 8.0 },
      });

      // The cached Aave reading is an hour old, so it still counts:
      // 5.25 + 2.4 + 1.24 = 8.89
      expect(worker['calculateCompositeApy']()).toBeCloseTo(8.89, 2);
    });

    it('renormalises the weights when a source has no usable reading', () => {
      worker['protocolStatus'] = protocolState({
        ethena: { apy: 10.0 },
        sky: { apy: 8.0 },
        aave: { apy: null, lastSuccessfulFetch: null },
      });

      // Aave drops out; the remaining 0.5/0.3 are rescaled to 0.625/0.375:
      // 10*0.625 + 8*0.375 = 9.25 — not dragged toward zero by the gap.
      expect(worker['calculateCompositeApy']()).toBeCloseTo(9.25, 2);
    });

    it('returns null when no source has a usable reading', () => {
      const none = { apy: null, lastSuccessfulFetch: null };
      worker['protocolStatus'] = protocolState({ ethena: none, aave: none, sky: none });

      expect(worker['calculateCompositeApy']()).toBeNull();
    });
  });

  describe('Retry Logic', () => {
    it('retries and succeeds on the third attempt', async () => {
      axiosGet
        .mockRejectedValueOnce(new Error('Timeout'))
        .mockRejectedValueOnce(new Error('Timeout'))
        .mockResolvedValueOnce(chart(10.5));

      expect(await worker['fetchSourceApy'](worker['sources'][0])).toBe(10.5);
      expect(axiosGet).toHaveBeenCalledTimes(3);
    });

    it('gives up after max retries and reports no reading', async () => {
      axiosGet.mockRejectedValue(new Error('Persistent failure'));

      // Null, never a default: this figure is attested on-chain, so a source
      // with no data must drop out rather than be represented by a constant.
      expect(await worker['fetchSourceApy'](worker['sources'][0])).toBeNull();
      expect(axiosGet).toHaveBeenCalledTimes(3); // initial + 2 retries
    });
  });

  describe('API Response Parsing', () => {
    it('parses the nested stakingYield shape', async () => {
      axiosGet.mockResolvedValueOnce(chart(12.3));
      expect(await worker['fetchSourceApy'](worker['sources'][0])).toBe(12.3);
    });

    it('parses the flat value shape', async () => {
      axiosGet.mockResolvedValueOnce(chart(11.7));
      expect(await worker['fetchSourceApy'](worker['sources'][0])).toBe(11.7);
    });

    it('reads the latest point of the chart series', async () => {
      axiosGet.mockResolvedValue({
        data: { data: [{ apy: 3.0 }, { apy: 4.0 }, { apy: 6.2, tvlUsd: 5 }] },
      });
      expect(await worker['fetchSourceApy'](worker['sources'][2])).toBeCloseTo(6.2, 1);
    });

    it('reports no reading when the response shape is unrecognized', async () => {
      axiosGet.mockResolvedValue({ data: { someOtherField: 'invalid' } });
      expect(await worker['fetchSourceApy'](worker['sources'][0])).toBeNull();
    });

    it('rejects an implausible APY rather than attesting it', async () => {
      axiosGet.mockResolvedValue(chart(100_000));
      expect(await worker['fetchSourceApy'](worker['sources'][0])).toBeNull();
    });

    it('rejects a negative APY', async () => {
      axiosGet.mockResolvedValue(chart(-5));
      expect(await worker['fetchSourceApy'](worker['sources'][0])).toBeNull();
    });
  });

  describe('Stale Data Handling', () => {
    it('drops a source whose last reading is older than the max cache age', async () => {
      worker['protocolStatus'].ethena.apy = 9.9;
      worker['protocolStatus'].ethena.lastSuccessfulFetch = new Date(0);
      axiosGet.mockRejectedValue(new Error('Down'));

      expect(await worker['fetchSourceApy'](worker['sources'][0])).toBeNull();
    });

    it('still serves a recent reading when the source is briefly down', async () => {
      worker['protocolStatus'].ethena.apy = 9.9;
      worker['protocolStatus'].ethena.lastSuccessfulFetch = new Date(Date.now() - 60_000);
      axiosGet.mockRejectedValue(new Error('Down'));

      expect(await worker['fetchSourceApy'](worker['sources'][0])).toBe(9.9);
    });
  });

  describe('Health Check', () => {
    it('is healthy when every protocol is fresh', () => {
      worker['protocolStatus'] = protocolState();

      const status = worker.getOracleStatus();
      expect(status.isHealthy).toBe(true);
      expect(status.compositeApy).toBeCloseTo(8.89, 2);
    });

    it('is unhealthy when every circuit is open', () => {
      const stale = {
        lastSuccessfulFetch: new Date(0) as Date | null,
        consecutiveFailures: 3,
        circuitBreakerOpen: true,
      };
      worker['protocolStatus'] = protocolState({ ethena: stale, aave: stale, sky: stale });

      expect(worker.getOracleStatus().isHealthy).toBe(false);
    });

    it('stays healthy while at least one protocol is working', () => {
      const stale = {
        lastSuccessfulFetch: new Date(0),
        consecutiveFailures: 3,
        circuitBreakerOpen: true,
      };
      worker['protocolStatus'] = protocolState({ aave: stale, sky: stale });

      expect(worker.getOracleStatus().isHealthy).toBe(true);
    });
  });

  describe('Concurrency & Mempool Error Handling', () => {
    it('recognises "already known" and nonce races as benign', () => {
      expect(
        worker['isAlreadyKnownError']({
          code: 'UNKNOWN_ERROR',
          message:
            'could not coalesce error (error={ "code": -32000, "message": "already known" })',
        }),
      ).toBe(true);

      expect(worker['isAlreadyKnownError'](new Error('nonce too low'))).toBe(true);
      expect(worker['isAlreadyKnownError'](new Error('connection timeout'))).toBe(false);
    });

    it('skips a cycle when an attestation is already running', async () => {
      const debugSpy = spyOn(worker['logger'], 'debug');
      worker['isAttesting'] = true;

      await worker['fetchAndAttestYields'](false);

      expect(debugSpy).toHaveBeenCalled();
      const messages = debugSpy.mock.calls.flat().join(' ');
      expect(messages).toContain('already in progress');
    });
  });
});
