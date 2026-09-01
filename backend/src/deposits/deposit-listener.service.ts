import { Inject, Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Prisma, UserActivityAction, DepositStatus } from '@prisma/client';
import { ethers } from 'ethers';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityService } from '../activity/activity.service';
import { NOTIFICATION_SERVICE, type UserNotifier } from '../common/service-contracts';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { getSupportedTokens, TokenInfo } from '../config/tokens.config';
import { getAppBaseUrl } from '../config/app-url.config';
import { UserTokensService } from '../tokens/user-tokens.service';
import { createRelayerSigner } from '../relayer/relayer-signer.factory';
import { createBotChainProvider } from '../common/rpc-provider.helper';

/** keccak256("Transfer(address,address,uint256)") */
const TRANSFER_TOPIC = ethers.id('Transfer(address,address,uint256)');

/**
 * Scan position, per chain.
 *
 * Overridable so an integration test can own its own cursor. Sharing one with a
 * running dev server meant a test rewinding the cursor made the *app's*
 * listener rescan and credit the very deposits the test asserted were skipped —
 * a failure that appeared only when both ran at once.
 */
const CURSOR_NAME = process.env.DEPOSIT_CURSOR_NAME || 'erc20-deposits';

/**
 * Watches the chain for inbound ERC-20 transfers into VeriAgent smart accounts
 * and credits them as external deposits.
 *
 * ## Why polled logs rather than a WebSocket subscription
 * BOTChain exposes no `wss://` endpoint (probed; no upgrade), so
 * `provider.on(filter)` is unavailable. `eth_getLogs` is supported and, at ~1s
 * block times, polling gives effectively the same latency.
 *
 * ## Why one query covers every token
 * The filter constrains `topics[2]` (the indexed `to`) to a batch of our wallet
 * addresses and sets **no address filter**, so a single request returns
 * transfers of *any* ERC-20 into *any* of those wallets. Cost scales with the
 * number of wallet batches, not wallets × tokens.
 *
 * ## Why `finalized` instead of a confirmation count
 * BOTChain finalizes within 0–1 blocks (measured), so the chain's own
 * `finalized` tag is both a stronger guarantee than an arbitrary N-block depth
 * and roughly a second of latency. Scanning only up to `finalized` means a
 * credited deposit cannot be reorged away.
 */
