import {
  Injectable,
  Logger,
  Inject,
  forwardRef,
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ethers } from 'ethers';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../core/redis.service';
import { RelayerService } from './relayer.service';
import { createRelayerSigner } from './relayer-signer.factory';
import { safeEqual } from '../common/crypto.util';
import { describeForLog, toUserMessage } from '../common/user-error.util';
import {
  parseAssertion,
  buildPasskeyChallenge,
  bufferToBase64Url,
} from './passkey-signature.util';
import { createBotChainProvider } from '../common/rpc-provider.helper';
import { deriveTokenLimits, getSupportedTokens } from '../config/tokens.config';

/** How long a prepared action may sit before the user must start over. */
const PREPARE_TTL_MS = 5 * 60 * 1000;

type ActionKind = 'transfer' | 'session_grant' | 'policy_update' | 'token_limit';

interface PreparedAction {
  userId: string;
  vaultAddress: string;
  actionPayload: string;
  nonce: string;
  challengeHex: string;
  challengeB64Url: string;
  kind: ActionKind;
  /**
   * Kind-specific completion data. Consulted only *after* the on-chain call
   * succeeds — never to decide whether it may proceed, which is entirely the
   * contract's business.
   */
  meta?: { sessionKeyId?: string; moduleAddress?: string };
  /** Human-readable, for the audit trail — never used for authorization. */
  summary: Record<string, unknown>;
}

/**
 * Executes vault actions authorized by an on-chain-verified passkey.
 *
 * The existing `/transfer/passkey` flow verifies a WebAuthn assertion in the
 * backend and then calls `PayVault.execute` — which is authorized by the
 * relayer, not the user. The contract sees the relayer's word that a passkey
 * checked out. This service instead submits the assertion itself, so the
 * *contract* verifies it: the relayer becomes a submitter that pays gas and
 * carries no authority of its own.
 *
 * Two steps, because the challenge has to commit to the action:
 *
 *   1. {prepare} builds the action payload, reads the vault's `passkeyNonce`,
 *      and derives the challenge from both. The payload is kept server-side.
 *   2. {execute} takes the assertion over that challenge and submits it.
 *
 * The payload is never accepted back from the client. If it were, a caller
 * could obtain an assertion for a $1 transfer and submit it alongside a
 * different payload — which is precisely the class of bug SEC-001 was.
 *
 * @see docs/audit/11th-august-2026-1.md — SEC-001, SEC-011
 */
@Injectable()
export class PasskeyExecutionService {
  private readonly logger = new Logger(PasskeyExecutionService.name);
  private readonly provider = createBotChainProvider();
  private readonly relayerSigner: ethers.Signer;

  private static readonly VAULT_ABI = [
    'function passkeyNonce() view returns (uint256)',
    'function localSessionRegistry() view returns (address)',
    'function executeWithPasskey(bytes actionPayload, bytes authenticatorData, bytes clientDataJSON, uint256 r, uint256 s, uint256 pubKeyX, uint256 pubKeyY, uint256 nonce)',
  ];

