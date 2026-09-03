import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ethers } from 'ethers';
import axios, { AxiosError } from 'axios';
import { createRelayerSigner } from '../relayer/relayer-signer.factory';
import { createBotChainProvider } from '../common/rpc-provider.helper';

interface ProtocolApyData {
  /**
   * Last APY actually observed from the source, or null when we have never
   * seen one. Null is deliberately not coerced to a default: this value is
   * attested on-chain, and a constant dressed up as a measurement is worse
   * than an absent measurement.
   */
  apy: number | null;
  lastSuccessfulFetch: Date | null;
  consecutiveFailures: number;
  circuitBreakerOpen: boolean;
  circuitBreakerOpenedAt?: Date;
  lastError?: string;
  /** TVL reported alongside the APY, for sanity checks and diagnostics. */
  tvlUsd?: number;
}

/** A yield source, identified by its DefiLlama pool id. */
interface YieldSource {
  key: string;
  label: string;
  poolId: string;
  weight: number;
}

interface OracleStatus {
  protocols: Record<string, ProtocolApyData>;
  /** Null when no source has a usable reading. */
  compositeApy: number | null;
  lastAttestation: Date | null;
  isHealthy: boolean;
}

@Injectable()
export class ZkTlsOracleWorker implements OnModuleInit {
  private readonly logger = new Logger(ZkTlsOracleWorker.name);

  private readonly provider = createBotChainProvider();
  // Shares the relayer's key by design, so it signs through the same path.
  // Reading PROVER_PRIVATE_KEY here would keep raw material in the environment
  // and make the relayer's move to KMS cosmetic — an attacker reading this
  // variable could sign payments as the relayer.
  //
  // The previous `|| createRandom()` fallback meant a missing key silently
  // signed attestations with an unauthorised address instead of failing.
  private readonly proverSigner = createRelayerSigner(this.provider);

  private readonly veridexOracleAddress = process.env.VERIDEX_ORACLE_ADDRESS || '';
  private readonly agentVaultAddress = process.env.AGENT_VAULT_ADDRESS || '0x3333333333333333333333333333333333333333';

  private readonly lastReportedApyBps = new Map<string, number>();

  // Circuit breaker configuration
  private readonly CIRCUIT_BREAKER_THRESHOLD = 3; // Failures before opening circuit
  private readonly CIRCUIT_BREAKER_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
  private readonly MAX_CACHE_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
  private readonly REQUEST_TIMEOUT_MS = 8000; // 8 seconds
  private readonly MAX_RETRIES = 2;
  private readonly RETRY_DELAY_MS = 1000; // 1 second base delay

  /**
   * Yield sources, read from DefiLlama's public yields API.
   *
   * One provider covering every protocol beats three bespoke integrations that
   * rot independently: the previous Aave fetcher pointed at the retired
   * `aave-api-v2` host and had been silently serving a constant, and Sky was
   * never implemented at all. Pool ids are stable identifiers; each is
   * overridable by env so a pool can be repointed without a deploy.
   *
   * Defaults are the deepest USD-stable pool for each protocol as of
   * 2026-08-11 (Aave v3 USDC $201M TVL, Ethena sUSDe $1.5B, Sky sUSDS $4.7B).
   */
  private readonly sources: YieldSource[] = [
    {
      key: 'ethena',
      label: 'Ethena sUSDe',
      poolId: process.env.YIELD_POOL_ETHENA || '66985a81-9c51-46ca-9977-42b4fe7bc6df',
      weight: Number(process.env.YIELD_WEIGHT_ETHENA || 0.5),
    },
    {
      key: 'sky',
      label: 'Sky sUSDS',
      poolId: process.env.YIELD_POOL_SKY || 'd8c4eff5-c8a9-46fc-a888-057c4c668e72',
      weight: Number(process.env.YIELD_WEIGHT_SKY || 0.3),
    },
    {
      key: 'aave',
      label: 'Aave v3 USDC',
      poolId: process.env.YIELD_POOL_AAVE || 'aa70268e-4b52-42bf-a116-608b370f9501',
      weight: Number(process.env.YIELD_WEIGHT_AAVE || 0.2),
    },
  ];

