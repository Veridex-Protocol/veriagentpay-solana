/**
 * Supported settlement tokens.
 *
 * USDC supports bounded session transfers. Native SOL is passkey-only because
 * existing session limits are denominated in six-decimal USDC units.
 */

import { SOLANA_USDC_MINT } from '../chains/solana/solana-account';

/** Settlement token assumed when a command or record omits one. */
export const DEFAULT_TOKEN_SYMBOL = 'USDC';

/**
 * How the chain's native asset is addressed.
 *
 * @dev Not a contract. `PayVault` treats the zero address as "send value", and
 *      the spending module reports 18 decimals for it. Anything that resolves a
 *      token to an address must expect this and must not call ERC-20 methods
 *      on it.
 */
export const NATIVE_TOKEN_ADDRESS = '11111111111111111111111111111111';

export interface TokenInfo {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  icon: string;
}

/**
 * A token this deployment supports natively.
 *
 * Adding one is a single entry here plus its address in the environment. The
 * list is deliberately declarative rather than a chain of `if (process.env.X)`
 * blocks: every consumer — deposit listener, price pusher, command parser,
 * pools, splits — iterates `getSupportedTokens()`, so a new entry reaches all
 * of them without touching any of them.
 *
 * What this does NOT do is make the token spendable from an existing vault.
 * See `docs/adding-a-token.md`: per-vault caps live in `SpendingLimitModule`
 * and the defaults stamped into new vaults are fixed in the factory
 * constructor, so the on-chain half is a separate, deliberate step.
 */
interface TokenDefinition {
  symbol: string;
  name: string;
  /**
   * Environment variable holding the contract address on the active chain.
   * Omitted for the native asset, which has no contract to point at.
   */
  envKey?: string;
  /**
   * The chain's own gas token rather than an ERC-20.
   *
   * BOT is native to BOTChain: there is no token contract, so it is addressed
   * as {@link NATIVE_TOKEN_ADDRESS} throughout. `PayVault._executeTransfer`
   * already branches on that to send value instead of calling `transfer`, and
   * `SpendingLimitModule._tokenDecimals` reports 18 for it. A native asset is
   * always available — there is no address to configure and nothing to fail.
   */
  native?: boolean;
  decimals: number;
  icon: string;
  /**
   * Fixed USD price, for assets whose value is pegged by construction.
   *
   * The price pusher publishes these directly. A token without a peg is left
   * unpriced until a real quote source exists, which disables only its own USD
   * ceiling — the per-token daily caps still bind — so omitting it is safe.
   */
  usdPeg?: number;
  /**
   * Daily cap in whole token units, overriding {@link DEFAULT_DAILY_LIMIT_UNITS}.
   *
   * Set it where a token's unit value differs enough from a dollar that the
   * shared default would be absurd. Leave it off otherwise.
   */
  dailyLimitUnits?: number;
}

/**
 * Daily cap applied to a token with no explicit figure, in whole token units.
 *
 * Denominated in whole units rather than raw base units, so one figure carries
 * the same intent at any decimals. This mirrors what the module now does for
 * the flat ceilings it applies across all tokens, which normalize amounts to a
 * 6-decimal scale before comparing.
 *
 * This is a floor on safety, not a ceiling on utility: the owner raises it with
 * their passkey. It exists so the window between adding a token and configuring
 * it is not unbounded.
 */
export const DEFAULT_DAILY_LIMIT_UNITS = Number(process.env.TOKEN_DAILY_LIMIT_UNITS || 1000);

/**
 * Weekly and monthly caps as multiples of the daily figure.
 *
 * @dev Matches `PayVault._seedTokenLimits`, which seeds `daily * 5` and
 *      `daily * 20` at vault creation. Diverging here would mean a token added
 *      later carried different ratios from one seeded at creation, for no
 *      reason a user could see.
 */
const WEEKLY_MULTIPLE = 5;
const MONTHLY_MULTIPLE = 20;

const TOKEN_REGISTRY: readonly TokenDefinition[] = [
  { symbol: 'USDC', name: 'USD Coin', envKey: 'SOLANA_USDC_MINT', decimals: 6, icon: 'USDC', usdPeg: 1 },
  { symbol: 'SOL', name: 'Solana', native: true, decimals: 9, icon: 'SOL' },
];

