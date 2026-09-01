import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ethers } from 'ethers';
import { createPriceSigner, createRelayerSigner } from '../relayer/relayer-signer.factory';
import { PRICE_ORACLE_ADDRESS } from '../config/secrets';

/**
 * Publishes signed USD prices to `SignedPriceOracle`.
 *
 * ## Two keys, on purpose
 *
 * The **signer** authorises a price; the **relayer** pays gas to publish it.
 * `SignedPriceOracle.updatePrice` is permissionless — authority comes from the
 * signature, not `msg.sender` — so the signer never needs gas and never needs
 * to hold a funded account. `Deploy.s.sol` hard-requires the two addresses to
 * differ, because a relayer compromise must not also lift every USD spending
 * ceiling.
 *
 * ## Why prices are signed rather than trusted
 *
 * BOTChain exposes no readable price feed, so prices are relayed from an
 * off-chain source. That makes the signer a trusted party, which is bounded two
 * ways: the per-token caps in `SpendingLimitModule` hold with no oracle at all
 * (ADR-008), and `maxDeviationBps` rate-limits how far one update can move a
 * price. The attack to design against is reporting prices *low* — the same
 * token quantity then reads as less value, admitting more spend under a USD
 * cap — and the deviation brake turns that from an instant drain into a slow,
 * publicly visible walk.
 *
 * ## Failure posture
 *
 * Every failure here is silent by design. A missing signer key, an unreachable
 * source, or a rejected update leaves the previous price in place; once it goes
 * stale the USD ceiling is *skipped*, not enforced, and the per-token caps
 * still bind. That is the correct direction: a quiet price feed must degrade
 * the policy, never halt payments.
 */
import { createBotChainProvider } from '../common/rpc-provider.helper';

@Injectable()
export class PricePusherService {
  private readonly logger = new Logger(PricePusherService.name);

  /** USD prices are scaled by 1e8, matching `SignedPriceOracle`. */
  private static readonly USD_DECIMALS = 8;

  private readonly provider = createBotChainProvider();

  /** Whether this deployment is configured to publish prices at all. */
  isConfigured(): boolean {
    return Boolean(createPriceSigner() && PRICE_ORACLE_ADDRESS);
  }

