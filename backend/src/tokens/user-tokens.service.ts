import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ethers } from 'ethers';
import { PrismaService } from '../prisma/prisma.service';
import { getSupportedTokens, TokenInfo, deriveTokenLimits } from '../config/tokens.config';

/**
 * Tokens a user has asked us to watch, added by contract address.
 *
 * The deposit listener already sees every token arriving at a user's vault — it
 * filters logs on the recipient, not the token — and discards the ones it
 * cannot identify, because it has no decimals for them and cannot vouch for the
 * contract. Adding a token supplies both.
 *
 * Metadata is read from the contract rather than accepted from the caller, so
 * it says what the contract says. That is not the same as being trustworthy:
 * any contract can claim any symbol, including one that belongs to a real
 * token. Two rules follow, and both are enforced here rather than left to
 * callers:
 *
 *   1. A built-in token always wins a symbol lookup. A user-added token can
 *      never shadow USDC.
 *   2. Resolution prefers the address. Symbols are a convenience for chat, and
 *      an ambiguous one is a question to ask, not a guess to make.
 */
import { createBotChainProvider } from '../common/rpc-provider.helper';

@Injectable()
export class UserTokensService {
  private readonly logger = new Logger(UserTokensService.name);
  private readonly provider = createBotChainProvider();

  /** Notified when a user's token list changes, so watchers can refresh. */
  private readonly listeners = new Set<() => void>();

  constructor(private readonly prisma: PrismaService) {}

  /** Register a callback fired whenever any user's token list changes. */
  onTokenListChanged(listener: () => void): void {
    this.listeners.add(listener);
  }