  private static readonly SESSION_REGISTRY_ABI = [
    'function registerSession(bytes32 sessionKeyHash, uint64 expiry, uint256 maxValue)',
  ];

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    @Inject(forwardRef(() => RelayerService))
    private readonly relayer: RelayerService,
  ) {
    this.relayerSigner = createRelayerSigner(this.provider);
  }

  /**
   * Stage a transfer and return the challenge the user must sign.
   *
   * @returns `challengeB64Url` for `navigator.credentials.get`, and a
   *          `prepareId` naming the server-held payload.
   */
  async prepareTransfer(params: {
    userId: string;
    recipientAddress: string;
    tokenAddress: string;
    tokenDecimals: number;
    tokenSymbol: string;
    amount: number;
    toLabel: string;
  }): Promise<{ prepareId: string; challengeB64Url: string; vaultAddress: string; expiresAt: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: params.userId },
      include: { smartWallet: true },
    });
    if (!user?.smartWallet?.address) {
      throw new NotFoundException('No smart wallet for this account.');
    }
    let vaultAddress = user.smartWallet.address;

    const actionPayload = ethers.hexlify(
      ethers.concat([
        Buffer.from([1]), // ACTION_TRANSFER
        ethers.zeroPadValue(params.tokenAddress, 32),
        ethers.zeroPadValue(params.recipientAddress, 32),
        ethers.zeroPadValue(
          ethers.toBeHex(ethers.parseUnits(params.amount.toString(), params.tokenDecimals)),
          32,
        ),
      ]),
    );

    return this.stage({
      userId: params.userId,
      vaultAddress,
      actionPayload,
      kind: 'transfer',
      summary: { to: params.toLabel, token: params.tokenSymbol, amount: params.amount },
    });
  }

  /**
   * Stage a session-key grant for passkey authorization.
   *
   * Session grants used to be registered by the relayer through
   * `ACTION_EXECUTE`. That path is now blocked on-chain — a delegated authority
   * must not be able to mint itself more delegated authority — so the grant has
   * to be authorized by the user, exactly like a payment.
   *
   * The private key is generated and stored here, encrypted, before the grant
   * exists on-chain. It stays unusable until {executeAction} records
   * `activatedAt`, so a key that was never granted cannot be handed out.
   */
  async prepareSessionGrant(params: {
    userId: string;
    durationHours?: number;
    durationDays?: number;
    perTxLimitUSD?: number;
    dailyLimitUSD?: number;
  }): Promise<{ prepareId: string; challengeB64Url: string; vaultAddress: string; expiresAt: string; sessionKeyId: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: params.userId },
      include: { smartWallet: true },
    });
    if (!user?.smartWallet?.address) {
      throw new NotFoundException('No smart wallet for this account.');
    }
    let vaultAddress = user.smartWallet.address;

    // Registration stores a counterfactual CREATE2 address. Deploy it before
    // reading vault state; calling a view function on an address with no code
    // returns `0x`, which ethers otherwise reports as a misleading BAD_DATA
    // decoding failure.
    vaultAddress = await this.relayer.ensureVaultDeployed(vaultAddress);

    const vault = new ethers.Contract(vaultAddress, PasskeyExecutionService.VAULT_ABI, this.provider);
    let registryAddress: string;
    try {
      registryAddress = await vault.localSessionRegistry();
    } catch {
      throw new BadRequestException(
        'This smart account was created by an incompatible vault deployment. Please contact support.',
      );
    }
    if (!registryAddress || registryAddress === ethers.ZeroAddress) {
      throw new BadRequestException(
        'This vault has no session registry, so session keys cannot be granted.',
      );
    }

    // `durationHours` is the canonical unit. Keep `durationDays` only for
    // existing clients that still send the legacy payload.
    const durationHours = params.durationHours ?? ((params.durationDays ?? 7) * 24);
    const perTxLimitUSD = params.perTxLimitUSD ?? 50;
    const dailyLimitUSD = params.dailyLimitUSD ?? 200;

    if (!Number.isFinite(durationHours) || durationHours <= 0 || durationHours > 24 * 30) {
      throw new BadRequestException('Session duration must be between 1 hour and 30 days.');
    }
    if (!Number.isFinite(perTxLimitUSD) || perTxLimitUSD <= 0 || !Number.isFinite(dailyLimitUSD) || dailyLimitUSD <= 0) {
      throw new BadRequestException('Session spending limits must be greater than zero.');
    }
    if (perTxLimitUSD > dailyLimitUSD) {
      throw new BadRequestException('Per-payment limit cannot exceed the daily limit.');
    }

    const durationSeconds = Math.round(durationHours * 3600);
    const expiryAt = new Date(Date.now() + durationSeconds * 1000);

    const provisioned = await this.relayer.provisionSessionKey(
      params.userId,
      vaultAddress,
      durationSeconds,
      // The registry's ceiling is per-transaction, in the 6-decimal scale the
      // vault normalizes to before comparing. A USD figure therefore maps
      // directly and bounds every token alike: `executeWithLocalSession`
      // restates the amount through `SpendingLimitModule.normalizeAmount`, so
      // this number means the same thing for an 18-decimal asset as for a
      // stablecoin.
      BigInt(Math.floor(perTxLimitUSD * 1e6)),
      perTxLimitUSD,
      dailyLimitUSD,
    );

    const registryInterface = new ethers.Interface(PasskeyExecutionService.SESSION_REGISTRY_ABI);
    const calldata = registryInterface.encodeFunctionData('registerSession', [
      provisioned.sessionKeyHash,
      Math.floor(expiryAt.getTime() / 1000),
      BigInt(Math.floor(perTxLimitUSD * 1e6)),
    ]);
    const calldataBytes = ethers.getBytes(calldata);
    const dataLen = Buffer.alloc(4);
    dataLen.writeUInt32BE(calldataBytes.length, 0);

    const actionPayload = ethers.hexlify(
      ethers.concat([
        Buffer.from([2]), // ACTION_EXECUTE
        ethers.zeroPadValue(registryAddress, 32),
        ethers.zeroPadValue(ethers.toBeHex(0n), 32),
        dataLen,
        calldataBytes,
      ]),
    );

    const staged = await this.stage({
      userId: params.userId,
      vaultAddress,
      actionPayload,
      kind: 'session_grant',
      meta: { sessionKeyId: provisioned.sessionKeyId },
      summary: { durationHours, perTxLimitUSD, dailyLimitUSD },
    });

    return { ...staged, sessionKeyId: provisioned.sessionKeyId };
  }

  /**
   * Stage a per-token spending cap for passkey authorization.
   *
   * ## Why this needs the user's passkey
   *
   * `SpendingLimitModule.setTokenLimit` is `onlyVault`, and every delegated
   * route into the module is closed: `PayVault.execute` rejects ACTION_EXECUTE
   * outright, and `_executeCall` refuses any non-passkey path whose target is
   * the module itself. So the owner's passkey is the only authority that can
   * write a cap — which is the property worth keeping. An admin able to set
   * caps silently could widen every vault on the platform with one write.
   *
   * ## Why a cap is worth setting at all
   *
   * A token with no cap is not blocked by the *per-token* rule — `checkTransfer`
   * applies that only `if (limit.isSet)`. Writing one buys two things: a
   * decimal-aware ceiling, and registration as a watched token, so the token's
   * outflow is measured around arbitrary calls as well as transfers.
   *
   * The flat ceilings it shares with every other token — the vault's
   * `dailyLimit`, the module's `globalDailyLimit`, and the session grant's
   * `maxValue` — are normalized to a 6-decimal scale, so they bound a token by
   * worth rather than by how many places its decimals happen to run to. This
   * cap is the token's own, in its own units, on top of those.
   */
  async prepareTokenLimit(params: {
    userId: string;
    tokenAddress: string;
    /** Overrides the derived figure. Whole token units, not base units. */
    dailyLimitUnits?: number;
  }): Promise<{
    prepareId: string;
    challengeB64Url: string;
    vaultAddress: string;
    expiresAt: string;
    token: { address: string; symbol: string; decimals: number };
    limits: { dailyUnits: number; dailyLimit: string };
  }> {
    if (!ethers.isAddress(params.tokenAddress)) {
      throw new BadRequestException('That is not a valid token address.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: params.userId },
      include: { smartWallet: true },
    });
    if (!user?.smartWallet?.address) {
      throw new NotFoundException('No smart wallet for this account.');
    }

    // The token must already be one this deployment supports, or one this user
    // added themselves. The caller names the token, so without this an attacker
    // holding a session could stage a prompt for a contract of their choosing —
    // and users approve prompts they are shown. Restricting it to tokens that
    // reached the account through a reviewed path keeps the prompt meaningful,
    // the same reasoning the call-policy endpoint applies to its targets.
    const address = params.tokenAddress.toLowerCase();
    const isRegistryToken = Object.values(getSupportedTokens()).some(
      (t) => ethers.isAddress(t.address) && t.address.toLowerCase() === address,
    );
    if (!isRegistryToken) {
      const watched = await this.prisma.userToken.findFirst({
        where: { userId: params.userId, address },
        select: { id: true },
      });
      if (!watched) {
        throw new BadRequestException(
          'That token is not supported and is not on your token list. Add it first, then set its limit.',
        );
      }
    }

    const vaultAddress = await this.relayer.ensureVaultDeployed(user.smartWallet.address);

    // Decimals decide the cap, so they are read from the token contract rather
    // than taken from the caller or assumed. A wrong value here is wrong by
    // orders of magnitude and would not fail loudly.
    const erc20 = new ethers.Contract(
      params.tokenAddress,
      ['function decimals() view returns (uint8)', 'function symbol() view returns (string)'],
      this.provider,
    );

    let decimals: number;
    let symbol: string;
    try {
      decimals = Number(await erc20.decimals());
      symbol = await erc20.symbol().catch(() => 'TOKEN');
    } catch {
      throw new BadRequestException(
        'That address does not answer ERC-20 calls, so a spending cap cannot be set for it.',
      );
    }

    if (
      params.dailyLimitUnits !== undefined &&
      (!Number.isFinite(params.dailyLimitUnits) || params.dailyLimitUnits <= 0)
    ) {
      throw new BadRequestException('Daily limit must be greater than zero.');
    }

    const limits = deriveTokenLimits(decimals, symbol, params.dailyLimitUnits);
    const dailyUnits = limits.dailyUnits;

    // Read the module off the vault, not from configuration: the vault is the
    // only authority on which module it is bound to, and a stale env var would
    // stage a call the vault cannot honour.
    const vault = new ethers.Contract(
      vaultAddress,
      ['function spendingLimitModule() view returns (address)'],
      this.provider,
    );
    const moduleAddress: string = await vault.spendingLimitModule();
    if (!moduleAddress || moduleAddress === ethers.ZeroAddress) {
      throw new BadRequestException('This vault has no spending module, so caps cannot be set.');
    }

    const moduleInterface = new ethers.Interface([
      'function setTokenLimit(address vault, address token, uint256 dailyLimit, uint256 weeklyLimit, uint256 monthlyLimit) external',
    ]);
    const calldata = moduleInterface.encodeFunctionData('setTokenLimit', [
      vaultAddress,
      params.tokenAddress,
      limits.dailyLimit,
      limits.weeklyLimit,
      limits.monthlyLimit,
    ]);

    const calldataBytes = ethers.getBytes(calldata);
    const dataLen = Buffer.alloc(4);
    dataLen.writeUInt32BE(calldataBytes.length, 0);

    const actionPayload = ethers.hexlify(
      ethers.concat([
        Buffer.from([2]), // ACTION_EXECUTE
        ethers.zeroPadValue(moduleAddress, 32),
        ethers.zeroPadValue(ethers.toBeHex(0n), 32),
        dataLen,
        calldataBytes,
      ]),
    );

    const staged = await this.stage({
      userId: params.userId,
      vaultAddress,
      actionPayload,
      kind: 'token_limit',
      meta: { moduleAddress },
      summary: { token: symbol, dailyUnits, decimals },
    });

    return {
      ...staged,
      token: { address: params.tokenAddress, symbol, decimals },
      limits: { dailyUnits, dailyLimit: limits.dailyLimit.toString() },
    };
  }

  /**
   * Stages a call-policy refresh for passkey authorization.
   *
   * A vault's arbitrary-call allowlist is stamped in at creation from the
   * factory's seed, and the factory has no setter — so a vault created before a
   * protocol contract moved, or before a new call was needed, refuses that call
   * forever on the session path with `PayVault__SessionTargetNotAllowed`. That
   * is what a redeployed `GroupLendingPool` produced: every existing vault kept
   * pointing at the old address.
   *
   * Redeploying the factory would fix new vaults and orphan every existing one,
   * because the factory address feeds the CREATE2 derivation — the same class
   * of address mismatch that already cost a day. This is the path the contract
   * intends instead: `setVaultCallPolicy` is `onlyVault`, and `PayVault` blocks
   * every non-passkey path from reaching the module at all
   * (`PayVault__SessionCannotReconfigurePolicy`). So the owner, and only the
   * owner, can widen their own policy — which is exactly the authority that
   * should be required to do it.
   *
   * @param entries Target/selector pairs to grant or revoke.
   */
  async preparePolicyUpdate(params: {
    userId: string;
    entries: Array<{ target: string; selector: string; allowed: boolean }>;
  }): Promise<{ prepareId: string; challengeB64Url: string; vaultAddress: string; expiresAt: string }> {
    if (!params.entries?.length) {
      throw new BadRequestException('No call-policy entries supplied.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: params.userId },
      include: { smartWallet: true },
    });
    if (!user?.smartWallet?.address) {
      throw new NotFoundException('No smart wallet for this account.');
    }

    const vaultAddress = await this.relayer.ensureVaultDeployed(user.smartWallet.address);

    // The module address is read from the vault, not from configuration: the
    // vault is the only authority on which module it is actually bound to, and
    // a stale env var here would stage a call the vault cannot honour.
    const vault = new ethers.Contract(
      vaultAddress,
      ['function spendingLimitModule() view returns (address)'],
      this.provider,
    );
    const moduleAddress: string = await vault.spendingLimitModule();
    if (!moduleAddress || moduleAddress === ethers.ZeroAddress) {
      throw new BadRequestException('This vault has no spending module, so it has no call policy.');
    }

    const moduleInterface = new ethers.Interface([
      'function setVaultCallPolicy(address vault, address[] targets, bytes4[] selectors, bool[] allowed) external',
    ]);
    const calldata = moduleInterface.encodeFunctionData('setVaultCallPolicy', [
      vaultAddress,
      params.entries.map((e) => e.target),
      params.entries.map((e) => e.selector),
      params.entries.map((e) => e.allowed),
    ]);

    const calldataBytes = ethers.getBytes(calldata);
    const dataLen = Buffer.alloc(4);
    dataLen.writeUInt32BE(calldataBytes.length, 0);

    const actionPayload = ethers.hexlify(
      ethers.concat([
        Buffer.from([2]), // ACTION_EXECUTE
        ethers.zeroPadValue(moduleAddress, 32),
        ethers.zeroPadValue(ethers.toBeHex(0n), 32),
        dataLen,
        calldataBytes,
      ]),
    );

    return this.stage({
      userId: params.userId,
      vaultAddress,
      actionPayload,
      kind: 'policy_update',
      meta: { moduleAddress },
      summary: { entries: params.entries.length, module: moduleAddress },
    });
  }

  /**
   * Reads the vault's live nonce, derives the challenge, and parks the payload.
   *
   * @dev The nonce is read live and baked into the challenge. Two concurrent
   *      prepares for the same vault therefore share a nonce, and only one of
   *      the resulting assertions can land — the contract consumes it. That is
   *      the intended behaviour: the second attempt fails loudly rather than
   *      executing an action the user thought they had superseded.
   */
  private async stage(params: {
    userId: string;
    vaultAddress: string;
    actionPayload: string;
    kind: ActionKind;
    meta?: { sessionKeyId?: string; moduleAddress?: string };
    summary: Record<string, unknown>;
  }): Promise<{ prepareId: string; challengeB64Url: string; vaultAddress: string; expiresAt: string }> {
    const vaultAddress = await this.relayer.ensureVaultDeployed(params.vaultAddress);

    const vault = new ethers.Contract(
      vaultAddress,
      PasskeyExecutionService.VAULT_ABI,
      this.provider,
    );
    const nonce: bigint = await vault.passkeyNonce();
    const { chainId } = await this.provider.getNetwork();

    const { challengeHex, challengeB64Url } = buildPasskeyChallenge(
      vaultAddress,
      chainId,
      params.actionPayload,
      nonce,
    );

    const prepareId = crypto.randomUUID();
    const prepared: PreparedAction = {
      userId: params.userId,
      vaultAddress,
      actionPayload: params.actionPayload,
      nonce: nonce.toString(),
      challengeHex,
      challengeB64Url,
      kind: params.kind,
      meta: params.meta,
      summary: params.summary,
    };

    await this.redis.setJson(`passkey:prepare:${prepareId}`, prepared, PREPARE_TTL_MS);

    this.logger.debug(
      `Prepared passkey ${params.kind} ${prepareId} for ${params.userId.slice(0, 8)}…`,
    );

    return {
      prepareId,
      challengeB64Url,
      vaultAddress,
      expiresAt: new Date(Date.now() + PREPARE_TTL_MS).toISOString(),
    };
  }

  /**
   * Submit a prepared action with the user's assertion.
   *
   * @dev The prepared record is consumed on read (`takeJson`), so a `prepareId`
   *      is single-use regardless of what happens on-chain. Two concurrent
   *      submissions of the same id cannot both reach the contract.
   */
  async executeAction(params: {
    userId: string;
    prepareId: string;
    assertion: { id: string; response: { authenticatorData: string; clientDataJSON: string; signature: string } };
  }): Promise<{ txHash: string; success: boolean; kind: ActionKind }> {
    const prepared = await this.redis.takeJson<PreparedAction>(
      `passkey:prepare:${params.prepareId}`,
    );
    if (!prepared) {
      throw new BadRequestException('Transfer request expired or already used. Please start again.');
    }

    // The token belongs to the caller who prepared it.
    if (prepared.userId !== params.userId) {
      this.logger.warn(
        `Prepare ${params.prepareId} belongs to another account; refusing to execute.`,
      );
      throw new UnauthorizedException('This transfer request belongs to another account.');
    }

    const parsed = parseAssertion(params.assertion);

    // Defence in depth. The contract performs this comparison itself and is the
    // authority; checking here turns a wasted on-chain revert into a clear
    // error, and catches a client that signed the wrong thing.
    if (!safeEqual(parsed.challengeB64Url, prepared.challengeB64Url)) {
      throw new UnauthorizedException('Signature does not authorize this transfer.');
    }

    const credential = await this.prisma.passkeyCredential.findUnique({
      where: { lookupHash: crypto.createHash('sha256').update(params.assertion.id).digest('hex') },
    });
    if (!credential || credential.revokedAt || !credential.publicKeyX || !credential.publicKeyY) {
      throw new UnauthorizedException('Passkey is not registered or has been revoked.');
    }
    if (credential.userId !== params.userId) {
      throw new UnauthorizedException('Passkey does not belong to this account.');
    }

    const vault = new ethers.Contract(
      prepared.vaultAddress,
      PasskeyExecutionService.VAULT_ABI,
      this.relayerSigner,
    );

    let receipt: ethers.TransactionReceipt;
    try {
      const tx = await vault.executeWithPasskey(
        prepared.actionPayload,
        parsed.authenticatorData,
        parsed.clientDataJSON,
        parsed.r,
        parsed.s,
        BigInt(credential.publicKeyX),
        BigInt(credential.publicKeyY),
        BigInt(prepared.nonce),
        { gasLimit: 900_000 },
      );

      receipt = await Promise.race([
        tx.wait(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Transaction confirmation timeout (60s)')), 60_000),
        ),
      ]);
    } catch (e: any) {
      // The chain's rejection is diagnostic for us and noise for the user, who
      // just held their finger on a sensor and needs to know whether to retry.
      this.logger.error(`Passkey ${prepared.kind} submission failed: ${describeForLog(e)}`, e.stack);
      throw new BadRequestException(
        toUserMessage(e, 'The approval could not be completed on-chain. No funds have left your wallet.'),
      );
    }

    if (receipt.status !== 1) {
      this.logger.error(
        `Passkey ${prepared.kind} reverted on-chain: ${receipt.hash} (vault ${prepared.vaultAddress})`,
      );
      throw new BadRequestException(
        'The approval was rejected on-chain. No funds have left your wallet.',
      );
    }

    await this.prisma.passkeyCredential.update({
      where: { id: credential.id },
      data: { lastUsedAt: new Date() },
    });

    // Completion runs only after the chain accepted the action. A session key
    // stays unusable until its grant exists, so a failed or reverted grant
    // leaves a provisioned-but-inert row rather than a key the backend would
    // hand out and the vault would reject.
    if (prepared.kind === 'session_grant' && prepared.meta?.sessionKeyId) {
      await this.prisma.sessionKey.update({
        where: { id: prepared.meta.sessionKeyId },
        data: { activatedAt: new Date() },
      });
      this.logger.log(`Session key ${prepared.meta.sessionKeyId} activated on-chain.`);
    }

    this.logger.log(
      `Passkey ${prepared.kind} executed on-chain: ${receipt.hash}`,
    );

    return { txHash: receipt.hash, success: true, kind: prepared.kind };
  }
}