  /**
   * The digest `SignedPriceOracle` expects, rebuilt exactly.
   *
   * @dev Must match `priceDigest` byte for byte: `abi.encode` of the domain
   *      string, chain id, oracle address, token, price and timestamp — then
   *      the EIP-191 prefix, which `ethers.Wallet.signMessage` applies when
   *      given raw bytes. Any drift produces a signature that recovers to the
   *      wrong address and is rejected on-chain.
   */
  buildDigest(params: {
    chainId: bigint | number;
    oracle: string;
    token: string;
    usdPrice: bigint;
    updatedAt: number;
  }): string {
    return ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ['string', 'uint256', 'address', 'address', 'uint256', 'uint256'],
        [
          'VERIDEX_PRICE_V1',
          BigInt(params.chainId),
          params.oracle,
          params.token,
          params.usdPrice,
          BigInt(params.updatedAt),
        ],
      ),
    );
  }

  /** Signs one price. The signer key never leaves this method. */
  private async sign(digest: string): Promise<string> {
    const signer = createPriceSigner();
    if (!signer) throw new Error('No price signer configured.');
    // Same call either way: `KmsSigner.signMessage` applies the EIP-191 prefix
    // and normalises s exactly as `Wallet` does, so the digest the contract
    // recovers is identical whichever backs it.
    return signer.signMessage(ethers.getBytes(digest));
  }

  /** Converts a decimal USD quote to the contract's 1e8 fixed-point scale. */
  static toUsdFixedPoint(price: number): bigint {
    return ethers.parseUnits(price.toFixed(PricePusherService.USD_DECIMALS), PricePusherService.USD_DECIMALS);
  }

  /**
   * Signs and publishes prices for the given tokens.
   *
   * @param quotes Token address to USD price, as a decimal number.
   * @returns The transaction hash, or null when nothing was published.
   *
   * @dev Batched through `updatePrices`, which verifies each entry's signature
   *      individually — a batch is exactly as trustworthy as its weakest entry,
   *      with no aggregate signature that could smuggle an unsigned one in.
   */
  async publish(quotes: Record<string, number>): Promise<string | null> {
    if (!this.isConfigured()) {
      this.logger.warn('Price pusher not configured; skipping. USD ceilings stay inert.');
      return null;
    }

    const entries = Object.entries(quotes).filter(([, price]) => Number.isFinite(price) && price > 0);
    if (entries.length === 0) return null;

    const { chainId } = await this.provider.getNetwork();
    // The source feed's timestamp, not ours. The contract rejects anything
    // meaningfully ahead of block time, so a clock skewed fast fails closed.
    const updatedAt = Math.floor(Date.now() / 1000);

    const tokens: string[] = [];
    const prices: bigint[] = [];
    const timestamps: number[] = [];
    const signatures: string[] = [];

    for (const [token, price] of entries) {
      const usdPrice = PricePusherService.toUsdFixedPoint(price);
      const digest = this.buildDigest({
        chainId,
        oracle: PRICE_ORACLE_ADDRESS!,
        token,
        usdPrice,
        updatedAt,
      });

      tokens.push(token);
      prices.push(usdPrice);
      timestamps.push(updatedAt);
      signatures.push(await this.sign(digest));
    }

    // The relayer pays gas; the signature carries the authority. Anyone could
    // submit this, which is why a stalled relayer cannot stall the oracle.
    const oracle = new ethers.Contract(
      PRICE_ORACLE_ADDRESS!,
      [
        'function updatePrices(address[] tokens, uint256[] usdPrices, uint256[] updatedAts, bytes[] signatures) external',
      ],
      createRelayerSigner(this.provider),
    );

    const tx = await oracle.updatePrices(tokens, prices, timestamps, signatures);
    await tx.wait();

    this.logger.log(`Published ${tokens.length} price(s) to the oracle: ${tx.hash}`);
    return tx.hash;
  }

  /**
   * @dev Ten minutes matches the cadence the deviation bound was sized against:
   *      at 500 bps a compromised signer needs roughly 45 sequential, publicly
   *      visible updates to reach a tenth of the true price. Pushing faster
   *      shortens that window.
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async scheduledPush(): Promise<void> {
    if (!this.isConfigured()) return;

    try {
      const quotes = await this.fetchQuotes();
      await this.publish(quotes);
    } catch (err: any) {
      // Never rethrow: a failed push must leave the last good price standing
      // and let it age out, rather than taking the scheduler down.
      this.logger.warn(`Price push failed, leaving the previous price in place: ${err.message}`);
    }
  }

  /**
   * Fetches current USD quotes for the configured tokens.
   *
   * @dev Stablecoins are quoted at parity rather than fetched. A feed outage
   *      would otherwise leave USDC unpriced, and an unpriced token disables
   *      the USD ceiling for it entirely — a worse outcome than assuming the
   *      peg. A real depeg exceeds `maxDeviationBps` anyway, so the update is
   *      rejected and the price ages into staleness, which is the safe state.
   */
  private async fetchQuotes(): Promise<Record<string, number>> {
    const quotes: Record<string, number> = {};
    const { getPeggedTokenPrices } = await import('../config/tokens.config');

    // Pegs come from the token registry rather than a symbol list kept here.
    // The previous local list still named USDC, which no longer resolves, and
    // would have silently omitted any token added since it was written.
    for (const [address, price] of Object.entries(getPeggedTokenPrices())) {
      if (!ethers.isAddress(address)) continue;
      quotes[address] = price;
    }

    // BOT and other unpegged assets need a real quote source before they can be
    // published; omitting them leaves them unpriced, which disables only their
    // own USD ceiling rather than affecting the pegged tokens above.
    return quotes;
  }
}