  private readonly yieldsApiBase = process.env.YIELDS_API_BASE || 'https://yields.llama.fi';

  /** An APY outside this band means the feed is wrong, not that yields moved. */
  private readonly MAX_PLAUSIBLE_APY = Number(process.env.YIELD_MAX_PLAUSIBLE_APY || 100);

  // Protocol status tracking. Starts empty — nothing is known until fetched.
  private protocolStatus: Record<string, ProtocolApyData> = Object.fromEntries(
    ['ethena', 'sky', 'aave'].map((key) => [
      key,
      {
        apy: null,
        lastSuccessfulFetch: null,
        consecutiveFailures: 0,
        circuitBreakerOpen: false,
      } as ProtocolApyData,
    ]),
  );

  private lastAttestationTime: Date | null = null;
  private isAttesting = false;

  private get enabled(): boolean {
    return process.env.ZKTLS_ORACLE_ENABLED === 'true';
  }

  async onModuleInit() {
    if (!this.enabled) {
      this.logger.log('zkTLS EVM oracle worker disabled for this deployment.');
      return;
    }

    if (!this.veridexOracleAddress || !ethers.isAddress(this.veridexOracleAddress)) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error(
          `VERIDEX_ORACLE_ADDRESS is required and must be a valid Ethereum address. Got: "${this.veridexOracleAddress}"`,
        );
      } else {
        this.logger.warn(
          `VERIDEX_ORACLE_ADDRESS is not set to a valid address ("${this.veridexOracleAddress}"). Oracle attestations will fail.`,
        );
      }
    }

    // Asynchronous now: a KMS-backed signer derives its address from the
    // key's public half rather than holding it locally.
    this.logger.log(
      `Initializing zkTLS Oracle Worker using Prover Address: ${await this.proverSigner.getAddress()}`,
    );
    this.logger.log(`Oracle Contract: ${this.veridexOracleAddress}`);
    this.logger.log(`Circuit Breaker Config: Threshold=${this.CIRCUIT_BREAKER_THRESHOLD}, Cooldown=${this.CIRCUIT_BREAKER_COOLDOWN_MS}ms`);
    this.logger.log(
      `Yield sources: ${this.sources.map((s) => `${s.label}@${s.weight}`).join(', ')} via ${this.yieldsApiBase}`,
    );

    // Warm the cache without blocking startup. Protocols now begin with no
    // reading at all, so until this lands `/api/oracle/status` correctly
    // reports "degraded" — better to fill it in seconds than to wait out the
    // 10-minute cron.
    void Promise.all(this.sources.map((s) => this.fetchSourceApy(s)))
      .then(() => {
        const composite = this.calculateCompositeApy();
        this.logger.log(
          composite === null
            ? 'Initial yield fetch produced no usable readings.'
            : `Initial composite APY: ${composite.toFixed(2)}%`,
        );
      })
      .catch((err) => this.logger.warn(`Initial yield fetch failed: ${err.message}`));
  }

  // Execute a full attestation cycle every 12 hours
  @Cron(CronExpression.EVERY_12_HOURS)
  async scheduledAttestation() {
    if (!this.enabled) return;
    await this.fetchAndAttestYields(false);
  }

  // Execute a targeted check every 10 minutes to verify if APY fluctuates significantly
  @Cron('0 */10 * * * *')
  async fluctuationCheck() {
    if (!this.enabled) return;
    await this.fetchAndAttestYields(true);
  }

  /**
   * Get current oracle status for health check endpoint
   */
  getOracleStatus(): OracleStatus {
    const now = Date.now();
    const compositeApy = this.calculateCompositeApy();

    const isHealthy = Object.values(this.protocolStatus).some(
      (protocol) =>
        !protocol.circuitBreakerOpen &&
        protocol.lastSuccessfulFetch !== null &&
        now - protocol.lastSuccessfulFetch.getTime() < this.MAX_CACHE_AGE_MS,
    );

    return {
      protocols: this.protocolStatus,
      compositeApy,
      lastAttestation: this.lastAttestationTime,
      isHealthy,
    };
  }

  /**
   * Weighted composite of the sources that currently have a usable reading.
   *
   * Weights are renormalised over whatever is available, so losing one feed
   * shifts the blend rather than dragging the composite toward zero. Returns
   * null when nothing is usable — the caller must not attest in that case.
   */
  private calculateCompositeApy(): number | null {
    const live = this.sources
      .map((s) => ({ source: s, apy: this.usableCachedApy(s.key) }))
      .filter((entry): entry is { source: YieldSource; apy: number } => entry.apy !== null);

    if (live.length === 0) return null;

    const totalWeight = live.reduce((sum, e) => sum + e.source.weight, 0);
    if (totalWeight <= 0) return null;

    return live.reduce((sum, e) => sum + e.apy * (e.source.weight / totalWeight), 0);
  }

  /**
   * Check if circuit breaker should be closed (cooldown period expired)
   */
  private shouldCloseCircuitBreaker(protocol: ProtocolApyData): boolean {
    if (!protocol.circuitBreakerOpen || !protocol.circuitBreakerOpenedAt) {
      return false;
    }

    const cooldownExpired =
      Date.now() - protocol.circuitBreakerOpenedAt.getTime() > this.CIRCUIT_BREAKER_COOLDOWN_MS;

    return cooldownExpired;
  }

  /**
   * Exponential backoff retry wrapper for HTTP requests
   */
  private async retryWithBackoff<T>(
    fn: () => Promise<T>,
    retries: number = this.MAX_RETRIES
  ): Promise<T> {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        if (attempt === retries) {
          throw error;
        }

        const delay = this.RETRY_DELAY_MS * Math.pow(2, attempt);
        this.logger.debug(`Retry attempt ${attempt + 1}/${retries + 1} after ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    throw new Error('Retry logic failed unexpectedly');
  }

  /**
   * Fetches one source's current APY from the yields API.
   *
   * Failure never yields a number. The caller receives null and the source is
   * dropped from the composite rather than being represented by a guess — this
   * figure is attested on-chain and drives real allocations.
   */
  private async fetchSourceApy(source: YieldSource): Promise<number | null> {
    const protocol = this.protocolStatus[source.key];

    if (protocol.circuitBreakerOpen) {
      if (this.shouldCloseCircuitBreaker(protocol)) {
        this.logger.log(`🟢 Circuit breaker CLOSED for ${source.key}. Resuming fetches.`);
        protocol.circuitBreakerOpen = false;
        protocol.consecutiveFailures = 0;
      } else {
        return this.usableCachedApy(source.key);
      }
    }

    try {
      const apy = await this.retryWithBackoff(async () => {
        const url = `${this.yieldsApiBase}/chart/${source.poolId}`;
        const response = await axios.get(url, {
          timeout: this.REQUEST_TIMEOUT_MS,
          headers: { Accept: 'application/json' },
        });

        const series = response.data?.data;
        if (!Array.isArray(series) || series.length === 0) {
          throw new Error(`No data points returned for pool ${source.poolId}`);
        }

        const latest = series[series.length - 1];
        const value = Number(latest?.apy);
        if (!Number.isFinite(value)) {
          throw new Error(`Pool ${source.poolId} returned a non-numeric APY`);
        }
        // A negative or absurd rate means the feed is broken, not that the
        // market moved. Treat it as a failure so the source is excluded.
        if (value < 0 || value > this.MAX_PLAUSIBLE_APY) {
          throw new Error(`Pool ${source.poolId} returned an implausible APY: ${value}%`);
        }

        protocol.tvlUsd = Number(latest?.tvlUsd) || undefined;
        return value;
      });

      protocol.apy = apy;
      protocol.lastSuccessfulFetch = new Date();
      protocol.consecutiveFailures = 0;
      delete protocol.lastError;

      this.logger.log(`✅ ${source.label} APY: ${apy.toFixed(2)}%`);
      return apy;
    } catch (error: any) {
      protocol.consecutiveFailures++;

      let errorMessage = error.message;
      if (error.response) {
        const axiosError = error as AxiosError;
        errorMessage = `HTTP ${axiosError.response?.status} - ${axiosError.response?.statusText}`;
      }
      protocol.lastError = errorMessage;

      this.logger.warn(
        `${source.label} fetch failed (${protocol.consecutiveFailures}/${this.CIRCUIT_BREAKER_THRESHOLD}): ${errorMessage}`,
      );

      if (protocol.consecutiveFailures >= this.CIRCUIT_BREAKER_THRESHOLD && !protocol.circuitBreakerOpen) {
        protocol.circuitBreakerOpen = true;
        protocol.circuitBreakerOpenedAt = new Date();
        this.logger.error(
          `🔴 Circuit breaker OPENED for ${source.key} after ${protocol.consecutiveFailures} failures. ` +
          `Cooldown: ${this.CIRCUIT_BREAKER_COOLDOWN_MS}ms`,
        );
      }

      return this.usableCachedApy(source.key);
    }
  }

  /**
   * The last real reading for a source, if it is recent enough to still stand
   * in for a live one. Stale or absent readings return null so the source drops
   * out of the composite entirely.
   */
  private usableCachedApy(key: string): number | null {
    const protocol = this.protocolStatus[key];
    if (protocol.apy === null || !protocol.lastSuccessfulFetch) {
      this.logger.warn(`⚠️  ${key} has no observed APY yet — excluding it from the composite.`);
      return null;
    }

    const ageMs = Date.now() - protocol.lastSuccessfulFetch.getTime();
    if (ageMs > this.MAX_CACHE_AGE_MS) {
      this.logger.warn(
        `⚠️  ${key} last reading is ${Math.floor(ageMs / 3_600_000)}h old (max ` +
        `${Math.floor(this.MAX_CACHE_AGE_MS / 3_600_000)}h) — excluding it from the composite.`,
      );
      return null;
    }

    this.logger.debug(`Using cached ${key} APY ${protocol.apy}% (${Math.floor(ageMs / 60_000)}m old)`);
    return protocol.apy;
  }

  private async fetchAndAttestYields(onlyIfFluctuates: boolean) {
    if (this.isAttesting) {
      this.logger.debug(`Attestation cycle already in progress. Skipping concurrent run (fluctuation check: ${onlyIfFluctuates}).`);
      return;
    }

    this.isAttesting = true;

    try {
      this.logger.log(`Fetching yield metrics for attestation... (fluctuation check: ${onlyIfFluctuates})`);

      // Each source fails independently; one outage must not sink the cycle.
      const readings = await Promise.all(
        this.sources.map(async (source) => [source.key, await this.fetchSourceApy(source)] as const),
      );
      const observed = Object.fromEntries(readings) as Record<string, number | null>;

      const compositeApy = this.calculateCompositeApy();

      // Refuse to attest rather than publish a figure no source supports. The
      // oracle's value is that on-chain consumers can trust it was measured;
      // emitting a placeholder would quietly destroy that guarantee.
      if (compositeApy === null) {
        this.logger.error(
          'No yield source has a usable reading — skipping attestation. ' +
          `Sources: ${this.sources.map((s) => `${s.key}=${this.protocolStatus[s.key].lastError ?? 'no data'}`).join(', ')}`,
        );
        return;
      }

      const contributing = this.sources.filter((s) => observed[s.key] !== null).map((s) => s.key);
      if (contributing.length < this.sources.length) {
        this.logger.warn(
          `Composite built from ${contributing.length}/${this.sources.length} sources ` +
          `(${contributing.join(', ')}); weights renormalised.`,
        );
      }

      // Convert to Basis Points (8.50% -> 850)
      const compositeApyBps = Math.floor(compositeApy * 100);

      const vaults = [this.agentVaultAddress];
      const apys = [compositeApyBps];

      let needsUpdate = !onlyIfFluctuates;

      if (onlyIfFluctuates) {
        const lastApy = this.lastReportedApyBps.get(this.agentVaultAddress) || 0;
        const diff = Math.abs(lastApy - compositeApyBps);
        // Trigger out-of-band update if the APY shifted by more than 0.50% (50 basis points)
        if (diff >= 50) {
          this.logger.log(`APY fluctuation detected (${diff} bps). Triggering out-of-band update.`);
          needsUpdate = true;
        }
      }

      if (!needsUpdate) {
        this.logger.debug(`APY within stable range (${compositeApy.toFixed(2)}%). No out-of-band update needed.`);
        return;
      }

      // Generate Cryptographic Attestation Envelope.
      //
      // The envelope records which pools were read and which of them actually
      // contributed, so an auditor can reproduce the composite from the same
      // public data rather than taking the number on trust.
      const timestamp = Math.floor(Date.now() / 1000);
      const rawPayload = JSON.stringify({
        sources: observed,
        pools: Object.fromEntries(this.sources.map((s) => [s.key, s.poolId])),
        contributing,
        provider: this.yieldsApiBase,
        compositeApy,
        timestamp,
      });
      const attestationHash = ethers.keccak256(ethers.toUtf8Bytes(rawPayload));
      const hashes = [attestationHash];

      // Submit Verified Attestation On-Chain
      const oracleAbi = [
        'function batchProposeAPY(address[] calldata vaults, uint256[] calldata apys, bytes32[] calldata attestationHashes) external'
      ];
      const oracleContract = new ethers.Contract(this.veridexOracleAddress, oracleAbi, this.proverSigner);

      this.logger.log(`Submitting timelocked batchProposeAPY tx [APY: ${compositeApy.toFixed(2)}%, BPS: ${compositeApyBps}]...`);

      let tx: ethers.ContractTransactionResponse;
      try {
        tx = await oracleContract.batchProposeAPY(vaults, apys, hashes);
      } catch (err: any) {
        const { isKnown, isTimeout } = this.isTransientOrMempoolError(err);
        if (isKnown) {
          this.logger.warn(`Transaction already in mempool ("already known"). Skipping duplicate broadcast.`);
          return;
        }
        if (isTimeout) {
          this.logger.warn(`RPC request timed out while broadcasting batchProposeAPY transaction: ${err.message}. Will retry on next cycle.`);
          return;
        }
        throw err;
      }

      const receipt = await tx.wait();

      this.logger.log(`✅ Attestation successfully committed. Tx Hash: ${receipt?.hash || tx.hash}`);

      // Cache the successfully reported APY
      this.lastReportedApyBps.set(this.agentVaultAddress, compositeApyBps);
      this.lastAttestationTime = new Date();

    } catch (e: any) {
      const { isKnown, isTimeout } = this.isTransientOrMempoolError(e);
      if (isKnown) {
        this.logger.warn(`Attestation cycle skipped: transaction already known to network ("already known").`);
      } else if (isTimeout) {
        this.logger.warn(`Attestation cycle postponed due to RPC network timeout: ${e.message}`);
      } else {
        this.logger.error(`Failed to execute zkTLS attestation cycle: ${e.message}`);
        if (e.stack) {
          this.logger.debug(e.stack);
        }
      }
    } finally {
      this.isAttesting = false;
    }
  }

  /**
   * Helper to detect ethers / JSON-RPC "already known" or duplicate transaction errors and network timeouts
   */
  private isTransientOrMempoolError(err: any): { isKnown: boolean; isTimeout: boolean } {
    if (!err) return { isKnown: false, isTimeout: false };
    const errString = `${err.message || ''} ${JSON.stringify(err)} ${err.shortMessage || ''} ${err.code || ''} ${err.info?.error?.message || ''}`.toLowerCase();
    const isKnown = (
      errString.includes('already known') ||
      errString.includes('known transaction') ||
      errString.includes('already imported') ||
      errString.includes('nonce too low') ||
      errString.includes('replacement transaction underpriced')
    );
    const isTimeout = (
      err.code === 'TIMEOUT' ||
      errString.includes('request timeout') ||
      errString.includes('etimedout') ||
      errString.includes('econnreset')
    );
    return { isKnown, isTimeout };
  }

  private isAlreadyKnownError(err: any): boolean {
    return this.isTransientOrMempoolError(err).isKnown;
  }
}