  private notifyChanged(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (err: any) {
        this.logger.warn(`Token-list listener failed: ${err.message}`);
      }
    }
  }

  async getChainId(): Promise<number> {
    const net = await this.provider.getNetwork();
    return Number(net.chainId);
  }

  /**
   * Reads `symbol`, `name`, and `decimals` from the contract.
   *
   * @dev Also serves as the validity check: an address that is not an ERC-20
   *      fails here rather than being stored and breaking a payment later.
   *      `decimals` is required — without it every amount is wrong by orders of
   *      magnitude — while `symbol` and `name` fall back, since some real
   *      tokens return bytes32 or omit them.
   */
  async readTokenMetadata(
    address: string,
  ): Promise<{ symbol: string; name: string; decimals: number }> {
    const erc20 = new ethers.Contract(
      address,
      [
        'function symbol() view returns (string)',
        'function name() view returns (string)',
        'function decimals() view returns (uint8)',
      ],
      this.provider,
    );

    let decimals: number;
    try {
      decimals = Number(await erc20.decimals());
    } catch {
      throw new BadRequestException(
        'That address does not look like a token contract — it has no decimals().',
      );
    }
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) {
      throw new BadRequestException('That token reports an unusable decimals value.');
    }

    const symbol = await erc20.symbol().catch(() => '');
    const name = await erc20.name().catch(() => '');

    return {
      symbol: this.sanitize(symbol) || 'UNKNOWN',
      name: this.sanitize(name) || 'Unknown Token',
      decimals,
    };
  }

  /**
   * Strips anything that could let a token's own metadata impersonate our copy.
   *
   * @dev A symbol is attacker-chosen text rendered into chat messages and
   *      buttons. Newlines and markdown would let it forge a second line of a
   *      bot message; the length cap stops it pushing real content off screen.
   */
  private sanitize(value: unknown): string {
    if (typeof value !== 'string') return '';
    return value
      .replace(/[\r\n\t]/g, ' ')
      .replace(/[*_`~[\]()<>|]/g, '')
      .trim()
      .slice(0, 32);
  }

  /** Adds a token to a user's watch list, reading its metadata on-chain. */
  async addToken(
    userId: string,
    rawAddress: string,
  ): Promise<TokenInfo & { alreadyKnown?: boolean; suggestedDailyLimitUnits?: number }> {
    if (!ethers.isAddress(rawAddress)) {
      throw new BadRequestException('That is not a valid contract address.');
    }

    const address = rawAddress.toLowerCase();
    const chainId = await this.getChainId();

    // A built-in already covers this contract; adding it again would create a
    // second, weaker record of the same token.
    const builtIn = Object.values(getSupportedTokens()).find(
      (t) => ethers.isAddress(t.address) && t.address.toLowerCase() === address,
    );
    if (builtIn) {
      return { ...builtIn, alreadyKnown: true };
    }

    const metadata = await this.readTokenMetadata(rawAddress);

    const row = await this.prisma.userToken.upsert({
      where: { userId_chainId_address: { userId, chainId, address } },
      // Re-adding a removed token restores it, and refreshes metadata in case
      // the contract was upgraded behind a proxy.
      update: { removedAt: null, ...metadata },
      create: { userId, chainId, address, ...metadata },
    });

    this.notifyChanged();
    this.logger.log(`User ${userId.slice(0, 8)}… added ${row.symbol} (${address})`);

    // A newly added token has no cap on the vault, which does not block it —
    // it still moves under session delegation via ACTION_TRANSFER — but leaves
    // it bounded only by a raw-amount global limit that means nothing at this
    // token's decimals. Hand the client the figure so it can offer the single
    // passkey prompt that writes a real one. Advisory only: the cap itself is
    // `onlyVault`, so nothing here can set it.
    return {
      ...this.toTokenInfo(row),
      suggestedDailyLimitUnits: deriveTokenLimits(row.decimals, row.symbol).dailyUnits,
    };
  }

  async removeToken(userId: string, rawAddress: string): Promise<void> {
    if (!ethers.isAddress(rawAddress)) {
      throw new BadRequestException('That is not a valid contract address.');
    }
    const address = rawAddress.toLowerCase();
    const chainId = await this.getChainId();

    const existing = await this.prisma.userToken.findUnique({
      where: { userId_chainId_address: { userId, chainId, address } },
    });
    if (!existing || existing.removedAt) {
      throw new NotFoundException('That token is not on your list.');
    }

    await this.prisma.userToken.update({
      where: { id: existing.id },
      data: { removedAt: new Date() },
    });
    this.notifyChanged();
  }

  /** A user's active custom tokens. */
  async listForUser(userId: string): Promise<TokenInfo[]> {
    const rows = await this.prisma.userToken.findMany({
      where: { userId, removedAt: null },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((row) => this.toTokenInfo(row));
  }

  /** Every active custom token across all users, for the deposit listener. */
  async listAllActive(): Promise<TokenInfo[]> {
    const rows = await this.prisma.userToken.findMany({ where: { removedAt: null } });

    // Deduplicated by address: the listener needs one entry per contract, and
    // several users may have added the same one.
    const byAddress = new Map<string, TokenInfo>();
    for (const row of rows) {
      if (!byAddress.has(row.address)) byAddress.set(row.address, this.toTokenInfo(row));
    }
    return [...byAddress.values()];
  }

  /**
   * Everything a user can transact in: built-ins first, then their own.
   *
   * @dev Order matters. Callers that pick the first match on symbol get the
   *      built-in, which is the behaviour {resolveForUser} depends on.
   */
  async allTokensForUser(userId: string): Promise<TokenInfo[]> {
    const builtIns = Object.values(getSupportedTokens());
    const custom = await this.listForUser(userId);
    const builtInAddresses = new Set(
      builtIns.filter((t) => ethers.isAddress(t.address)).map((t) => t.address.toLowerCase()),
    );
    return [...builtIns, ...custom.filter((t) => !builtInAddresses.has(t.address.toLowerCase()))];
  }

  /**
   * Resolves what a user meant by a token reference.
   *
   * @param reference A contract address or a symbol.
   * @returns `token` when unambiguous; `candidates` when a symbol matches more
   *          than one of the user's tokens, so the caller can ask rather than
   *          pick. Both empty means nothing matched.
   *
   * @dev An address always resolves to exactly one token, which is why the UI
   *      should prefer it. A symbol is ambiguous by construction: anyone can
   *      deploy a contract calling itself USDC. A built-in wins outright — a
   *      user-added token never shadows one — and beyond that a collision is
   *      returned for the caller to disambiguate, never guessed.
   */
  async resolveForUser(
    userId: string,
    reference?: string,
  ): Promise<{ token: TokenInfo | null; candidates: TokenInfo[] }> {
    const builtIns = getSupportedTokens();

    if (!reference) {
      return { token: builtIns.USDC ?? null, candidates: [] };
    }

    const trimmed: string = reference.trim();
    const isAddr = ethers.isAddress(trimmed);

    if (isAddr) {
      const address = trimmed.toLowerCase();
      const builtIn = Object.values(builtIns).find(
        (t) => ethers.isAddress(t.address) && t.address.toLowerCase() === address,
      );
      if (builtIn) return { token: builtIn, candidates: [] };

      const chainId = await this.getChainId();
      const row = await this.prisma.userToken.findUnique({
        where: { userId_chainId_address: { userId, chainId, address } },
      });
      if (row && !row.removedAt) return { token: this.toTokenInfo(row), candidates: [] };

      return { token: null, candidates: [] };
    }

    const upper = String(reference).trim().toUpperCase();

    // Built-ins win symbol lookups unconditionally.
    if (builtIns[upper]) return { token: builtIns[upper], candidates: [] };

    const custom = await this.listForUser(userId);
    const matches = custom.filter((t) => t.symbol.toUpperCase() === upper);

    if (matches.length === 1) return { token: matches[0], candidates: [] };
    if (matches.length > 1) return { token: null, candidates: matches };
    return { token: null, candidates: [] };
  }

  private toTokenInfo(row: {
    address: string;
    symbol: string;
    name: string;
    decimals: number;
  }): TokenInfo {
    return {
      symbol: row.symbol,
      name: row.name,
      address: ethers.getAddress(row.address),
      decimals: row.decimals,
      icon: '🪙',
    };
  }
}