export function getSupportedTokens(): Record<string, TokenInfo> {
  const tokens: Record<string, TokenInfo> = {};

  for (const definition of TOKEN_REGISTRY) {
    const address = definition.native
      ? NATIVE_TOKEN_ADDRESS
      : definition.symbol === 'USDC'
        ? SOLANA_USDC_MINT.toBase58()
        : definition.envKey && process.env[definition.envKey];
    if (!address) continue;
    tokens[definition.symbol] = {
      symbol: definition.symbol,
      name: definition.name,
      address,
      decimals: definition.decimals,
      icon: definition.icon,
    };
  }

  return tokens;
}

/**
 * Addresses of supported tokens with a fixed USD price, keyed by address.
 *
 * @dev Consolidated here so the price pusher does not carry its own hardcoded
 *      list of which symbols are stablecoins — that list silently rots when a
 *      token is added or, as with USDC, gated off.
 */
export function getPeggedTokenPrices(): Record<string, number> {
  const prices: Record<string, number> = {};

  for (const definition of TOKEN_REGISTRY) {
    const address = definition.native
      ? NATIVE_TOKEN_ADDRESS
      : definition.symbol === 'USDC'
        ? SOLANA_USDC_MINT.toBase58()
        : definition.envKey && process.env[definition.envKey];
    if (!address || definition.usdPeg === undefined) continue;
    prices[address] = definition.usdPeg;
  }

  return prices;
}

export const SUPPORTED_TOKENS = new Proxy({} as Record<string, TokenInfo>, {
  get(target, prop: string) {
    if (prop === Symbol.iterator as any) return undefined;
    if (typeof prop !== 'string') return undefined;
    return getSupportedTokens()[prop.toUpperCase()];
  },
  ownKeys() {
    return Object.keys(getSupportedTokens());
  },
  getOwnPropertyDescriptor(target, prop) {
    const tokens = getSupportedTokens();
    if (typeof prop === 'string' && prop in tokens) {
      return { configurable: true, enumerable: true, value: tokens[prop] };
    }
    return undefined;
  },
});

/**
 * Resolves token symbol (case-insensitive) to TokenInfo or returns null if unsupported
 */
export function resolveToken(symbol?: string): TokenInfo | null {
  const tokens = getSupportedTokens();
  if (!symbol) return tokens[DEFAULT_TOKEN_SYMBOL] || null;
  const upper = symbol.trim().toUpperCase();
  return tokens[upper] || null;
}

/**
 * The caps to write when a token is first authorized on a vault.
 *
 * Works for registry tokens and user-added watch tokens alike: the only input
 * is `decimals`, which the registry declares and {@link UserTokensService}
 * reads from the contract. Returned as raw base units, ready for
 * `SpendingLimitModule.setTokenLimit`.
 *
 * @param decimals The token's own decimals. Wrong values are wrong by orders of
 *                 magnitude, so callers must read this from chain rather than
 *                 assume 18.
 * @param symbol   Optional. When it names a registry token, that token's
 *                 `dailyLimitUnits` override applies.
 * @param overrideDailyUnits Optional caller-chosen daily figure, in whole token
 *                 units. Takes precedence over both the registry entry and the
 *                 default. Routed through here rather than recomputed by the
 *                 caller so the weekly and monthly ratios cannot drift.
 */
export function deriveTokenLimits(
  decimals: number,
  symbol?: string,
  overrideDailyUnits?: number,
): { dailyLimit: bigint; weeklyLimit: bigint; monthlyLimit: bigint; dailyUnits: number } {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) {
    throw new Error(`Refusing to derive limits for implausible decimals: ${decimals}`);
  }

  const registryOverride = symbol
    ? TOKEN_REGISTRY.find((t) => t.symbol === symbol.toUpperCase())?.dailyLimitUnits
    : undefined;
  const dailyUnits = overrideDailyUnits ?? registryOverride ?? DEFAULT_DAILY_LIMIT_UNITS;

  if (!Number.isFinite(dailyUnits) || dailyUnits <= 0) {
    throw new Error(`Daily limit units must be a positive number, got ${dailyUnits}`);
  }

  // Scale through a string to keep full precision: 10n ** 18n overflows a JS
  // number long before it overflows a bigint.
  const scale = 10n ** BigInt(decimals);
  const dailyLimit = BigInt(Math.round(dailyUnits)) * scale;

  return {
    dailyLimit,
    weeklyLimit: dailyLimit * BigInt(WEEKLY_MULTIPLE),
    monthlyLimit: dailyLimit * BigInt(MONTHLY_MULTIPLE),
    dailyUnits,
  };
}
