import { ethers } from 'ethers';

/**
 * Static network configuration for BOTChain (Chain ID 968).
 * Providing this static network tells ethers.js v6 NOT to call `detectNetwork()`
 * on startup, preventing the "JsonRpcProvider failed to detect network and cannot start up; retry in 1s"
 * background retry storm when an RPC node is starting up, rate-limited, or briefly unavailable.
 */
export function getBotChainNetwork(): ethers.Network {
  const chainId = Number(process.env.BOTCHAIN_CHAIN_ID || 968);
  return ethers.Network.from({
    chainId,
    name: 'botchain',
  });
}

/**
 * HTTP statuses that mean "this node is briefly unavailable", not "this request
 * is bad". The public testnet RPC sits behind nginx, which answers 503 for
 * stretches whenever no upstream node is healthy.
 */
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504, 522, 524]);

/** Socket-level failures worth another attempt. */
const RETRYABLE_ERROR_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EPIPE',
  'ERR_SOCKET_CONNECTION_TIMEOUT',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
  'UND_ERR_HEADERS_TIMEOUT',
]);

const MAX_ATTEMPTS = Number(process.env.BOTCHAIN_RPC_MAX_ATTEMPTS || 4);
const RETRY_BASE_MS = Number(process.env.BOTCHAIN_RPC_RETRY_BASE_MS || 250);
const RETRY_MAX_MS = Number(process.env.BOTCHAIN_RPC_RETRY_MAX_MS || 4000);
const REQUEST_TIMEOUT_MS = Number(process.env.BOTCHAIN_RPC_TIMEOUT_MS || 20000);

function isRetryableError(error: any): boolean {
  if (RETRYABLE_ERROR_CODES.has(String(error?.code || ''))) return true;
  if (RETRYABLE_ERROR_CODES.has(String(error?.cause?.code || ''))) return true;
  return /timeout|timed out|socket hang up|network|econn/i.test(String(error?.message || ''));
}

function backoffMs(attempt: number): number {
  const exponential = Math.min(RETRY_BASE_MS * 2 ** attempt, RETRY_MAX_MS);
  // Jitter keeps a fleet of workers from re-hitting a recovering node in lockstep.
  return exponential / 2 + Math.random() * (exponential / 2);
}

/**
 * Wraps ethers' own fetch with retries, so a short upstream blip stays invisible
 * to callers instead of failing the balance check or the transaction send.
 *
 * This sits below the provider rather than on `FetchRequest.retryFunc` because
 * ethers only consults `retryFunc` for 429s — a 503 is passed straight through.
 */
function createRetryingGetUrl(): ethers.FetchGetUrlFunc {
  const getUrl = ethers.FetchRequest.createGetUrlFunc();

  return async (req, signal) => {
    let lastResponse: Awaited<ReturnType<ethers.FetchGetUrlFunc>> | undefined;
    let lastError: any;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      if (attempt > 0) {
        if (signal?.cancelled) break;
        await new Promise((resolve) => setTimeout(resolve, backoffMs(attempt - 1)));
        if (signal?.cancelled) break;
      }

      try {
        const response = await getUrl(req, signal);
        if (!RETRYABLE_STATUS.has(response.statusCode)) return response;
        lastResponse = response;
      } catch (error: any) {
        if (!isRetryableError(error)) throw error;
        lastError = error;
      }
    }

    // Out of attempts: hand ethers back the real response (or error) so the
    // caller sees the upstream status rather than a synthetic one.
    if (lastResponse) return lastResponse;
    throw lastError;
  };
}

function createEndpointProvider(
  url: string,
  network: ethers.Network,
  overrides?: ethers.JsonRpcApiProviderOptions,
): ethers.JsonRpcProvider {
  const request = new ethers.FetchRequest(url);
  request.timeout = REQUEST_TIMEOUT_MS;
  request.getUrlFunc = createRetryingGetUrl();

  return new ethers.JsonRpcProvider(request, network, {
    staticNetwork: network,
    batchMaxCount: 1,
    ...overrides,
  });
}

/**
 * Configured endpoints, primary first. Both env vars accept a comma-separated
 * list so extra failovers need no code change.
 */
export function resolveRpcUrls(customRpcUrl?: string): string[] {
  const raw = customRpcUrl
    ? [customRpcUrl]
    : [process.env.BOTCHAIN_RPC_URL || 'https://rpc.bohr.life/', process.env.BOTCHAIN_RPC_URL_2 || ''];

  const urls = raw
    .flatMap((entry) => entry.split(','))
    .map((url) => url.trim())
    .filter(Boolean);

  return [...new Set(urls)];
}

// Every `new JsonRpcProvider` opens its own connection pool, so services share
// instances rather than each holding a private pool against the same node.
const providerCache = new Map<string, ethers.JsonRpcProvider | ethers.FallbackProvider>();

/**
 * Creates a robust ethers JsonRpcProvider or FallbackProvider for BOTChain.
 *
 * @param customRpcUrl Optional override URL
 * @param overrides Optional ethers provider options, e.g. `batchMaxCount` for
 *   callers that make many small calls per pass and want them coalesced.
 */
export function createBotChainProvider(
  customRpcUrl?: string,
  overrides?: ethers.JsonRpcApiProviderOptions,
): ethers.JsonRpcProvider | ethers.FallbackProvider {
  const urls = resolveRpcUrls(customRpcUrl);
  const cacheKey = JSON.stringify([urls, overrides ?? null]);

  const cached = providerCache.get(cacheKey);
  if (cached) return cached;

  const network = getBotChainNetwork();
  const provider =
    urls.length > 1
      ? new ethers.FallbackProvider(
          // Lower priority is dispatched first, so the primary URL leads and the
          // rest stand in only when it fails. quorum 1 means one healthy node is
          // enough — the default would demand agreement from a node that is down.
          urls.map((url, index) => ({
            provider: createEndpointProvider(url, network, overrides),
            priority: index + 1,
            stallTimeout: 3000,
            weight: 1,
          })),
          network,
          { quorum: 1 },
        )
      : createEndpointProvider(urls[0], network, overrides);

  providerCache.set(cacheKey, provider);
  return provider;
}