@Injectable()
export class DepositListenerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DepositListenerService.name);

  private provider!: ethers.JsonRpcProvider | ethers.FallbackProvider;
  private chainId!: number;
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private stopped = false;

  /** Max blocks per scan, to bound RPC response size when catching up. */
  private readonly maxBlockSpan = Number(process.env.DEPOSIT_MAX_BLOCK_SPAN || 2000);
  /** Wallet addresses per log query; topic arrays degrade past a few hundred. */
  private readonly addressBatchSize = Number(process.env.DEPOSIT_ADDRESS_BATCH || 500);
  private readonly pollIntervalMs = Number(process.env.DEPOSIT_POLL_INTERVAL_MS || 4000);

  private tokenIndex = new Map<string, TokenInfo>();

  /**
   * Our own contracts, lowercased. A payout from one of these is an internal
   * settlement the originating service already logs — an escrow claim, a vault
   * withdrawal, a pool disbursement — not money arriving from outside. Without
   * this, a claim was credited a second time as an external deposit and the
   * recipient saw the same tokens twice in their feed.
   */
  private protocolAddresses = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly activityService: ActivityService,
    @Inject(NOTIFICATION_SERVICE)
    private readonly notifications: UserNotifier,
    private readonly userTokens: UserTokensService,
    private readonly gateway?: NotificationsGateway,
  ) {}

  /**
   * Rebuilds the token index from the built-ins plus every user-added token.
   *
   * @dev The scan filter constrains the recipient, not the token, so transfers
   *      of user-added tokens were already arriving here — they were dropped at
   *      {_recordDeposit} for want of decimals. This is what makes them
   *      recognisable. It re-runs whenever a user's list changes, because the
   *      index was previously built once at startup and a token added after
   *      boot would not have been credited until the next restart.
   */
  private async refreshTokenIndex(): Promise<void> {
    const next = new Map<string, TokenInfo>();

    for (const token of Object.values(getSupportedTokens())) {
      // Skip the native-token sentinel: it has no contract and emits no logs.
      if (!ethers.isAddress(token.address)) continue;
      next.set(token.address.toLowerCase(), token);
    }

    try {
      for (const token of await this.userTokens.listAllActive()) {
        const key = token.address.toLowerCase();
        // Built-ins win: a user-added row must never redefine USDC's decimals.
        if (!next.has(key)) next.set(key, token);
      }
    } catch (err: any) {
      // Keep the built-ins rather than dropping the index — a database blip
      // must not stop crediting ordinary deposits.
      this.logger.warn(`Could not load user tokens into the index: ${err.message}`);
    }

    this.tokenIndex = next;
  }

  async onModuleInit() {
    if (process.env.DEPOSIT_LISTENER_ENABLED === 'false') {
      this.logger.warn('Deposit listener disabled via DEPOSIT_LISTENER_ENABLED=false');
      return;
    }

    // No explicit URL: passing one pins the provider to that single endpoint,
    // which would cut this scanner out of the configured RPC failover.
    // Batching coalesces the per-scan calls into far fewer HTTP round-trips.
    // Multicall3 is not deployed on BOTChain, but the node accepts JSON-RPC
    // batch payloads, which gives us the same effect without a contract.
    this.provider = createBotChainProvider(undefined, { batchMaxCount: 50 }) as ethers.JsonRpcProvider;

    await this.refreshTokenIndex();
    // A token added mid-run has to start being credited immediately; waiting
    // for a restart is how "I added it and nothing happened" happens.
    this.userTokens.onTokenListChanged(() => {
      void this.refreshTokenIndex();
    });

    // Configured rather than probed: an RPC blip at boot used to leave the
    // listener permanently inactive until the next restart.
    this.chainId = Number(process.env.BOTCHAIN_CHAIN_ID || 968);

    for (const key of [
      'SOCIAL_PAYMENTS_ADDRESS',
      // Envelopes read this first and fall back to SOCIAL_PAYMENTS_ADDRESS, so
      // a deployment that sets it would otherwise leak escrow payouts through.
      'ENVELOPE_ESCROW_ADDRESS',
      'AGENT_VAULT_V2_ADDRESS',
      'AGENT_VAULT_ADDRESS',
      'GROUP_LENDING_POOL_ADDRESS',
      'POOL_CONTRACT_ADDRESS',
      'PAY_VAULT_FACTORY_ADDRESS',
      'FACTORY_CONTRACT_ADDRESS',
      'PROTOCOL_TREASURY_ADDRESS',
      'POOL_RESERVE_ADDRESS',
    ]) {
      const value = process.env[key];
      if (value && ethers.isAddress(value)) this.protocolAddresses.add(value.toLowerCase());
    }

    // The relayer is the protocol's own hot wallet. Loan disbursements and
    // escrow claims are sent *from* it, and each is already announced by the
    // service that performed it — so without this, claiming a red envelope
    // produced both "Red Envelope Claimed!" and a "Deposit received … from
    // 0x949a…EE2B (external wallet)" for the same tokens, and credited it as an
    // external deposit on top.
    //
    // Read from the signer rather than an env var so it stays correct with the
    // key in KMS, where no address is present in the environment.
    try {
      const relayerAddress = await createRelayerSigner().getAddress();
      this.protocolAddresses.add(relayerAddress.toLowerCase());
    } catch (err: any) {
      this.logger.warn(
        `Could not resolve the relayer address; its payouts will be miscounted as external deposits: ${err.message}`,
      );
    }

    const knownTokens = [...this.tokenIndex.values()].map((t) => t.symbol).join(', ') || 'none';
    this.logger.log(
      `Deposit listener started on chain ${this.chainId} (registry: ${knownTokens}, ` +
      `${this.protocolAddresses.size} protocol addresses ignored, poll ${this.pollIntervalMs}ms)`,
    );

    this.scheduleNext(0);
  }

  onModuleDestroy() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
  }

  private scheduleNext(delayMs: number) {
    if (this.stopped) return;
    this.timer = setTimeout(() => void this.tick(), delayMs);
  }

  /** One scan cycle. Never throws — a bad cycle must not kill the loop. */
  private async tick() {
    if (this.running) return this.scheduleNext(this.pollIntervalMs);
    this.running = true;
    try {
      await this.scanOnce();
    } catch (err: any) {
      this.logger.error(`Deposit scan failed: ${err.message}`);
    } finally {
      this.running = false;
      this.scheduleNext(this.pollIntervalMs);
    }
  }

  /**
   * Scans from the persisted cursor up to the finalized head.
   */
  async scanOnce(): Promise<{ scannedTo: number; credited: number }> {
    const finalizedHead = await this.getFinalizedBlockNumber();
    const cursor = await this.getCursor(finalizedHead);

    const fromBlock = cursor + 1;
    if (fromBlock > finalizedHead) return { scannedTo: cursor, credited: 0 };

    const toBlock = Math.min(finalizedHead, fromBlock + this.maxBlockSpan - 1);

    const wallets = await this.loadWalletIndex();
    if (wallets.size === 0) {
      await this.saveCursor(toBlock);
      return { scannedTo: toBlock, credited: 0 };
    }

    const logs = await this.fetchTransferLogs(fromBlock, toBlock, [...wallets.keys()]);

    let credited = 0;
    for (const log of logs) {
      try {
        if (await this.processTransferLog(log, wallets)) credited++;
      } catch (err: any) {
        // One bad log must not stall the cursor for everyone else.
        this.logger.error(`Failed to process ${log.transactionHash}#${log.index}: ${err.message}`);
      }
    }

    await this.saveCursor(toBlock);

    if (credited > 0 || logs.length > 0) {
      this.logger.log(
        `Scanned ${fromBlock}-${toBlock}: ${logs.length} inbound transfers, ${credited} credited`,
      );
    }
    return { scannedTo: toBlock, credited };
  }

  /**
   * The highest block safe to credit from.
   * Falls back to `latest` on nodes without finality tags.
   */
  private async getFinalizedBlockNumber(): Promise<number> {
    try {
      const finalized = await this.provider.getBlock('finalized');
      if (finalized?.number != null) return finalized.number;
    } catch {
      // Node does not implement the finalized tag.
    }
    const latest = await this.provider.getBlockNumber();
    const fallbackDepth = Number(process.env.DEPOSIT_CONFIRMATIONS || 6);
    this.logger.debug(`finalized tag unavailable; using latest-${fallbackDepth}`);
    return Math.max(0, latest - fallbackDepth);
  }

  private async getCursor(finalizedHead: number): Promise<number> {
    const existing = await this.prisma.indexerCursor.findUnique({
      where: { name_chainId: { name: CURSOR_NAME, chainId: this.chainId } },
    });
    if (existing) return Number(existing.lastBlock);

    // First run: start at the head rather than genesis. Backfilling historical
    // deposits is a separate, explicit operation.
    const start = Number(process.env.DEPOSIT_START_BLOCK || finalizedHead);
    await this.prisma.indexerCursor.create({
      data: { name: CURSOR_NAME, chainId: this.chainId, lastBlock: BigInt(start) },
    });
    this.logger.log(`Initialized deposit cursor at block ${start}`);
    return start;
  }

  private async saveCursor(block: number) {
    await this.prisma.indexerCursor.upsert({
      where: { name_chainId: { name: CURSOR_NAME, chainId: this.chainId } },
      update: { lastBlock: BigInt(block) },
      create: { name: CURSOR_NAME, chainId: this.chainId, lastBlock: BigInt(block) },
    });
  }

  /**
   * All smart-account addresses, lowercased → userId.
   * Doubles as the set used to recognise *internal* senders.
   */
  private async loadWalletIndex(): Promise<Map<string, string>> {
    const wallets = await this.prisma.smartWallet.findMany({
      select: { address: true, userId: true },
    });
    return new Map(wallets.map((w) => [w.address.toLowerCase(), w.userId]));
  }

  /**
   * One `eth_getLogs` per address batch. `topics[2]` is an OR-set of recipients
   * and no `address` filter is applied, so any ERC-20 is matched.
   */
  private async fetchTransferLogs(
    fromBlock: number,
    toBlock: number,
    addresses: string[],
  ): Promise<ethers.Log[]> {
    const out: ethers.Log[] = [];

    for (let i = 0; i < addresses.length; i += this.addressBatchSize) {
      const batch = addresses.slice(i, i + this.addressBatchSize);
      const paddedRecipients = batch.map((a) => ethers.zeroPadValue(ethers.getAddress(a), 32));

      const logs = await this.provider.getLogs({
        fromBlock,
        toBlock,
        topics: [TRANSFER_TOPIC, null, paddedRecipients],
      });
      out.push(...logs);
    }
    return out;
  }

  /**
   * Credits a single Transfer log. Returns true when a deposit was recorded.
   */
  private async processTransferLog(
    log: ethers.Log,
    wallets: Map<string, string>,
  ): Promise<boolean> {
    // A Transfer has exactly 3 topics; anything else (e.g. ERC-721's 4-topic
    // Transfer, whose third topic is a tokenId) is not a fungible transfer.
    if (log.topics.length !== 3) return false;

    const from = ethers.getAddress('0x' + log.topics[1].slice(-40));
    const to = ethers.getAddress('0x' + log.topics[2].slice(-40));

    const userId = wallets.get(to.toLowerCase());
    if (!userId) return false;

    // Internal VeriAgent-to-VeriAgent sends are already recorded as
    // TRANSFER_RECEIVED; crediting them here would double-count every payment.
    if (wallets.has(from.toLowerCase())) return false;

    // Likewise for payouts from our own contracts (escrow claims, vault
    // withdrawals, pool disbursements) — the originating service logs those.
    if (this.protocolAddresses.has(from.toLowerCase())) return false;

    const tokenAddress = ethers.getAddress(log.address);
    const token = this.tokenIndex.get(tokenAddress.toLowerCase());

    let amountRaw: bigint;
    try {
      amountRaw = BigInt(log.data);
    } catch {
      return false; // Malformed data field.
    }
    if (amountRaw === 0n) return false;

    const block = await this.provider.getBlock(log.blockNumber);
    const occurredAt = new Date((block?.timestamp ?? Math.floor(Date.now() / 1000)) * 1000);

    let deposit;
    try {
      deposit = await this.prisma.deposit.create({
        data: {
          userId,
          toAddress: to,
          fromAddress: from,
          tokenAddress,
          tokenSymbol: token?.symbol ?? null,
          amountRaw: amountRaw.toString(),
          amount: token ? new Prisma.Decimal(ethers.formatUnits(amountRaw, token.decimals)) : null,
          decimals: token?.decimals ?? null,
          txHash: log.transactionHash,
          logIndex: log.index,
          blockNumber: BigInt(log.blockNumber),
          blockHash: log.blockHash,
          occurredAt,
          status: DepositStatus.CONFIRMED,
          recognized: Boolean(token),
        },
      });
    } catch (err: any) {
      // The (txHash, logIndex) unique constraint absorbs re-scans.
      if (err?.code === 'P2002') return false;
      throw err;
    }

    if (!token) {
      // Recorded for visibility, but not surfaced as a balance change: we do
      // not know its decimals and cannot vouch for the contract.
      this.logger.warn(`Unrecognized token ${tokenAddress} deposited to ${to} (tx ${log.transactionHash})`);
      return true;
    }

    const human = ethers.formatUnits(amountRaw, token.decimals);
    await this.announceDeposit(userId, to, deposit.id, human, token, from, log.transactionHash);
    return true;
  }

  /**
   * Activity log, realtime push, and cross-platform notification.
   * Best-effort: a delivery failure must not roll back a recorded deposit.
   */
  private async announceDeposit(
    userId: string,
    walletAddress: string,
    depositId: string,
    amount: string,
    token: TokenInfo,
    from: string,
    txHash: string,
  ) {
    const shortFrom = `${from.slice(0, 6)}…${from.slice(-4)}`;

    await this.activityService
      ?.record({
        userIdentifier: userId,
        action: UserActivityAction.DEPOSIT_RECEIVED,
        amount: Number(amount),
        token: token.symbol,
        txHash,
        metadata: { from, depositId, external: true },
      })
      .catch((err) => this.logger.warn(`Deposit activity log failed: ${err.message}`));

    const wsPayload = { depositId, amount, token: token.symbol, from, txHash };
    try {
      // Emit to both the wallet-address room (frontend connects with address) and
      // the userId room (other services may subscribe by userId).
      this.gateway?.emitToUser(walletAddress, 'deposit:new', wsPayload);
      this.gateway?.emitToUser(userId, 'deposit:new', wsPayload);
    } catch (err: any) {
      this.logger.warn(`Deposit websocket push failed: ${err.message}`);
    }

    this.notifications
      .notifyUser({
        userId,
        type: 'money_received',
        title: '💰 Deposit received',
        body: `You received ${amount} ${token.symbol} from ${shortFrom} (external wallet).`,
        amount: Number(amount),
        token: token.symbol,
        from: shortFrom,
        link: `${getAppBaseUrl()}/activity`,
        metadata: { txHash, external: true },
      })
      .catch((err) => this.logger.warn(`Deposit notification failed: ${err.message}`));
  }
}
