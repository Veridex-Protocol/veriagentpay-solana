import { Inject, Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LoanStatus, NotificationType, Prisma, UserActivityAction } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NOTIFICATIONS_STORE, type NotificationStore } from '../common/service-contracts';
import { NOTIFICATION_SERVICE, type UserNotifier } from '../common/service-contracts';
import { ActivityService } from '../activity/activity.service';
import { getAppBaseUrl } from '../config/app-url.config';
import { forwardRef } from '@nestjs/common';
import { BadgesService } from '../badges/badges.service';
import { RelayerService } from '../relayer/relayer.service';
import { createBotChainProvider } from '../common/rpc-provider.helper';
import { DEFAULT_TOKEN_SYMBOL } from '../config/tokens.config';
import { CreatePoolDto, RequestLoanDto } from './dto/pools.dto';
export { CreatePoolDto, RequestLoanDto };

@Injectable()
export class PoolsService {
  private readonly logger = new Logger(PoolsService.name);

  /** Days past the deadline before a loan is recorded as defaulted. */
  private static readonly DEFAULT_GRACE_DAYS = 7;

  /** Extensions a single loan may be granted before it must be repaid. */
  private static readonly MAX_EXTENSIONS_PER_LOAN = 2;

  /**
   * Smallest workable pool. Mirrors `GroupLendingPool`'s quorum rule, which
   * needs a majority excluding the borrower — impossible below three.
   */
  private static readonly MIN_POOL_MEMBERS = 3;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(NOTIFICATIONS_STORE)
    private readonly notificationsService: NotificationStore,
    @Inject(NOTIFICATION_SERVICE)
    private readonly unifiedNotificationService: UserNotifier,
    @Inject(forwardRef(() => ActivityService))
    private readonly activityService: ActivityService,
    @Inject(forwardRef(() => RelayerService))
    private readonly relayerService: RelayerService,
    @Inject(forwardRef(() => BadgesService))
    private readonly badgesService?: BadgesService,
  ) { }

  /**
   * Resolve a member identifier (username, @handle, wallet address, contact identifier) to a User UUID
   */
  private async resolveMemberToUserId(identifier: string): Promise<string | null> {
    try {
      // Remove @ prefix if present
      const cleanIdentifier = identifier.startsWith('@') ? identifier.slice(1) : identifier;

      // Try multiple resolution strategies
      const user = await this.prisma.user.findFirst({
        where: {
          OR: [
            { id: identifier }, // Direct UUID
            { username: cleanIdentifier }, // Username
            { telegramId: identifier }, // Telegram ID
            { telegramId: cleanIdentifier },
            { whatsappId: identifier }, // WhatsApp ID
            { whatsappId: cleanIdentifier },
            { discordId: identifier }, // Discord ID
            { discordId: cleanIdentifier },
            { slackId: identifier }, // Slack ID
            { slackId: cleanIdentifier },
            { smartWallet: { address: { equals: identifier, mode: 'insensitive' } } }, // Wallet address
          ],
        },
        select: { id: true },
      });

      return user?.id || null;
    } catch (e: any) {
      this.logger.warn(`Failed to resolve member identifier ${identifier}: ${e.message}`);
      return null;
    }
  }

  /**
   * Resolve a user UUID or identifier to a human-readable display name (e.g. "@alice", "0x1234...5678")
   */
  async resolveUserDisplayName(userIdOrIdentifier: string, poolId?: string): Promise<string> {
    if (!userIdOrIdentifier) return 'Anonymous';
    const trimmed = userIdOrIdentifier.trim();
    if (trimmed.startsWith('@')) return trimmed;

    try {
      // 1. If poolId provided, check if PoolMember has a userIdentifier
      if (poolId) {
        const poolMember = await this.prisma.poolMember.findFirst({
          where: {
            poolId,
            OR: [
              { userId: trimmed },
              { userIdentifier: trimmed },
              { userIdentifier: `@${trimmed.replace(/^@/, '')}` },
            ],
          },
          include: {
            user: {
              select: {
                username: true,
                email: true,
                smartWallet: { select: { address: true } },
              },
            },
          },
        });

        if (poolMember) {
          if (poolMember.user?.username) {
            return poolMember.user.username.startsWith('@') ? poolMember.user.username : `@${poolMember.user.username}`;
          }
          if (poolMember.userIdentifier && !poolMember.userIdentifier.includes('-')) {
            return poolMember.userIdentifier.startsWith('@') ? poolMember.userIdentifier : `@${poolMember.userIdentifier}`;
          }
          if (poolMember.user?.email) {
            return poolMember.user.email.split('@')[0];
          }
          if (poolMember.user?.smartWallet?.address) {
            const addr = poolMember.user.smartWallet.address;
            return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
          }
        }
      }

      // 2. Query User directly
      const cleanUsername = trimmed.replace(/^@/, '');
      const user = await this.prisma.user.findFirst({
        where: {
          OR: [
            { id: trimmed },
            { username: { equals: cleanUsername, mode: 'insensitive' } },
            { email: { equals: trimmed, mode: 'insensitive' } },
            { telegramId: trimmed },
            { telegramId: cleanUsername },
            { smartWallet: { address: { equals: trimmed, mode: 'insensitive' } } },
          ],
        },
        include: {
          smartWallet: { select: { address: true } },
          poolMemberships: {
            take: 1,
            select: { userIdentifier: true },
          },
          socialNodes: {
            take: 1,
            select: { username: true, platform: true },
          },
        },
      });

      if (user) {
        if (user.username) {
          return user.username.startsWith('@') ? user.username : `@${user.username}`;
        }
        if (user.socialNodes?.[0]?.username) {
          const sName = user.socialNodes[0].username;
          return sName.startsWith('@') ? sName : `@${sName}`;
        }
        if (user.poolMemberships?.[0]?.userIdentifier && !user.poolMemberships[0].userIdentifier.includes('-')) {
          const uId = user.poolMemberships[0].userIdentifier;
          return uId.startsWith('@') ? uId : `@${uId}`;
        }
        if (user.email) {
          return user.email.split('@')[0];
        }
        if (user.smartWallet?.address) {
          const addr = user.smartWallet.address;
          return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
        }
      }

      // 3. If it is an Ethereum address
      if (trimmed.startsWith('0x') && trimmed.length >= 10) {
        return `${trimmed.slice(0, 6)}...${trimmed.slice(-4)}`;
      }

      // 4. If any pool membership contains this userIdentifier
      const anyMember = await this.prisma.poolMember.findFirst({
        where: {
          OR: [
            { userId: trimmed },
            { userIdentifier: trimmed },
          ],
        },
        select: { userIdentifier: true },
      });
      if (anyMember?.userIdentifier && !anyMember.userIdentifier.includes('-')) {
        return anyMember.userIdentifier.startsWith('@') ? anyMember.userIdentifier : `@${anyMember.userIdentifier}`;
      }
    } catch (e: any) {
      this.logger.warn(`Failed to resolve user display name for ${trimmed}: ${e.message}`);
    }

    // Fallback: don't display raw 36-char uuid if we can avoid it
    if (trimmed.length === 36 && trimmed.includes('-')) {
      return `Member (${trimmed.slice(0, 6)})`;
    }

    return trimmed;
  }

  /**
   * Registers the pool in `GroupLendingPool` and returns its on-chain id.
   *
   * `msg.sender` becomes the pool's creator and first member, so the call is
   * made from the creator's *vault* — vault addresses are what hold funds and
   * what `onlyMember` checks on every later deposit, vote and withdrawal.
   * Members without a deployed vault are left out of the initial list; they
   * join on-chain when they first deposit.
   *
   * @throws when the creator has no usable session key or the call fails, so
   *         no pool row is written that funds could be sent to.
   */
  private async createPoolOnChain(
    creatorId: string,
    name: string,
    token: string,
    members: Array<{ userId?: string; userIdentifier: string }>,
  ): Promise<number> {
    const { ethers } = await import('ethers');
    const { resolveToken } = await import('../config/tokens.config');

    const poolContractAddress =
      process.env.POOL_CONTRACT_ADDRESS || process.env.GROUP_LENDING_POOL_ADDRESS;
    if (!poolContractAddress) throw new BadRequestException('Pool contract is not configured.');

    const tokenInfo = resolveToken(token);
    if (!tokenInfo) throw new BadRequestException(`Unsupported token: ${token}`);

    const creator = await this.prisma.user.findUnique({
      where: { id: creatorId },
      include: {
        smartWallet: true,
        sessionKeys: {
          where: { revokedAt: null, expiryAt: { gt: new Date() }, activatedAt: { not: null } },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!creator?.smartWallet) {
      throw new BadRequestException('Complete wallet setup before creating a pool.');
    }
    if (!creator.sessionKeys?.length) {
      const err = new BadRequestException(
        'No active session key. Authorize one with your passkey to create a pool.',
      );
      (err as any).code = 'SESSION_KEY_REQUIRED';
      (err as any).requirePasskey = true;
      throw err;
    }

    // Vault addresses for the members we can already identify.
    const memberUserIds = members.map((m) => m.userId).filter((v): v is string => Boolean(v));
    const memberWallets = await this.prisma.smartWallet.findMany({
      where: { userId: { in: memberUserIds } },
      select: { address: true },
    });
    const initialMembers = memberWallets
      .map((w) => w.address)
      .filter((a) => a.toLowerCase() !== creator.smartWallet!.address.toLowerCase());

    // At least three members to start with.
    //
    // `requestLoan` reverts with QuorumTooSmall below three: a two-person pool
    // has no majority that excludes the borrower, so it could never approve a
    // loan. `addMember` can top a pool up afterwards, but only until someone
    // deposits — after that the member set is frozen, because `memberCount`
    // sets the vote threshold and changing it under a funded pool would let
    // the creator out-vote the members who put the money in. Starting at three
    // means the pool is never dependent on that window.
    const totalMembers = initialMembers.length + 1; // + the creator
    if (totalMembers < PoolsService.MIN_POOL_MEMBERS) {
      throw new BadRequestException(
        `A lending pool needs at least ${PoolsService.MIN_POOL_MEMBERS} members with wallets — ` +
        `you have ${totalMembers}. Loans are approved by a majority of members other than the ` +
        `borrower, so a smaller pool could never approve one. More members can join until the ` +
        `first deposit, after which the member list is locked.`,
      );
    }

    const poolInterface = new ethers.Interface([
      'function createPool(string name, address token, address[] initialMembers) external returns (uint256)',
      'event PoolCreated(uint256 indexed poolId, string name, address indexed creator, address indexed token)',
    ]);
    const calldata = poolInterface.encodeFunctionData('createPool', [
      name,
      tokenInfo.address,
      initialMembers,
    ]);

    const receipt = await this.executeVaultCall(
      creatorId,
      creator.smartWallet.address,
      creator.sessionKeys[0],
      poolContractAddress,
      calldata,
    );

    // The id comes from the event rather than the return value: a call routed
    // through the vault returns the vault's data, not the contract's.
    for (const log of receipt.logs ?? []) {
      try {
        const parsed = poolInterface.parseLog({ topics: [...log.topics], data: log.data });
        if (parsed?.name === 'PoolCreated') return Number(parsed.args.poolId);
      } catch {
        // Not our event.
      }
    }

    throw new BadRequestException(
      'Pool creation did not emit PoolCreated on-chain; refusing to create a pool that cannot hold funds.',
    );
  }

  /**
   * Runs an arbitrary contract call from a member's vault via their session key.
   *
   * @dev ACTION_EXECUTE (type 2), laid out as the vault expects: type byte,
   *      32-byte target, 32-byte value, 4-byte big-endian calldata length, then
   *      the calldata.
   */
  private async executeVaultCall(
    userId: string,
    vaultAddress: string,
    sessionKey: any,
    target: string,
    calldata: string,
    valueUSD = 0,
  ): Promise<any> {
    const { ethers } = await import('ethers');

    const decryptedKey = await this.relayerService.decryptSessionKey(sessionKey);
    const sessionWallet = new ethers.Wallet(decryptedKey);
    const sessionKeyHash = ethers.keccak256(
      ethers.solidityPacked(['address'], [sessionWallet.address]),
    );

    const provider = createBotChainProvider();
    let nonce = 0;
    try {
      const vault = new ethers.Contract(
        vaultAddress,
        ['function localSessionNonces(bytes32 sessionKeyHash) view returns (uint256)'],
        provider,
      );
      nonce = Number(await vault.localSessionNonces(sessionKeyHash));
    } catch {
      nonce = 0;
    }

    const raw = ethers.getBytes(calldata);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(raw.length, 0);

    const actionPayload = ethers.hexlify(
      ethers.concat([
        Buffer.from([2]),
        ethers.zeroPadValue(target, 32),
        ethers.ZeroHash,
        length,
        raw,
      ]),
    );

    const result = await this.relayerService.executeLocalSessionAction(
      userId,
      vaultAddress,
      decryptedKey,
      actionPayload,
      valueUSD,
      nonce,
    );
    if (!result?.success || !result.txHash) {
      throw new BadRequestException(
        (result as any)?.message || 'Vault call failed on-chain.',
      );
    }

    // The relayer returns only a hash, so the receipt is fetched here — the
    // caller needs the logs to read ids the contract assigns.
    const receipt = await provider.getTransactionReceipt(result.txHash);
    if (!receipt || receipt.status !== 1) {
      throw new BadRequestException('Vault call reverted on-chain.');
    }
    return receipt;
  }

  /**
   * Opens the loan request in `GroupLendingPool` and returns its request id.
   *
   * @dev `onlyMember` is checked against the borrower's *vault*, which is what
   *      `createPool` registered, so the call is made from there. The contract
   *      also enforces rules the database cannot: at least three members
   *      (a two-person pool has no majority that excludes the borrower) and an
   *      amount within the pool's real balance. Both are surfaced as they are,
   *      because a request the contract would reject must not exist here.
   */
  private async requestLoanOnChain(
    poolDbId: string,
    borrowerId: string,
    pool: any,
    dto: RequestLoanDto,
  ): Promise<number> {
    const { ethers } = await import('ethers');
    const { resolveToken } = await import('../config/tokens.config');

    if (pool.onChainPoolId === null || pool.onChainPoolId === undefined) {
      throw new BadRequestException(
        'This pool predates on-chain custody and cannot issue loans. Create a new pool.',
      );
    }

    const poolContractAddress =
      process.env.POOL_CONTRACT_ADDRESS || process.env.GROUP_LENDING_POOL_ADDRESS;
    if (!poolContractAddress) throw new BadRequestException('Pool contract is not configured.');

    const tokenInfo = resolveToken(pool.token);
    if (!tokenInfo) throw new BadRequestException(`Unsupported token: ${pool.token}`);

    const borrower = await this.prisma.user.findUnique({
      where: { id: borrowerId },
      include: {
        smartWallet: true,
        sessionKeys: {
          where: { revokedAt: null, expiryAt: { gt: new Date() }, activatedAt: { not: null } },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!borrower?.smartWallet) {
      throw new BadRequestException('Complete wallet setup before requesting a loan.');
    }
    if (!borrower.sessionKeys?.length) {
      const err = new BadRequestException(
        'No active session key. Authorize one with your passkey to request a loan.',
      );
      (err as any).code = 'SESSION_KEY_REQUIRED';
      (err as any).requirePasskey = true;
      throw err;
    }

    const poolInterface = new ethers.Interface([
      'function requestLoan(uint256 poolId, uint256 amount, uint256 durationDays) external returns (uint256)',
      'event LoanRequested(uint256 indexed poolId, uint256 indexed requestId, address indexed borrower, uint256 amount, uint256 durationSec, bool isExtension)',
    ]);

    const amountWei = ethers.parseUnits(dto.amount.toString(), tokenInfo.decimals || 6);
    const receipt = await this.executeVaultCall(
      borrowerId,
      borrower.smartWallet.address,
      borrower.sessionKeys[0],
      poolContractAddress,
      poolInterface.encodeFunctionData('requestLoan', [
        pool.onChainPoolId,
        amountWei,
        dto.durationDays,
      ]),
    );

    for (const log of receipt.logs ?? []) {
      try {
        const parsed = poolInterface.parseLog({ topics: [...log.topics], data: log.data });
        if (parsed?.name === 'LoanRequested') return Number(parsed.args.requestId);
      } catch {
        // Not our event.
      }
    }

    throw new BadRequestException('Loan request did not register on-chain; nothing was recorded.');
  }

  /**
   * Casts a member's vote in `GroupLendingPool`.
   *
   * @returns `loanId` when this vote carried the request over the threshold and
   *          the contract disbursed in the same transaction, otherwise null.
   *
   * @dev The contract owns every rule that matters here — one vote per member,
   *      the borrower may not vote, and the threshold — so its revert is the
   *      authority rather than a second opinion computed locally. The database
   *      checks upstream exist to give a good message, not to decide.
   */
  private async voteOnLoanOnChain(
    pool: any,
    loan: any,
    voterId: string,
    approve: boolean,
  ): Promise<{ loanId: number | null; txHash?: string }> {
    const { ethers } = await import('ethers');

    if (pool.onChainPoolId === null || pool.onChainPoolId === undefined) {
      throw new BadRequestException(
        'This pool predates on-chain custody, so its loans cannot be voted on. Create a new pool.',
      );
    }
    if (loan.onChainRequestId === null || loan.onChainRequestId === undefined) {
      throw new BadRequestException(
        'This loan request was never registered on-chain and cannot be funded.',
      );
    }

    const poolContractAddress =
      process.env.POOL_CONTRACT_ADDRESS || process.env.GROUP_LENDING_POOL_ADDRESS;
    if (!poolContractAddress) throw new BadRequestException('Pool contract is not configured.');

    const voter = await this.prisma.user.findUnique({
      where: { id: voterId },
      include: {
        smartWallet: true,
        sessionKeys: {
          where: { revokedAt: null, expiryAt: { gt: new Date() }, activatedAt: { not: null } },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!voter?.smartWallet) {
      throw new BadRequestException('Complete wallet setup before voting.');
    }
    if (!voter.sessionKeys?.length) {
      const err = new BadRequestException(
        'No active session key. Authorize one with your passkey to vote.',
      );
      (err as any).code = 'SESSION_KEY_REQUIRED';
      (err as any).requirePasskey = true;
      throw err;
    }

    const poolInterface = new ethers.Interface([
      'function voteOnLoan(uint256 poolId, uint256 loanRequestId, bool approve) external',
      'event LoanExecuted(uint256 indexed poolId, uint256 indexed loanId, address indexed borrower, uint256 amount, uint256 deadline)',
    ]);

    const receipt = await this.executeVaultCall(
      voterId,
      voter.smartWallet.address,
      voter.sessionKeys[0],
      poolContractAddress,
      poolInterface.encodeFunctionData('voteOnLoan', [
        pool.onChainPoolId,
        loan.onChainRequestId,
        approve,
      ]),
    );

    // A LoanExecuted in this receipt means the vote was the deciding one and
    // the pool has already paid the borrower.
    for (const log of receipt.logs ?? []) {
      try {
        const parsed = poolInterface.parseLog({ topics: [...log.topics], data: log.data });
        if (parsed?.name === 'LoanExecuted') {
          this.logger.log(
            `[Pools] Pool #${pool.onChainPoolId} disbursed loan #${parsed.args.loanId} on-chain: ${receipt.hash}`,
          );
          return { loanId: Number(parsed.args.loanId), txHash: receipt.hash };
        }
      } catch {
        // Not our event.
      }
    }

    return { loanId: null, txHash: receipt.hash };
  }

  /**
   * What `repayLoan` will actually demand, in token base units.
   *
   * @dev Principal plus a late fee once the loan is more than five days past
   *      its deadline. Reading it from the contract rather than recomputing it
   *      means a fee-config change cannot silently make every repayment revert
   *      with "Must repay principal + late fee" — a message the borrower can do
   *      nothing with. Falls back to the caller's figure only if the read
   *      fails, so an RPC blip does not block a repayment that would succeed.
   */
  private async requiredRepaymentWei(
    provider: any,
    poolContractAddress: string,
    onChainPoolId: number,
    onChainLoanId: number,
    decimals: number,
    fallbackAmount: number,
  ): Promise<bigint> {
    const { ethers } = await import('ethers');
    const fallback = ethers.parseUnits(fallbackAmount.toString(), decimals);

    try {
      const loan = await this.readLoanOnChain(
        provider,
        poolContractAddress,
        onChainPoolId,
        onChainLoanId,
      );
      if (!loan) return fallback;

      const view = new ethers.Contract(
        poolContractAddress,
        ['function feeConfig() view returns (address)'],
        provider,
      );

      // Outstanding, not the original principal. Where instalments are
      // supported, quoting the principal would ask a borrower who has already
      // paid most of it to pay the whole thing again. On an older deployment
      // `amountRepaid` is zero, so this reduces to the principal — which is
      // exactly right there, because partial payment is impossible.
      const principal: bigint = loan.principal - loan.amountRepaid;
      const deadline = loan.repaymentDeadline;

      let lateFeeBps = 300n; // Contract default when no fee config is set.
      const feeConfigAddress: string = await view.feeConfig();
      if (feeConfigAddress && feeConfigAddress !== ethers.ZeroAddress) {
        const feeConfig = new ethers.Contract(
          feeConfigAddress,
          ['function lateFeeBps() view returns (uint256)'],
          provider,
        );
        lateFeeBps = BigInt(await feeConfig.lateFeeBps());
      }

      // Five-day grace, matching the contract exactly — and charged once, so a
      // loan whose fee has already been taken is not quoted it again.
      const isLate = Math.floor(Date.now() / 1000) > deadline + 5 * 24 * 60 * 60;
      const lateFee = isLate && !loan.lateFeeCharged ? (principal * lateFeeBps) / 10_000n : 0n;
      void loan.repaid;

      return principal + lateFee;
    } catch (err: any) {
      this.logger.warn(
        `Could not read the required repayment from the pool contract (${err.message}); ` +
        `using the requested amount.`,
      );
      return fallback;
    }
  }

  /**
   * Adds a member to the pool in `GroupLendingPool`.
   *
   * @dev Called by the pool's *creator* vault, which is what the contract
   *      authorises. The join therefore succeeds only while the pool is
   *      unfunded; afterwards the contract reverts and so does this, rather
   *      than writing a member row that grants nothing.
   */
  private async addMemberOnChain(pool: any, newMemberId: string): Promise<void> {
    const { ethers } = await import('ethers');

    if (pool.onChainPoolId === null || pool.onChainPoolId === undefined) {
      throw new BadRequestException(
        'This pool predates on-chain custody and cannot take new members. Create a new pool.',
      );
    }

    const poolContractAddress =
      process.env.POOL_CONTRACT_ADDRESS || process.env.GROUP_LENDING_POOL_ADDRESS;
    if (!poolContractAddress) throw new BadRequestException('Pool contract is not configured.');

    const [creator, member] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: pool.creatorId },
        include: {
          smartWallet: true,
          sessionKeys: {
            where: { revokedAt: null, expiryAt: { gt: new Date() }, activatedAt: { not: null } },
            orderBy: { createdAt: 'desc' },
          },
        },
      }),
      this.prisma.user.findUnique({
        where: { id: newMemberId },
        include: { smartWallet: true },
      }),
    ]);

    if (!member?.smartWallet) {
      throw new BadRequestException('Complete wallet setup before joining a pool.');
    }
    if (!creator?.smartWallet) {
      throw new BadRequestException('The pool creator has no wallet; this pool cannot take members.');
    }
    if (!creator.sessionKeys?.length) {
      throw new BadRequestException(
        'The pool creator needs an active session key to admit new members. Ask them to open the app.',
      );
    }

    const poolInterface = new ethers.Interface([
      'function addMember(uint256 poolId, address member) external',
    ]);

    await this.executeVaultCall(
      pool.creatorId,
      creator.smartWallet.address,
      creator.sessionKeys[0],
      poolContractAddress,
      poolInterface.encodeFunctionData('addMember', [
        pool.onChainPoolId,
        member.smartWallet.address,
      ]),
    );

    this.logger.log(
      `[Pools] Added ${member.smartWallet.address} to pool #${pool.onChainPoolId} on-chain.`,
    );
  }

  /**
   * The loan terms the pool contract will actually apply.
   *
   * @dev Read from `FeeConfig` rather than hardcoded, so the figure a borrower
   *      is shown cannot drift from the one that is charged. Cached briefly
   *      because it changes at most once every 48 hours — the timelock — while
   *      pool details are fetched on every page poll.
   */
  private static loanTermsCache: { at: number; terms: { originationFeeBps: number; lateFeeBps: number } } | null = null;
  private static readonly LOAN_TERMS_TTL_MS = 5 * 60 * 1000;

  async getLoanTerms(): Promise<{ originationFeeBps: number; lateFeeBps: number }> {
    const cached = PoolsService.loanTermsCache;
    if (cached && Date.now() - cached.at < PoolsService.LOAN_TERMS_TTL_MS) return cached.terms;

    // Contract defaults, used when no fee config is wired or the read fails.
    // They match `_executeLoanInternal` and `repayLoan` exactly, so a failed
    // read still shows the borrower what they would actually be charged.
    let terms = { originationFeeBps: 250, lateFeeBps: 300 };

    try {
      const { ethers } = await import('ethers');
      const feeConfigAddress = process.env.FEE_CONFIG_ADDRESS;
      if (feeConfigAddress && ethers.isAddress(feeConfigAddress)) {
        const provider = createBotChainProvider();
        const feeConfig = new ethers.Contract(
          feeConfigAddress,
          [
            'function originationFeeBps() view returns (uint256)',
            'function lateFeeBps() view returns (uint256)',
          ],
          provider,
        );
        const [origination, late] = await Promise.all([
          feeConfig.originationFeeBps(),
          feeConfig.lateFeeBps(),
        ]);
        terms = { originationFeeBps: Number(origination), lateFeeBps: Number(late) };
      }
    } catch (err: any) {
      this.logger.warn(`Could not read loan terms from FeeConfig (${err.message}); using defaults.`);
    }

    PoolsService.loanTermsCache = { at: Date.now(), terms };
    return terms;
  }

  async createPool(creatorId: string, dto: CreatePoolDto) {
    this.logger.log('🔶 [PoolsService] CREATE POOL START');
    this.logger.log(`  📝 Creator ID: ${creatorId}`);
    this.logger.log(`  📝 Pool Name: ${dto.name}`);
    this.logger.log(`  📝 Token: ${dto.token || DEFAULT_TOKEN_SYMBOL}`);
    // Count only. Logging the identifiers wrote emails, wallets and UUIDs to
    // Loki at INFO for every pool created. @see BE-M-03
    this.logger.log(`  📝 Members: ${(dto.members || []).length}`);

    if (!dto.name || !dto.name.trim()) {
      this.logger.error('  ❌ Pool name is required');
      throw new BadRequestException('Pool name is required');
    }

    const token = (dto.token || DEFAULT_TOKEN_SYMBOL).toUpperCase();
    const rawMembers = dto.members || [];
    const creator = await this.prisma.user.findUnique({
      where: { id: creatorId },
      select: { id: true, username: true, email: true },
    });
    if (!creator) throw new NotFoundException('Pool creator not found');

    // A pool member identifier is user-facing. Never persist the internal UUID
    // for the creator when we have their social handle.
    const creatorIdentifier = creator.username
      ? `@${creator.username.replace(/^@/, '')}`
      : creator.email || creator.id;
    const memberCandidates = [creatorIdentifier, ...rawMembers];
    const resolvedCandidates = await Promise.all(
      memberCandidates.map(async (identifier) => ({
        userIdentifier: identifier,
        userId: (await this.resolveMemberToUserId(identifier)) || undefined,
        depositedAmount: 0,
      })),
    );
    // A creator can also be entered manually as a handle or UUID. Deduplicate
    // by resolved identity without folding the case of unresolved handles.
    const seenUserIds = new Set<string>();
    const seenUnresolvedIdentifiers = new Set<string>();
    const membersData = resolvedCandidates.filter((member) => {
      if (member.userId) {
        if (seenUserIds.has(member.userId)) return false;
        seenUserIds.add(member.userId);
        return true;
      }
      if (seenUnresolvedIdentifiers.has(member.userIdentifier)) return false;
      seenUnresolvedIdentifiers.add(member.userIdentifier);
      return true;
    });

    this.logger.log(`  📋 Final Members List (${membersData.length}) prepared`);

    try {
      this.logger.log('  💾 Creating pool in database...');

      // Create the pool on-chain FIRST.
      //
      // A pool row without an on-chain counterpart is worse than no pool: the
      // deposit path transfers real tokens to GroupLendingPool, and the
      // contract only credits `memberShares` through `deposit(poolId, amount)`.
      // Raw transfers into a pool that was never created land in the contract
      // attributed to nobody, and `withdraw` is `onlyMember` of a pool that
      // does not exist — so the funds cannot be recovered by anyone, ever.
      //
      // Failing here means no pool is created, which is the correct outcome:
      // members can retry, whereas stranded deposits are permanent.
      const onChainPoolId = await this.createPoolOnChain(creatorId, dto.name.trim(), token, membersData);

      const pool = await this.prisma.groupPool.create({
        data: {
          name: dto.name.trim(),
          creatorId,
          token,
          poolBalance: 0,
          onChainPoolId,
          // Stored in basis points. The form has always collected a rate and
          // this method has always accepted it, but nothing wrote it down — so
          // every loan was interest-free whatever the pool agreed.
          interestRateBps: Math.max(0, Math.round((dto.interestRate ?? 0) * 100)),
          members: {
            create: membersData,
          },
        },
        include: { members: true },
      });

      const inviteLink = `${getAppBaseUrl()}/pools/${pool.id}?join=1`;

      this.logger.log(`  ✅ Pool created in DB: ${pool.id}`);
      this.logger.log(`  🔗 Invite Link: ${inviteLink}`);

      // Notification for pool creation


      const creatorName = creator?.username || 'Someone';

      // Notify all invited members (except creator) across all channels
      const invitedMembers = membersData.filter((member) => member.userId !== creatorId);
      this.logger.log(`  📢 Notifying ${invitedMembers.length} invited members...`);

      for (const member of invitedMembers) {
        this.logger.log('    🔍 Resolving invited member');
        // Resolve member identifier to actual user ID
        const resolvedUserId = member.userId || await this.resolveMemberToUserId(member.userIdentifier);

        if (resolvedUserId) {
          this.logger.log(`    ✅ Resolved to user ID: ${resolvedUserId}`);
          this.unifiedNotificationService.notifyUser({
            userId: resolvedUserId,
            type: 'pool_invitation',
            title: '👥 Pool Invitation!',
            body: `${creatorName} invited you to join the "${pool.name}" pool.`,
            link: inviteLink,
            metadata: {
              poolId: pool.id,
              poolName: pool.name,
              creatorId,
              creatorName,
              memberCount: membersData.length,
              token
            },
          }).catch(err => this.logger.warn(`Failed to notify invited member: ${err.message}`));
        } else {
          this.logger.warn('Could not resolve invited member identifier');
        }
      }

      this.logger.log(`  ✅✅✅ POOL CREATION COMPLETE: ${pool.id}`);

      return {
        success: true,
        poolId: pool.id,
        pool,
        inviteLink,
      };
    } catch (e: any) {
      this.logger.error(`  ❌❌❌ POOL CREATION FAILED: ${e.message}`);
      this.logger.error(`  Stack: ${e.stack}`);
      throw new BadRequestException(`Failed to create pool: ${e.message}`);
    }
  }


  async findAllForUser(userId: string, limit?: number, offset?: number) {
    try {
      const cleanUserId = userId.startsWith('@') ? userId.slice(1) : userId;

      // Find all identity fields for this user
      const user = await this.prisma.user.findFirst({
        where: {
          OR: [
            { id: userId },
            { id: cleanUserId },
            { username: cleanUserId },
            { telegramId: userId },
            { telegramId: cleanUserId },
            { whatsappId: userId },
            { whatsappId: cleanUserId },
            { discordId: userId },
            { discordId: cleanUserId },
            { slackId: userId },
            { slackId: cleanUserId },
            { smartWallet: { address: { equals: userId, mode: 'insensitive' } } },
          ],
        },
        include: { smartWallet: true },
      });

      const userIdentifiers = new Set<string>([userId, cleanUserId, `@${cleanUserId}`]);
      if (user) {
        userIdentifiers.add(user.id);
        if (user.smartWallet?.address) {
          userIdentifiers.add(user.smartWallet.address);
          userIdentifiers.add(user.smartWallet.address.toLowerCase());
        }
        if (user.username) {
          userIdentifiers.add(user.username);
          userIdentifiers.add(`@${user.username}`);
        }
        if (user.telegramId) userIdentifiers.add(user.telegramId);
        if (user.whatsappId) userIdentifiers.add(user.whatsappId);
        if (user.discordId) userIdentifiers.add(user.discordId);
        if (user.slackId) userIdentifiers.add(user.slackId);
        if (user.email) userIdentifiers.add(user.email);
      }

      const whereConditions: Prisma.GroupPoolWhereInput[] = Array.from(userIdentifiers).flatMap((idVal) => [
        { creatorId: idVal },
        { members: { some: { userIdentifier: idVal } } },
      ]);
      if (user) {
        // A member may have been added through any of their social handles.
        // The relation is the canonical identity and is what bot lookups must
        // trust once the handle has been resolved at invitation time.
        whereConditions.push({ members: { some: { userId: user.id } } });
      }

      const where: Prisma.GroupPoolWhereInput = { OR: whereConditions };

      const [pools, total] = await Promise.all([
        this.prisma.groupPool.findMany({
          where,
          include: {
            creator: { select: { id: true, username: true } },
            members: true,
            loans: true,
          },
          orderBy: { createdAt: 'desc' },
          ...(limit !== undefined ? { take: limit } : {}),
          ...(offset !== undefined ? { skip: offset } : {}),
        }),
        this.prisma.groupPool.count({ where }),
      ]);

      return { pools, total };
    } catch (e: any) {
      this.logger.error(`Failed to fetch pools for ${userId}: ${e.message}`);
      return { pools: [], total: 0 };
    }
  }

  async findOne(id: string) {
    const pool = await this.prisma.groupPool.findUnique({
      where: { id },
      include: {
        creator: { select: { id: true, username: true } },
        members: { include: { user: { select: { id: true, username: true, email: true, reputationPoints: true, smartWallet: { select: { address: true } } } } } },
        loans: {
          include: {
            borrower: {
              select: {
                id: true,
                username: true,
                email: true,
                reputationPoints: true,
                smartWallet: { select: { address: true } },
              },
            },
            votes: {
              include: {
                voter: {
                  select: {
                    id: true,
                    username: true,
                    smartWallet: { select: { address: true } },
                  },
                },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!pool) {
      throw new NotFoundException('Group pool not found');
    }

    let activities: any[] = [];
    try {
      activities = await this.prisma.userActivityLog.findMany({
        where: {
          metadata: {
            path: ['poolId'],
            equals: id,
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 30,
      });
    } catch (e) {
      this.logger.warn(`Could not fetch activities for pool ${id}: ${e}`);
    }

    let livePoolBalance = pool.poolBalance;
    let totalOutstandingLoans = 0;
    try {
      const poolContractAddress =
        process.env.POOL_CONTRACT_ADDRESS || process.env.GROUP_LENDING_POOL_ADDRESS;
      if (poolContractAddress && pool.onChainPoolId !== null && pool.onChainPoolId !== undefined) {
        const { ethers } = await import('ethers');
        const { resolveToken } = await import('../config/tokens.config');
        const tokenInfo = resolveToken(pool.token);
        const decimals = tokenInfo?.decimals || 6;
        // `BOTCHAIN_RPC_URL`, matching every other call site. This read used
        // `RPC_URL` with a different fallback host — neither of which exists
        // here — so it threw on every request and left the stale stored balance
        // standing. That is how the page showed 450 while the contract held
        // 415 after a 35 disbursement.
        const provider = createBotChainProvider();
        const view = new ethers.Contract(
          poolContractAddress,
          [
            'function pools(uint256) view returns (uint256 id, string name, address creator, address token, uint256 poolBalance, uint256 memberCount, uint256 loanRequestCount, uint256 loanCount, uint256 totalOutstandingLoans, uint256 totalShares, bool exists)',
          ],
          provider,
        );
        const onChainData = await view.pools(pool.onChainPoolId);
        if (onChainData && onChainData.exists) {
          livePoolBalance = parseFloat(ethers.formatUnits(onChainData.poolBalance, decimals));
          totalOutstandingLoans = parseFloat(ethers.formatUnits(onChainData.totalOutstandingLoans, decimals));

          if (Math.abs(pool.poolBalance - livePoolBalance) > 0.0001) {
            await this.prisma.groupPool.update({
              where: { id },
              data: { poolBalance: livePoolBalance },
            }).catch(() => undefined);
          }
        }
      }
    } catch (err: any) {
      // Warn, not debug. Falling back to the stored balance means showing a
      // number that may be wrong about someone's money, and that should be
      // visible in the logs rather than filtered out by default.
      this.logger.warn(`Could not fetch on-chain pool balance for pool ${id}: ${err.message}`);
    }

    if (totalOutstandingLoans === 0) {
      const activeExecutedLoans = (pool.loans || []).filter((l: any) => l.status === 'EXECUTED');
      totalOutstandingLoans = activeExecutedLoans.reduce((sum: number, l: any) => sum + (l.amount || 0), 0);
    }

    const reputationByUserId = new Map<string, number>();
    for (const member of pool.members || []) {
      const rep = (member.reputationPoints ?? 0) + (member.user?.reputationPoints ?? 0);
      if (member.userId) reputationByUserId.set(member.userId, rep);
      if (member.userIdentifier) reputationByUserId.set(member.userIdentifier, rep);
    }

    // Outstanding principal per live loan, straight from the contract.
    const onChainOutstanding = await this.readOutstandingPrincipals(pool);

    const loans = (pool.loans || []).map((loan: any) => ({
      ...loan,
      borrowerReputation: reputationByUserId.get(loan.borrowerId) ?? (loan.borrower?.reputationPoints ?? 0),
      // What this borrower owes right now, so the repay button can name a
      // figure instead of quoting the principal and surprising them at signing.
      repayment:
        loan.status === LoanStatus.EXECUTED
          ? {
              ...this.loanRepaymentBreakdown(pool, loan),
              // Read from the contract: instalments live there, and a mirror
              // would drift the moment a payment landed outside this backend.
              outstanding: onChainOutstanding.get(loan.id) ?? loan.amount,
            }
          : undefined,
    }));

    return {
      ...pool,
      poolBalance: livePoolBalance,
      totalOutstandingLoans,
      loans,
      activities,
      // Surfaced so the request form can tell a borrower what they will
      // actually receive. The origination fee is deducted on disbursement, so
      // asking for 100 delivers 97.5 while still owing 100 — a difference
      // nothing told them about before they committed.
      loanTerms: {
        ...(await this.getLoanTerms()),
        /// The pool's own rate, so the request form can quote the cost of
        /// borrowing rather than only the origination fee.
        interestRateBps: pool.interestRateBps ?? 0,
        /// Whether the deployed contract accepts partial repayment. False on
        /// deployments predating instalments, where the UI must not offer a
        /// button that can only revert.
        supportsInstalments: await this.supportsInstalments(),
      },
    };
  }

  async deposit(id: string, memberId: string, amount: number) {
    if (!amount || amount <= 0) throw new BadRequestException('Deposit amount must be > 0');

    this.logger.log(`💰 [Pool Deposit] User ${memberId} depositing ${amount} to pool ${id}`);

    // Get pool and user details
    const pool = await this.findOne(id);
    const user = await this.prisma.user.findUnique({
      where: { id: memberId },
      include: {
        smartWallet: true,
        sessionKeys: {
          where: {
            expiryAt: { gte: new Date() },
            revokedAt: null,
            // A locally stored key is not usable until its passkey-authorized
            // grant has been registered on the vault's on-chain registry.
            activatedAt: { not: null },
          },
        },
      },
    });

    if (!user?.smartWallet) {
      throw new BadRequestException('User wallet not found');
    }

    if (!user.sessionKeys || user.sessionKeys.length === 0) {
      const error = new ForbiddenException(
        'Authorize an instant-payment session with your passkey before depositing to this pool.',
      );
      (error as any).code = 'SESSION_KEY_REQUIRED';
      (error as any).requirePasskey = true;
      throw error;
    }

    // A closed pool is terminal: its balances were returned and its members
    // were told it was finished. Accepting anything after that reopens an
    // obligation nobody agreed to.
    if (pool.closedAt) {
      throw new BadRequestException('This pool has been closed.');
    }

    // Refuse to take money a pool cannot give back.
    //
    // Pools created before on-chain registration have no id, so there is no
    // `deposit(poolId, …)` to call and no `memberShares` to credit. Depositing
    // into one puts tokens in the contract attributed to nobody, recoverable by
    // nobody. Blocking is the only honest option — the funds already stranded
    // this way cannot be retrieved, and this stops the pile growing.
    if (pool.onChainPoolId === null || pool.onChainPoolId === undefined) {
      throw new BadRequestException(
        'This pool predates on-chain custody and can no longer accept deposits. ' +
        'Create a new pool — deposits here could not be withdrawn.',
      );
    }

    // Execute on-chain deposit via smart contract
    let txHash: string;
    try {
      const { ethers } = await import('ethers');
      const { resolveToken } = await import('../config/tokens.config');

      const poolContractAddress = process.env.POOL_CONTRACT_ADDRESS || process.env.GROUP_LENDING_POOL_ADDRESS;
      if (!poolContractAddress) {
        throw new Error('Pool contract address not configured');
      }

      const tokenInfo = resolveToken(pool.token);
      if (!tokenInfo) {
        throw new Error(`Token ${pool.token} not configured`);
      }

      const amountWei = ethers.parseUnits(amount.toString(), tokenInfo.decimals || 6);
      const sessionKey = user.sessionKeys[0];

      this.logger.log(`  📝 Token: ${pool.token} (${tokenInfo.address})`);
      this.logger.log(`  📝 Amount: ${amount} = ${amountWei.toString()} wei`);
      this.logger.log(`  📝 Pool Contract: ${poolContractAddress} (pool #${pool.onChainPoolId})`);

      // Approve, then deposit through the contract's own entry point.
      //
      // This used to be a bare ERC-20 transfer to the pool's address. The
      // tokens arrived, but `GroupLendingPool` never learned who sent them:
      // `memberShares` is only written by `deposit(poolId, amount)`. Every such
      // transfer became an unattributable balance that `withdraw` — gated on
      // `onlyMember` and on the pool's own `poolBalance` — could never return.
      const erc20 = new ethers.Interface([
        'function approve(address spender, uint256 amount) external returns (bool)',
      ]);
      await this.executeVaultCall(
        memberId,
        user.smartWallet.address,
        sessionKey,
        tokenInfo.address,
        erc20.encodeFunctionData('approve', [poolContractAddress, amountWei]),
      );

      const poolInterface = new ethers.Interface([
        'function deposit(uint256 poolId, uint256 amount) external',
      ]);
      const receipt = await this.executeVaultCall(
        memberId,
        user.smartWallet.address,
        sessionKey,
        poolContractAddress,
        poolInterface.encodeFunctionData('deposit', [pool.onChainPoolId, amountWei]),
        amount,
      );

      txHash = receipt.hash;
      this.logger.log(`  ✅ Pool deposit credited on-chain: ${txHash}`);
    } catch (err: any) {
      // `executeLocalSessionAction` already verified the on-chain registry and
      // marked a stale grant inactive. Preserve this signal for the client so
      // it can request a passkey grant instead of presenting a generic pool
      // failure or repeatedly submitting a transaction that must revert.
      if (err?.code === 'SESSION_KEY_REQUIRED' || err?.requirePasskey === true) {
        throw err;
      }
      this.logger.error(`Pool deposit failed: ${err.message}`);
      throw new BadRequestException(`Pool deposit failed: ${err.message}`);
    }

    // Update database after successful on-chain deposit
    let persisted = false;
    try {
      await this.prisma.groupPool.update({
        where: { id },
        data: { poolBalance: { increment: amount } },
      });

      // Update pool member by userId (memberId is the actual user UUID)
      const updated = await this.prisma.poolMember.updateMany({
        where: {
          poolId: id,
          OR: [
            { userId: memberId },
            { userIdentifier: memberId },
          ],
        },
        data: {
          depositedAmount: { increment: amount },
          userId: memberId, // Ensure userId is set
        },
      });

      // If no member found, create one
      if (updated.count === 0) {
        await this.prisma.poolMember.create({
          data: {
            poolId: id,
            userId: memberId,
            userIdentifier: user.username || user.email || memberId,
            depositedAmount: amount,
          },
        });
      }

      persisted = true;
    } catch (e: any) {
      this.logger.error(`Failed to update database after deposit: ${e.message}`);
    }

    if (persisted) {
      await this.activityService.record({
        userIdentifier: memberId,
        action: UserActivityAction.POOL_DEPOSIT,
        amount,
        token: pool.token,
        txHash,
        metadata: { poolId: id },
      });
    }

    // The pool's token travels with the result: chat surfaces were printing a
    // hardcoded "USDC" for pools denominated in USDT, telling people they had
    // deposited an asset they had not.
    return { success: true, depositedAmount: amount, txHash, token: pool.token };
  }

  async requestLoan(id: string, borrowerId: string, dto: RequestLoanDto) {
    if (!dto.amount || dto.amount <= 0) throw new BadRequestException('Loan amount must be > 0');
    if (!dto.durationDays || dto.durationDays <= 0) throw new BadRequestException('Duration must be > 0');

    const pool = await this.findOne(id);
    if (dto.amount > pool.poolBalance) {
      throw new BadRequestException(`Loan amount ($${dto.amount}) exceeds current pool balance ($${pool.poolBalance})`);
    }

    // A closed pool is terminal: its balances were returned and its members
    // were told it was finished. Accepting anything after that reopens an
    // obligation nobody agreed to.
    if (pool.closedAt) {
      throw new BadRequestException('This pool has been closed.');
    }

    // One outstanding loan per member, per pool.
    //
    // Enforced here rather than only in the UI: the same endpoint is reachable
    // from the bots and directly, and without it a member could stack requests
    // and drain a pool they have not repaid a penny of. Scoped to this pool,
    // since another pool's members took their own risk.
    //
    // `isExtension` rows are excluded — an extension is a request to move an
    // existing deadline, not new debt, and it is created through
    // `requestExtension`. Blocking it here would leave a borrower who needs
    // more time with no way to ask for it.
    const outstanding = await this.prisma.loanApplication.findFirst({
      where: {
        poolId: id,
        borrowerId,
        isExtension: false,
        status: {
          in: [LoanStatus.PENDING, LoanStatus.APPROVED, LoanStatus.EXECUTED, LoanStatus.DEFAULTED],
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (outstanding) {
      const wording =
        outstanding.status === LoanStatus.PENDING
          ? `You already have a ${outstanding.amount} ${pool.token} request awaiting votes in this pool.`
          : outstanding.status === LoanStatus.APPROVED
            ? `Your ${outstanding.amount} ${pool.token} loan is approved and being disbursed.`
            : `You still owe ${outstanding.amount} ${pool.token} to this pool.`;
      throw new BadRequestException(`${wording} Repay it before requesting another loan.`);
    }

    const borrowerName = await this.resolveUserDisplayName(borrowerId, id);

    // Register the request on-chain before recording it.
    //
    // The contract is what holds the money and what decides, so a request it
    // has never heard of cannot be voted on or disbursed — it could only be
    // "paid" by the relayer out of its own funds, which is exactly how the pool
    // ended up never funding a single loan.
    const onChainRequestId = await this.requestLoanOnChain(id, borrowerId, pool, dto);

    let loan: any;
    try {
      loan = await this.prisma.loanApplication.create({
        data: {
          poolId: id,
          borrowerId,
          amount: dto.amount,
          purpose: dto.purpose || null,
          durationDays: dto.durationDays,
          status: LoanStatus.PENDING,
          approveVotes: 0,
          rejectVotes: 0,
          onChainRequestId,
        },
      });
    } catch (e) {
      loan = {
        id: `loan-${Date.now()}`,
        poolId: id,
        borrowerId,
        amount: dto.amount,
        purpose: dto.purpose || null,
        durationDays: dto.durationDays,
        status: 'PENDING',
        approveVotes: 0,
        rejectVotes: 0,
        createdAt: new Date(),
      };
    }

    for (const member of pool.members || []) {
      if (member.userId !== borrowerId && member.userIdentifier !== borrowerId && member.userIdentifier !== borrowerName) {
        const targetUserId = member.userId || member.userIdentifier;
        // Unified notification for loan request
        this.unifiedNotificationService.notifyUser({
          userId: targetUserId,
          type: 'pool_loan_requested',
          title: 'New Group Loan Request 🏦',
          body: `${borrowerName} requested a loan of ${dto.amount} ${pool.token} for ${dto.durationDays} days. Vote now!`,
          amount: dto.amount,
          token: pool.token,
          from: borrowerName,
          link: `${getAppBaseUrl()}/pools/${id}`,
          metadata: { poolId: id, loanId: loan.id, durationDays: dto.durationDays },
        }).catch(err => this.logger.warn(`Failed to send unified notification: ${err.message}`));
      }
    }

    await this.activityService.record({
      userIdentifier: borrowerId,
      action: UserActivityAction.LOAN_REQUESTED,
      amount: dto.amount,
      token: pool.token,
      metadata: { poolId: id, loanId: loan.id, durationDays: dto.durationDays },
    }).catch(() => {});

    // Terms travel with the result so every caller — web, Telegram, WhatsApp —
    // can tell the borrower what they will actually receive. Previously only
    // the pool page knew, because only it fetched pool details.
    const loanTerms = await this.getLoanTerms();
    const originationFee = (dto.amount * loanTerms.originationFeeBps) / 10_000;

    return {
      success: true,
      loan,
      loanTerms,
      /** Net of the origination fee deducted on disbursement. */
      amountReceived: dto.amount - originationFee,
      originationFee,
      token: pool.token,
    };
  }

  async voteLoan(id: string, loanId: string, voterId: string, approve: boolean) {
    const pool = await this.findOne(id);
    const loan = (pool.loans || []).find((l: any) => l.id === loanId);
    if (!loan) throw new NotFoundException('Loan request not found');

    if (loan.status !== LoanStatus.PENDING) {
      throw new BadRequestException(`Loan request is already ${loan.status}`);
    }

    // Resolve voter identity
    const voter = await this.prisma.user.findFirst({
      where: {
        OR: [
          { id: voterId },
          { username: voterId.replace(/^@/, '') },
          { telegramId: voterId },
          { whatsappId: voterId },
        ],
      },
      select: { id: true, username: true },
    });
    // Resolved before every rule below. The self-vote check compares user ids,
    // so an unresolved identifier would compare a handle against a uuid, never
    // match, and let a borrower approve their own request.
    if (!voter?.id) {
      throw new BadRequestException(
        'Could not identify you as a pool member. Open the app from your linked account and try again.',
      );
    }
    const actualVoterId = voter.id;

    // Rule 1: The requester of the loan CANNOT approve/vote on their own loan request!
    if (loan.borrowerId === actualVoterId || loan.borrowerId === voterId) {
      throw new BadRequestException('The requester of the loan cannot approve or vote on their own loan request. Approval must come from other pool members.');
    }

    // Rule 2: Voter must be an active member of this pool
    const isMember = (pool.members || []).some(
      (m: any) => m.userId === actualVoterId || m.userIdentifier === voterId || (voter?.username && m.userIdentifier === `@${voter.username}`),
    );
    if (!isMember) {
      throw new ForbiddenException('Only members of this pool can vote on loan requests');
    }

    // Rule 3: One vote per member, enforced by the database.
    //
    // This used to be a read-then-create, and to run only when the voter
    // resolved to a User row. Both were holes: two clicks racing each other
    // both saw no existing vote and both counted, and an unresolved identifier
    // skipped the check entirely and could vote without limit. The unique
    // constraint on (loanId, voterId) settles it — a duplicate is a rejected
    // write, not a lost race.
    try {
      await this.prisma.loanVote.create({
        data: { loanId, voterId: voter.id, approve },
      });
    } catch (err: any) {
      if (err?.code === 'P2002') {
        throw new BadRequestException('You have already voted on this loan request');
      }
      throw err;
    }

    // Rule 4: Compute voting threshold (>50% of non-borrower members)
    const eligibleMembers = (pool.members || []).filter(
      (m: any) => m.userId !== loan.borrowerId && m.userIdentifier !== loan.borrowerId,
    );
    const eligibleCount = Math.max(1, eligibleMembers.length);
    const threshold = Math.floor(eligibleCount / 2) + 1;

    // Counted from the vote rows, not incremented from the copy read at the top
    // of this request. Two concurrent voters both read the same starting value,
    // so incrementing lost one of them — and an undercounted approval is a loan
    // that silently fails to reach its threshold.
    const [approveVotes, rejectVotes] = await Promise.all([
      this.prisma.loanVote.count({ where: { loanId, approve: true } }),
      this.prisma.loanVote.count({ where: { loanId, approve: false } }),
    ]);

    let status: LoanStatus = LoanStatus.PENDING;
    let autoDisbursed = false;
    let disburseTxHash: string | undefined;

    // Cast the vote on-chain first, and let the contract decide the outcome.
    //
    // `voteOnLoan` tallies, checks the threshold, and disburses from the pool's
    // own balance in the same transaction. So this call *is* the vote and, on
    // the deciding vote, the disbursement — which is what makes the pool fund
    // its loans instead of the relayer paying out of its own wallet.
    //
    // The local tally is written afterwards from what actually happened,
    // rather than predicted beforehand and hoped to match.
    let onChainLoanId: number | null = null;
    try {
      const outcome = await this.voteOnLoanOnChain(pool, loan, actualVoterId, approve);
      onChainLoanId = outcome.loanId;
      disburseTxHash = outcome.txHash;
    } catch (err: any) {
      // Nothing was recorded on-chain, so the local vote must not stand either
      // — leaving it would consume the member's one vote for free.
      await this.prisma.loanVote
        .deleteMany({ where: { loanId, voterId: voter.id } })
        .catch(() => undefined);
      throw err;
    }

    if (onChainLoanId !== null) {
      status = LoanStatus.EXECUTED;
      autoDisbursed = true;
    } else if (approveVotes >= threshold) {
      status = LoanStatus.APPROVED;
    } else if (rejectVotes >= threshold) {
      status = LoanStatus.REJECTED;
    }

    try {
      await this.prisma.loanApplication.update({
        where: { id: loanId },
        data: {
          approveVotes,
          rejectVotes,
          status,
          ...(onChainLoanId !== null
            ? {
                onChainLoanId,
                txHash: disburseTxHash,
                repaymentDeadline: new Date(Date.now() + loan.durationDays * 86400000),
              }
            : {}),
        },
      });

      if (onChainLoanId !== null) {
        await this.prisma.groupPool.update({
          where: { id: pool.id },
          data: { poolBalance: { decrement: loan.amount } },
        }).catch((err) => {
          this.logger.error(`Failed to decrement poolBalance on loan execution: ${err.message}`);
        });
      }
    } catch (e) {
      // Fallback
    }

    // Rule 5: Auto-disburse immediately as soon as approval threshold is met!
    if (status === LoanStatus.APPROVED) {
      this.logger.log(`🎉 Loan ${loanId} met approval threshold (${approveVotes}/${threshold}). Auto-disbursing funds...`);

      await this.notificationsService.create({
        userId: loan.borrowerId,
        type: NotificationType.SYSTEM,
        title: 'Group Loan Approved! 🎉',
        body: `Your loan request for ${loan.amount} ${pool.token} was approved by pool members. Processing auto-disbursement...`,
        data: { poolId: id, loanId },
      });

      await this.activityService.record({
        userIdentifier: loan.borrowerId,
        action: UserActivityAction.LOAN_APPROVED,
        amount: loan.amount || 0,
        token: pool.token,
        metadata: { poolId: id, loanId, approveVotes, threshold, eligibleCount },
      }).catch(() => {});

      // No disbursement call here any more. `voteOnLoan` pays out inside the
      // deciding vote, so reaching APPROVED without a loan id means the
      // threshold was not met on-chain — retrying a transfer from the relayer
      // is what used to make the relayer, not the pool, fund every loan.
    } else if (status === LoanStatus.REJECTED) {
      await this.notificationsService.create({
        userId: loan.borrowerId,
        type: NotificationType.SYSTEM,
        title: 'Group Loan Request Rejected ❌',
        body: `Your loan request for ${loan.amount} ${pool.token} in pool '${pool.name}' was rejected by members.`,
        data: { poolId: id, loanId },
      });
    }

    return { success: true, status, approveVotes, rejectVotes, threshold, autoDisbursed, txHash: disburseTxHash };
  }

  async executeLoan(id: string, loanId: string, callerId: string) {
    const pool = await this.findOne(id);
    const loan = (pool.loans || []).find((l: any) => l.id === loanId);
    if (!loan) throw new NotFoundException('Loan request not found');

    if (loan.status !== LoanStatus.APPROVED && loan.status !== LoanStatus.PENDING) {
      if (loan.status === LoanStatus.EXECUTED) {
        return { success: true, status: 'EXECUTED', txHash: loan.txHash, repaymentDeadline: loan.repaymentDeadline };
      }
      throw new BadRequestException('Loan must be APPROVED before execution');
    }

    // Handle extension loan execution
    if (loan.isExtension && loan.targetLoanId) {
      const targetLoan = (pool.loans || []).find((l: any) => l.id === loan.targetLoanId);
      const currentDeadline = targetLoan?.repaymentDeadline ? new Date(targetLoan.repaymentDeadline) : new Date();
      const newDeadline = new Date(currentDeadline.getTime() + loan.durationDays * 24 * 60 * 60 * 1000);

      await this.prisma.loanApplication.update({
        where: { id: loan.targetLoanId },
        data: { repaymentDeadline: newDeadline },
      });
      await this.prisma.loanApplication.update({
        where: { id: loanId },
        data: { status: LoanStatus.EXECUTED, repaymentDeadline: newDeadline },
      });

      return { success: true, status: 'EXECUTED', repaymentDeadline: newDeadline };
    }

    // Claim the disbursement before moving any money.
    //
    // Auto-disbursement fires from `voteLoan` the moment the threshold is met,
    // and two votes arriving together both read PENDING, both cross the
    // threshold, and both call in here. The old order — check status, transfer,
    // then mark EXECUTED — let both transfers through, paying the loan twice.
    // The same hole opened whenever the post-transfer write failed, since the
    // loan stayed APPROVED and any retry disbursed again.
    //
    // Marking EXECUTED first inverts the failure: a crash mid-transfer leaves a
    // loan recorded as paid that was not, which is visible, recoverable, and
    // strictly better than paying twice. A transfer that fails outright rolls
    // the status back below.
    const claimed = await this.prisma.loanApplication.updateMany({
      where: { id: loanId, status: { in: [LoanStatus.PENDING, LoanStatus.APPROVED] } },
      data: { status: LoanStatus.EXECUTED },
    });
    if (claimed.count !== 1) {
      const current = await this.prisma.loanApplication.findUnique({ where: { id: loanId } });
      if (current?.status === LoanStatus.EXECUTED) {
        return {
          success: true,
          status: 'EXECUTED',
          txHash: current.txHash,
          repaymentDeadline: current.repaymentDeadline,
        };
      }
      throw new BadRequestException('Loan must be APPROVED before execution');
    }

    // Disbursement is not performed here any more.
    //
    // `GroupLendingPool.voteOnLoan` pays the borrower from the pool's own
    // balance inside the deciding vote, so by the time a loan is approved it
    // has already been funded. What used to live here was an ERC-20 transfer
    // from the *relayer's* wallet: it is why the pool contract only ever
    // accumulated deposits while the relayer quietly financed every loan, and
    // running it now would pay the borrower a second time.
    //
    // The endpoint is kept because the UI still offers a "Disburse Funds"
    // action, and because a loan can legitimately sit APPROVED if the deciding
    // vote's transaction reverted after the tally. Both cases are answered by
    // reporting on-chain truth rather than moving money.
    if (loan.onChainLoanId !== null && loan.onChainLoanId !== undefined) {
      return {
        success: true,
        status: 'EXECUTED',
        txHash: loan.txHash,
        repaymentDeadline: loan.repaymentDeadline,
      };
    }

    // Release the claim taken above: nothing was disbursed, so the loan must
    // stay votable rather than appear settled.
    await this.prisma.loanApplication
      .updateMany({
        where: { id: loanId, status: LoanStatus.EXECUTED, onChainLoanId: null },
        data: { status: LoanStatus.PENDING },
      })
      .catch(() => undefined);

    throw new BadRequestException(
      'This loan has not been funded on-chain. It is disbursed automatically by the vote that ' +
      'meets the approval threshold — ask the remaining members to vote.',
    );
  }

  async repayLoan(id: string, loanId: string, borrowerId: string, amount: number) {
    const pool = await this.findOne(id);
    const loan = (pool.loans || []).find((l: any) => l.id === loanId);
    if (!loan) throw new NotFoundException('Loan not found');

    // Only the borrower repays their own loan. Without this, any caller who
    // knew the ids could move funds out of the borrower's vault.
    if (loan.borrowerId !== borrowerId) {
      throw new ForbiddenException('Only the borrower can repay this loan');
    }

    if (!amount || amount <= 0) {
      throw new BadRequestException('Repayment amount must be greater than zero.');
    }

    // Is this meant to settle the loan, or is it an instalment?
    //
    // The contract accepts any positive amount and closes the loan once the
    // principal is fully returned, so the caller's intent has to be decided
    // here: a settlement claims the status transition up front, an instalment
    // leaves the loan open. Getting this backwards either marks a loan repaid
    // that is not, or leaves one open that the contract has already closed.
    const owed = this.loanRepaymentBreakdown(pool, loan);
    const isSettlement = amount >= owed.total - 0.000001;

    if (isSettlement) {
      // Claim the repayment before moving money, for the same reason
      // disbursement does.
      //
      // This method had no status check at all: it transferred, then wrote
      // REPAID. A double-tapped button — or any retry — repaid a second time,
      // taking the amount out of the borrower's vault again for a debt already
      // settled. The guard is the state transition itself, so only the caller
      // that wins EXECUTED -> REPAID gets to transfer.
      const claimed = await this.prisma.loanApplication.updateMany({
        where: { id: loanId, status: LoanStatus.EXECUTED },
        data: { status: LoanStatus.REPAID },
      });
      if (claimed.count !== 1) {
        const current = await this.prisma.loanApplication.findUnique({ where: { id: loanId } });
        if (current?.status === LoanStatus.REPAID) {
          throw new BadRequestException('This loan has already been repaid.');
        }
        throw new BadRequestException(
          `Loan cannot be repaid while it is ${current?.status ?? 'in an unknown state'}.`,
        );
      }
    } else if (!(await this.supportsInstalments())) {
      // An older deployment takes principal plus late fee in one call and
      // reverts on anything less. Saying so beats letting the vault submit a
      // transaction that cannot succeed and reporting the contract's message.
      throw new BadRequestException(
        `This pool's contract requires the full amount in one payment. ` +
        `Repay ${owed.total} ${pool.token} to settle the loan.`,
      );
    } else if (loan.status !== LoanStatus.EXECUTED) {
      // An instalment claims nothing, so it needs its own check — without one,
      // a partial payment against a settled loan would reach the contract and
      // revert there with a message nobody can act on.
      throw new BadRequestException(
        loan.status === LoanStatus.REPAID
          ? 'This loan has already been repaid.'
          : `Loan cannot be repaid while it is ${loan.status}.`,
      );
    }

    const now = new Date();
    const deadline = loan.repaymentDeadline ? new Date(loan.repaymentDeadline) : new Date(Date.now() + 864000000);
    const isOnTime = now <= deadline;
    const pointsEarned = isOnTime ? 10 : 0;

    // Repay through the contract so the pool is credited, not just paid.
    //
    // This used to be a bare ERC-20 transfer to the pool's address — the same
    // mistake deposits made. The tokens arrived, but `repayLoan` is what marks
    // the loan repaid, releases `totalOutstandingLoans`, and raises
    // `poolBalance` so lenders can withdraw again. Without it a repayment
    // silently increased the contract's unattributable balance while the loan
    // stayed outstanding on-chain forever.
    let txHash: string;
    try {
      const { ethers } = await import('ethers');
      const { resolveToken } = await import('../config/tokens.config');

      const poolContractAddress =
        process.env.POOL_CONTRACT_ADDRESS || process.env.GROUP_LENDING_POOL_ADDRESS;
      if (!poolContractAddress) throw new Error('Pool contract address not configured');

      const tokenInfo = resolveToken(pool.token);
      if (!tokenInfo) throw new Error(`Token ${pool.token} not configured`);

      if (loan.onChainLoanId === null || loan.onChainLoanId === undefined) {
        throw new Error('This loan was never funded on-chain and cannot be repaid here.');
      }

      const borrower = await this.prisma.user.findUnique({
        where: { id: borrowerId },
        include: {
          smartWallet: true,
          sessionKeys: {
            where: { revokedAt: null, expiryAt: { gt: new Date() }, activatedAt: { not: null } },
            orderBy: { createdAt: 'desc' },
          },
        },
      });
      if (!borrower?.smartWallet) throw new Error('Borrower wallet not found');
      if (!borrower.sessionKeys?.length) {
        const err: any = new BadRequestException(
          'No active session key. Authorize one with your passkey to repay.',
        );
        err.code = 'SESSION_KEY_REQUIRED';
        err.requirePasskey = true;
        throw err;
      }

      // The contract requires principal + any late fee, and reverts on a short
      // payment. Ask it what it wants rather than assuming the principal: a
      // loan more than five days past its deadline owes an extra 3%, and
      // repaying the bare principal would revert with no useful explanation.
      const provider = createBotChainProvider();
      // What the contract insists on: principal plus any late fee.
      const contractMinimum = await this.requiredRepaymentWei(
        provider,
        poolContractAddress,
        pool.onChainPoolId,
        loan.onChainLoanId,
        tokenInfo.decimals || 6,
        amount,
      );

      // Interest on top. The contract charges none — `repayLoan` requires only
      // principal and late fee — but it credits everything above the late fee
      // to `poolBalance`, so paying more sends the interest to the lenders
      // through the share price, split by what each of them put in. No contract
      // change is needed for the pool to earn on its loans.
      const breakdown = this.loanRepaymentBreakdown(pool, loan);
      const interestWei = ethers.parseUnits(
        breakdown.interest.toFixed(tokenInfo.decimals || 6),
        tokenInfo.decimals || 6,
      );
      // A settlement pays everything owed; an instalment pays what was asked.
      // The contract still enforces its own floor — a payment that triggers the
      // late fee must cover it — so a too-small instalment is refused there
      // rather than silently under-paying.
      const settlementWei = contractMinimum + interestWei;
      const required = isSettlement
        ? settlementWei
        : ethers.parseUnits(amount.toFixed(tokenInfo.decimals || 6), tokenInfo.decimals || 6);

      if (breakdown.interest > 0) {
        this.logger.log(
          `[Pools] Repaying loan ${loanId}: ${breakdown.principal} principal ` +
          `+ ${breakdown.interest} interest (${(pool.interestRateBps ?? 0) / 100}% p.a.) ${pool.token}.`,
        );
      }

      const erc20 = new ethers.Interface([
        'function approve(address spender, uint256 amount) external returns (bool)',
      ]);
      await this.executeVaultCall(
        borrowerId,
        borrower.smartWallet.address,
        borrower.sessionKeys[0],
        tokenInfo.address,
        erc20.encodeFunctionData('approve', [poolContractAddress, required]),
      );

      const poolInterface = new ethers.Interface([
        'function repayLoan(uint256 poolId, uint256 loanId, uint256 amount) external',
      ]);
      const receipt = await this.executeVaultCall(
        borrowerId,
        borrower.smartWallet.address,
        borrower.sessionKeys[0],
        poolContractAddress,
        poolInterface.encodeFunctionData('repayLoan', [
          pool.onChainPoolId,
          loan.onChainLoanId,
          required,
        ]),
        amount,
      );

      txHash = receipt.hash;
      this.logger.log(`Loan repaid to pool on-chain: ${txHash} (${amount} ${pool.token})`);
    } catch (err: any) {
      // Nothing moved, so the debt still stands — release the claim, if one was
      // taken. An instalment never claimed the status, so there is nothing to
      // undo and rolling back would reopen a loan somebody else just settled.
      if (isSettlement) {
        await this.prisma.loanApplication
          .updateMany({
            where: { id: loanId, status: LoanStatus.REPAID },
            data: { status: LoanStatus.EXECUTED },
          })
          .catch(() => undefined);
      }

      this.logger.error(`Loan repayment failed: ${err.message}`);
      throw new BadRequestException(`Loan repayment failed: ${err.message}`);
    }

    let persisted = false;
    try {
      // `poolBalance` is refreshed from the contract on every read, so this is
      // only a hint until the next fetch — but leaving it stale showed a
      // borrower their repayment vanishing.
      await this.prisma.groupPool.update({
        where: { id },
        data: { poolBalance: { increment: amount } },
      });

      // Only a settlement closes the loan. An instalment leaves it EXECUTED,
      // and the outstanding balance is read from the contract, which is the
      // only place that actually knows how much is left.
      if (isSettlement) {
        await this.prisma.loanApplication.update({
          where: { id: loanId },
          data: { status: LoanStatus.REPAID },
        });
      }

      const borrowerName = await this.resolveUserDisplayName(borrowerId, id);

      // Reputation only on the payment that settles the loan, mirroring the
      // contract. Crediting per instalment would let a borrower mint standing
      // from dust while still owing almost all of it.
      if (isOnTime && isSettlement) {
        // 1. Increment reputationPoints on PoolMember record
        await this.prisma.poolMember.updateMany({
          where: {
            poolId: id,
            OR: [
              { userId: borrowerId },
              { userIdentifier: borrowerName },
              { userIdentifier: borrowerId },
              { userIdentifier: `@${borrowerName.replace(/^@/, '')}` },
              { userIdentifier: borrowerName.replace(/^@/, '') },
            ],
          },
          data: { reputationPoints: { increment: pointsEarned } },
        });

        // 2. Increment user's global reputationPoints on User table
        await this.prisma.user.updateMany({
          where: {
            OR: [
              { id: borrowerId },
              { username: borrowerName.replace(/^@/, '') },
            ],
          },
          data: { reputationPoints: { increment: pointsEarned } },
        });

        // 3. Log RewardPoint entry for audit and leaderboards
        await this.prisma.rewardPoint.create({
          data: {
            userId: borrowerId,
            points: pointsEarned,
            reason: `POOL_LOAN_REPAID_ON_TIME_${pool.name.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`,
            txHash: txHash || null,
          },
        }).catch((err) => this.logger.warn(`Failed to create reward point log: ${err.message}`));
      }
      persisted = true;
    } catch (e) {
      // Fallback
    }

    if (persisted) {
      const borrowerName = await this.resolveUserDisplayName(borrowerId, id);

      await this.activityService.record({
        userIdentifier: borrowerId,
        action: UserActivityAction.LOAN_REPAID,
        amount,
        token: pool.token,
        metadata: { poolId: id, loanId, isOnTime, reputationPointsEarned: pointsEarned },
      });

      // Unified notification to all pool members about repayment
      for (const member of (pool.members || []).filter((m: any) => m.userId)) {
        this.unifiedNotificationService.notifyUser({
          userId: member.userId,
          type: 'pool_loan_repaid',
          title: isOnTime ? 'Group Loan Repaid (+10 Reputation ⭐) 🏦' : 'Group Loan Repaid 🏦',
          body: `${borrowerName} fully repaid their loan of ${amount} ${pool.token} back to pool '${pool.name}'.${isOnTime ? ' Earned 10 reputation points!' : ''}`,
          amount,
          token: pool.token,
          from: borrowerName,
          link: `${getAppBaseUrl()}/pools/${id}`,
          metadata: { poolId: id, loanId, reputationPointsEarned: pointsEarned, isOnTime },
        }).catch(err => this.logger.warn(`Failed to send unified notification: ${err.message}`));
      }

      // Check and award badges for borrower (reputation points earned)
      if (isOnTime && this.badgesService) {
        this.badgesService.checkAndAwardBadges(borrowerId).catch(err =>
          this.logger.warn(`Failed to check badges for borrower: ${err.message}`)
        );
      }
    }

    return { success: true, status: 'REPAID', repaidAmount: amount, isOnTime, pointsEarned, txHash };
  }

  /**
   * Whether `callerId` may see `userIdentifier`'s reputation.
   *
   * True for the caller themselves, or when both belong to at least one pool.
   * Anything else is treated as "no such user" so the endpoint cannot be used
   * to probe which identifiers exist.
   *
   * @see docs/security-remaining-issues.md — BE-M-02
   */
  /**
   * Whether the target user shares any pool with the caller.
   *
   * @dev Query path is uniform in complexity and query count to eliminate
   *      timing side-channel enumeration of unregistered vs non-shared emails/handles.
   *
   * @see docs/security-remaining-issues.md — BE-M-02
   */
  async sharesPoolWith(callerId: string, userIdentifier: string): Promise<boolean> {
    const clean = userIdentifier.startsWith('@') ? userIdentifier.slice(1) : userIdentifier;

    const [shared, self] = await Promise.all([
      this.prisma.poolMember.findFirst({
        where: {
          OR: [
            { userIdentifier: userIdentifier },
            { userIdentifier: clean },
            { userIdentifier: `@${clean}` },
            {
              user: {
                OR: [
                  { id: clean },
                  { username: { equals: clean, mode: 'insensitive' } },
                  { email: { equals: clean, mode: 'insensitive' } },
                  { smartWallet: { address: { equals: clean.toLowerCase(), mode: 'insensitive' } } },
                ],
              },
            },
          ],
          pool: {
            members: { some: { OR: [{ userId: callerId }, { userIdentifier: callerId }] } },
          },
        },
        select: { id: true },
      }),
      this.prisma.user.findFirst({
        where: {
          id: callerId,
          OR: [
            { id: clean },
            { username: { equals: clean, mode: 'insensitive' } },
            { email: { equals: clean, mode: 'insensitive' } },
            { smartWallet: { address: { equals: clean.toLowerCase(), mode: 'insensitive' } } },
          ],
        },
        select: { id: true },
      }),
    ]);

    return Boolean(shared || self);
  }

  async getUserReputation(userIdentifier: string) {
    try {
      const clean = userIdentifier.startsWith('@') ? userIdentifier.slice(1) : userIdentifier;
      const user = await this.prisma.user.findFirst({
        where: {
          OR: [
            { id: userIdentifier },
            { username: { equals: clean, mode: 'insensitive' } },
            { email: userIdentifier },
            { smartWallet: { address: { equals: userIdentifier, mode: 'insensitive' } } },
          ],
        },
        select: { id: true, reputationPoints: true },
      });

      const memberShares = await this.prisma.poolMember.aggregate({
        where: {
          OR: [
            { userIdentifier },
            { userIdentifier: `@${clean}` },
            { userIdentifier: clean },
            ...(user ? [{ userId: user.id }] : []),
          ],
        },
        _sum: { reputationPoints: true },
      });

      const totalRep = (user?.reputationPoints || 0) + (memberShares._sum.reputationPoints || 0);
      return { userIdentifier, reputationPoints: totalRep > 0 ? totalRep : (user?.reputationPoints ?? 10) };
    } catch (e) {
      return { userIdentifier, reputationPoints: 10 };
    }
  }

  /**
   * Writes off a defaulted loan by vote of the pool's other members.
   *
   * A defaulted loan otherwise has no terminal state: it never becomes REPAID,
   * so the borrower is blocked from that pool forever with no way back and the
   * pool's books never close. The alternative to this is an admin backdoor,
   * which is worse — the money belonged to these members, so the decision to
   * forgive it is theirs.
   *
   * Deliberately not a refund: the balance is not restored, because it was
   * genuinely lost. This only records that the group has stopped pursuing it.
   */
  async writeOffLoan(id: string, loanId: string, voterId: string) {
    const pool = await this.findOne(id);
    const loan = (pool.loans || []).find((l: any) => l.id === loanId);
    if (!loan) throw new NotFoundException('Loan not found');

    if (loan.status !== LoanStatus.DEFAULTED) {
      throw new BadRequestException('Only a defaulted loan can be written off.');
    }
    if (loan.borrowerId === voterId) {
      throw new ForbiddenException('The borrower cannot vote to write off their own debt.');
    }

    const isMember = (pool.members || []).some((m: any) => m.userId === voterId);
    if (!isMember) {
      throw new ForbiddenException('Only members of this pool can vote to write off a loan.');
    }

    // Same threshold as approving the loan in the first place: forgiving a debt
    // should be no easier than granting it.
    const eligible = (pool.members || []).filter((m: any) => m.userId && m.userId !== loan.borrowerId);
    const threshold = Math.floor(Math.max(1, eligible.length) / 2) + 1;

    try {
      await this.prisma.loanVote.create({
        data: { loanId, voterId, approve: true },
      });
    } catch (err: any) {
      if (err?.code === 'P2002') {
        throw new BadRequestException('You have already voted on this loan.');
      }
      throw err;
    }

    const writeOffVotes = await this.prisma.loanVote.count({ where: { loanId, approve: true } });
    if (writeOffVotes < threshold) {
      return { success: true, status: LoanStatus.DEFAULTED, writeOffVotes, threshold, writtenOff: false };
    }

    const closed = await this.prisma.loanApplication.updateMany({
      where: { id: loanId, status: LoanStatus.DEFAULTED },
      data: { status: LoanStatus.REPAID },
    });
    if (closed.count !== 1) {
      return { success: true, status: LoanStatus.DEFAULTED, writeOffVotes, threshold, writtenOff: false };
    }

    this.logger.warn(
      `[Pools] Loan ${loanId} written off by member vote (${writeOffVotes}/${threshold}) in pool '${pool.name}'.`,
    );

    await this.unifiedNotificationService
      .notifyUser({
        userId: loan.borrowerId,
        type: 'pool_loan_repaid',
        title: 'Loan Written Off',
        body: `Members of '${pool.name}' voted to write off your defaulted loan of ${loan.amount} ${pool.token}. You can request from this pool again.`,
        amount: loan.amount,
        token: pool.token,
        link: `${getAppBaseUrl()}/pools/${id}`,
        metadata: { poolId: id, loanId, writtenOff: true },
      })
      .catch((err) => this.logger.warn(`Write-off notification failed: ${err.message}`));

    return { success: true, status: LoanStatus.REPAID, writeOffVotes, threshold, writtenOff: true };
  }

  async requestExtension(id: string, loanId: string, borrowerId: string, additionalDays: number) {
    const pool = await this.findOne(id);
    const loan = (pool.loans || []).find((l: any) => l.id === loanId);
    if (!loan) throw new NotFoundException('Loan not found');

    if (loan.borrowerId !== borrowerId) {
      throw new ForbiddenException('Only the borrower can request an extension on this loan');
    }

    // Extensions are exempt from the one-loan-at-a-time rule, because asking
    // for more time is not new debt. That exemption needs its own bound:
    // unlimited extensions let a loan that is never repaid stay permanently
    // current, so the pool's money is gone without a default ever being
    // recorded.
    const priorExtensions = await this.prisma.loanApplication.count({
      where: { poolId: id, targetLoanId: loanId, isExtension: true },
    });
    if (priorExtensions >= PoolsService.MAX_EXTENSIONS_PER_LOAN) {
      throw new BadRequestException(
        `This loan has already been extended ${priorExtensions} times. Repay it to borrow again.`,
      );
    }

    let extensionLoan: any;
    try {
      extensionLoan = await this.prisma.loanApplication.create({
        data: {
          poolId: id,
          borrowerId,
          amount: 0,
          purpose: `One-time extension of ${additionalDays} days for loan #${loanId}`,
          durationDays: additionalDays,
          status: LoanStatus.PENDING,
          isExtension: true,
          targetLoanId: loanId,
          approveVotes: 0,
          rejectVotes: 0,
        },
      });
    } catch (e) {
      extensionLoan = {
        id: `ext-${Date.now()}`,
        poolId: id,
        borrowerId,
        amount: 0,
        durationDays: additionalDays,
        status: 'PENDING',
        isExtension: true,
        targetLoanId: loanId,
        approveVotes: 0,
        rejectVotes: 0,
      };
    }

    return { success: true, extensionRequest: extensionLoan };
  }

  async withdraw(id: string, memberId: string, amount: number) {
    if (!amount || amount <= 0) throw new BadRequestException('Withdraw amount must be > 0');
    const pool = await this.findOne(id);

    if (amount > pool.poolBalance) {
      throw new BadRequestException(`Withdrawal amount ($${amount}) exceeds available pool balance ($${pool.poolBalance})`);
    }

    // Move the tokens, then record it.
    //
    // This method used to decrement two database columns and nothing else: the
    // member's balance went down and no tokens ever left the contract. Anyone
    // who "withdrew" simply lost the claim. `withdraw` burns the member's
    // shares at the current price and transfers, so it is also the only
    // function that can get funds out of a pool at all.
    const txHash = await this.withdrawOnChain(id, memberId, pool, amount);

    let persisted = false;
    try {
      await this.prisma.groupPool.update({
        where: { id },
        data: { poolBalance: { decrement: amount } },
      });
      await this.prisma.poolMember.updateMany({
        // Keyed on `userId`; `userIdentifier` holds a handle, so matching a
        // uuid against it silently updated nothing.
        where: { poolId: id, userId: memberId },
        data: { depositedAmount: { decrement: amount } },
      });
      persisted = true;
    } catch (e) {
      // Fallback
    }

    if (persisted) {
      await this.activityService.record({
        userIdentifier: memberId,
        action: UserActivityAction.POOL_WITHDRAW,
        amount,
        token: pool.token,
        txHash,
        metadata: { poolId: id },
      });
    }

    return { success: true, withdrawnAmount: amount, txHash };
  }

  /**
   * Withdraws a member's share from `GroupLendingPool` to their vault.
   *
   * @dev The contract caps this at the member's pro-rata share of liquidity,
   *      not at their deposit — a lender whose pool earned fees may take more
   *      than they put in, and one whose pool has loans outstanding may take
   *      less. Its revert is the authority; the balance check upstream is only
   *      there to give a friendlier message in the common case.
   */
  private async withdrawOnChain(
    poolDbId: string,
    memberId: string,
    pool: any,
    amount: number,
  ): Promise<string> {
    const { ethers } = await import('ethers');
    const { resolveToken } = await import('../config/tokens.config');

    if (pool.onChainPoolId === null || pool.onChainPoolId === undefined) {
      throw new BadRequestException(
        'This pool predates on-chain custody. Its balance is not held in a contract and cannot be withdrawn.',
      );
    }

    const poolContractAddress =
      process.env.POOL_CONTRACT_ADDRESS || process.env.GROUP_LENDING_POOL_ADDRESS;
    if (!poolContractAddress) throw new BadRequestException('Pool contract is not configured.');

    const tokenInfo = resolveToken(pool.token);
    if (!tokenInfo) throw new BadRequestException(`Unsupported token: ${pool.token}`);

    const member = await this.prisma.user.findUnique({
      where: { id: memberId },
      include: {
        smartWallet: true,
        sessionKeys: {
          where: { revokedAt: null, expiryAt: { gt: new Date() }, activatedAt: { not: null } },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!member?.smartWallet) throw new BadRequestException('Complete wallet setup to withdraw.');
    if (!member.sessionKeys?.length) {
      const err: any = new BadRequestException(
        'No active session key. Authorize one with your passkey to withdraw.',
      );
      err.code = 'SESSION_KEY_REQUIRED';
      err.requirePasskey = true;
      throw err;
    }

    const poolInterface = new ethers.Interface([
      'function withdraw(uint256 poolId, uint256 amount) external',
    ]);
    const receipt = await this.executeVaultCall(
      memberId,
      member.smartWallet.address,
      member.sessionKeys[0],
      poolContractAddress,
      poolInterface.encodeFunctionData('withdraw', [
        pool.onChainPoolId,
        ethers.parseUnits(amount.toString(), tokenInfo.decimals || 6),
      ]),
      amount,
    );

    this.logger.log(`[Pools] Withdrew ${amount} ${pool.token} from pool #${pool.onChainPoolId}: ${receipt.hash}`);
    return receipt.hash;
  }

  /**
   * Winds a pool down and returns every member's balance to their wallet.
   *
   * ## Who
   *
   * The creator only. They are spending other people's money, so the real
   * protection is not who presses the button but that the amounts are computed
   * rather than chosen — each member receives their own pro-rata share, read
   * from the contract, and the caller cannot influence it.
   *
   * ## When
   *
   * Only with a settled book: no request awaiting votes, none approved and
   * unfunded, no principal outstanding, and nothing defaulted. Closing over a
   * live loan would either strand the debt or force early repayment on terms
   * the borrower was never given.
   *
   * A defaulted loan must be written off first. That is a deliberate detour,
   * not an oversight: `GroupLendingPool` spreads a loss across shareholders by
   * lowering the price per share, and `declareDefault` does not touch the
   * borrower's shares — so a defaulter still draws a proportional payout. The
   * netting rule we wanted (a borrower's claim reduced by what they owe) cannot
   * be expressed against this contract, and pretending otherwise in the
   * backend would produce numbers the chain refuses. Requiring a write-off puts
   * the decision where it belongs: the members vote to absorb the loss, and the
   * payout is honest pro-rata afterwards.
   *
   * ## How
   *
   * Each member's own vault calls `withdraw`, because the contract is
   * `onlyMember` and a creator cannot withdraw on anyone's behalf. A member
   * without an active session key is skipped and reported rather than silently
   * losing their balance — their funds stay in the contract, withdrawable by
   * them at any time.
   */
  /**
   * Simple interest accrued on a loan so far.
   *
   * @dev Accrues on days actually elapsed, not the agreed term, so repaying
   *      early costs less — the borrower is charged for the time they held the
   *      money rather than the time they asked for. Capped at the full term so
   *      an overdue loan does not compound indefinitely; lateness is priced
   *      separately by the contract's late fee, and charging twice for it would
   *      be a penalty wearing an interest label.
   *
   *      Simple, not compounding: this is a group of friends lending to each
   *      other, and a figure someone can check by hand is worth more here than
   *      one that is marginally more precise.
   */
  static accruedInterest(params: {
    principal: number;
    interestRateBps: number;
    durationDays: number;
    disbursedAt?: Date | null;
    now?: Date;
  }): number {
    const { principal, interestRateBps, durationDays } = params;
    if (!principal || !interestRateBps || interestRateBps <= 0) return 0;

    const now = params.now ?? new Date();
    const elapsedDays = params.disbursedAt
      ? Math.max(0, (now.getTime() - params.disbursedAt.getTime()) / 86_400_000)
      : durationDays;

    const chargeableDays = Math.min(elapsedDays, durationDays);
    const interest = (principal * (interestRateBps / 10_000) * chargeableDays) / 365;

    // Two decimals: the tokens are 6-decimal stablecoins, and a repayment
    // quoted to the cent is one a borrower can reconcile against their wallet.
    return Math.round(interest * 100) / 100;
  }

  /** What a borrower owes right now: principal plus interest accrued. */
  loanRepaymentBreakdown(pool: any, loan: any, now = new Date()) {
    const interest = PoolsService.accruedInterest({
      principal: loan.amount,
      interestRateBps: pool.interestRateBps ?? 0,
      durationDays: loan.durationDays,
      disbursedAt: loan.disbursedAt ?? loan.updatedAt ?? null,
      now,
    });

    return {
      principal: loan.amount,
      interest,
      total: Math.round((loan.amount + interest) * 100) / 100,
      interestRateBps: pool.interestRateBps ?? 0,
    };
  }

  /**
   * Outstanding principal for each disbursed loan, keyed by database id.
   *
   * @dev Loans can be repaid in instalments, and the contract is the only place
   *      that knows how much of one is left — a payment made from anywhere
   *      other than this backend would never reach a mirrored column. Failure
   *      is silent and returns an empty map, so the caller falls back to the
   *      full principal rather than showing nothing.
   */
  private async readOutstandingPrincipals(pool: any): Promise<Map<string, number>> {
    const result = new Map<string, number>();

    const live = (pool.loans || []).filter(
      (l: any) => l.status === LoanStatus.EXECUTED && l.onChainLoanId !== null && l.onChainLoanId !== undefined,
    );
    if (live.length === 0 || pool.onChainPoolId === null || pool.onChainPoolId === undefined) {
      return result;
    }

    const poolContractAddress =
      process.env.POOL_CONTRACT_ADDRESS || process.env.GROUP_LENDING_POOL_ADDRESS;
    if (!poolContractAddress) return result;

    try {
      const { ethers } = await import('ethers');
      const { resolveToken } = await import('../config/tokens.config');
      const decimals = resolveToken(pool.token)?.decimals || 6;

      const provider = createBotChainProvider();
      await Promise.all(
        live.map(async (loan: any) => {
          const onChain = await this.readLoanOnChain(
            provider,
            poolContractAddress,
            pool.onChainPoolId,
            loan.onChainLoanId,
          );
          if (!onChain) return;
          const outstanding = onChain.principal - onChain.amountRepaid;
          result.set(loan.id, Number(ethers.formatUnits(outstanding, decimals)));
        }),
      );
    } catch (err: any) {
      this.logger.warn(`Could not read outstanding principals: ${err.message}`);
    }

    return result;
  }

  /**
   * Reads a loan from whichever `GroupLendingPool` is deployed.
   *
   * @dev The `Loan` struct gained `amountRepaid` and `lateFeeCharged` when
   *      repayment became instalment-based, so the public getter returns 11
   *      words on a current deployment and 9 on an older one. Decoding 11
   *      against 9 throws outright; decoding 9 against 11 is safe, because
   *      every field is a single static word and the first nine are unchanged.
   *
   *      So the legacy shape is the one that is always attempted, and the two
   *      newer fields are read separately. That lets local development run
   *      against the contract already deployed while testnet and mainnet get
   *      the newer one, without a build flag deciding which is true — the chain
   *      is asked.
   *
   *      Support is cached per contract address: it is a property of the
   *      bytecode, so it cannot change without a redeploy.
   */
  private static instalmentSupport = new Map<string, boolean>();

  private async readLoanOnChain(
    provider: any,
    poolContractAddress: string,
    onChainPoolId: number,
    onChainLoanId: number,
  ): Promise<{
    principal: bigint;
    repaymentDeadline: number;
    repaid: boolean;
    defaulted: boolean;
    amountRepaid: bigint;
    lateFeeCharged: boolean;
    supportsInstalments: boolean;
  } | null> {
    const { ethers } = await import('ethers');

    const legacy = new ethers.Contract(
      poolContractAddress,
      [
        'function poolLoans(uint256, uint256) view returns (uint256 id, uint256 poolId, address borrower, uint256 principal, uint256 originalDeadline, uint256 repaymentDeadline, bool repaid, bool defaulted, uint256 extensionCount)',
      ],
      provider,
    );

    let loan: any;
    try {
      loan = await legacy.poolLoans(onChainPoolId, onChainLoanId);
    } catch (err: any) {
      this.logger.warn(`Could not read loan ${onChainLoanId}: ${err.message}`);
      return null;
    }

    const key = poolContractAddress.toLowerCase();
    let supports = PoolsService.instalmentSupport.get(key);

    let amountRepaid = 0n;
    let lateFeeCharged = false;

    if (supports !== false) {
      try {
        const extended = new ethers.Contract(
          poolContractAddress,
          [
            'function poolLoans(uint256, uint256) view returns (uint256 id, uint256 poolId, address borrower, uint256 principal, uint256 originalDeadline, uint256 repaymentDeadline, bool repaid, bool defaulted, uint256 extensionCount, uint256 amountRepaid, bool lateFeeCharged)',
          ],
          provider,
        );
        const full = await extended.poolLoans(onChainPoolId, onChainLoanId);
        amountRepaid = BigInt(full.amountRepaid);
        lateFeeCharged = Boolean(full.lateFeeCharged);
        supports = true;
      } catch {
        // An older deployment. Instalments are unavailable there, and a loan
        // is either outstanding in full or settled.
        supports = false;
      }
      PoolsService.instalmentSupport.set(key, supports);
    }

    return {
      principal: BigInt(loan.principal),
      repaymentDeadline: Number(loan.repaymentDeadline),
      repaid: Boolean(loan.repaid),
      defaulted: Boolean(loan.defaulted),
      amountRepaid,
      lateFeeCharged,
      supportsInstalments: supports === true,
    };
  }

  /** Whether the deployed pool contract accepts instalments. */
  async supportsInstalments(): Promise<boolean> {
    const poolContractAddress =
      process.env.POOL_CONTRACT_ADDRESS || process.env.GROUP_LENDING_POOL_ADDRESS;
    if (!poolContractAddress) return false;
    return PoolsService.instalmentSupport.get(poolContractAddress.toLowerCase()) === true;
  }

  async closePool(id: string, callerId: string) {
    const { ethers } = await import('ethers');

    const pool = await this.findOne(id);

    if (pool.creatorId !== callerId) {
      throw new ForbiddenException('Only the pool creator can close this pool.');
    }
    if (pool.closedAt) {
      throw new BadRequestException('This pool is already closed.');
    }
    if (pool.onChainPoolId === null || pool.onChainPoolId === undefined) {
      throw new BadRequestException(
        'This pool predates on-chain custody. It holds no recoverable balance to return.',
      );
    }

    const unsettled = (pool.loans || []).filter((l: any) =>
      [LoanStatus.PENDING, LoanStatus.APPROVED, LoanStatus.EXECUTED, LoanStatus.DEFAULTED].includes(
        l.status,
      ),
    );
    if (unsettled.length > 0) {
      const defaulted = unsettled.filter((l: any) => l.status === LoanStatus.DEFAULTED);
      throw new BadRequestException(
        defaulted.length > 0
          ? `${defaulted.length} loan(s) have defaulted. Members must vote to write them off before ` +
            `the pool can be closed — closing now would pay the defaulter a full share of what is left.`
          : `${unsettled.length} loan(s) are still open. Settle them before closing the pool.`,
      );
    }

    const poolContractAddress =
      process.env.POOL_CONTRACT_ADDRESS || process.env.GROUP_LENDING_POOL_ADDRESS;
    if (!poolContractAddress) throw new BadRequestException('Pool contract is not configured.');

    const { resolveToken } = await import('../config/tokens.config');
    const tokenInfo = resolveToken(pool.token);
    const decimals = tokenInfo?.decimals || 6;

    const provider = createBotChainProvider();
    const view = new ethers.Contract(
      poolContractAddress,
      ['function getWithdrawableAmount(uint256, address) view returns (uint256)'],
      provider,
    );
    const poolInterface = new ethers.Interface([
      'function withdraw(uint256 poolId, uint256 amount) external',
    ]);

    const refunded: Array<{ member: string; amount: number; txHash: string }> = [];
    const skipped: Array<{ member: string; reason: string }> = [];

    for (const member of pool.members || []) {
      const label = member.userIdentifier || member.userId;
      if (!member.userId) {
        skipped.push({ member: label, reason: 'no linked account' });
        continue;
      }

      const account = await this.prisma.user.findUnique({
        where: { id: member.userId },
        include: {
          smartWallet: true,
          sessionKeys: {
            where: { revokedAt: null, expiryAt: { gt: new Date() }, activatedAt: { not: null } },
            orderBy: { createdAt: 'desc' },
          },
        },
      });

      if (!account?.smartWallet) {
        skipped.push({ member: label, reason: 'no wallet' });
        continue;
      }

      // The contract's own figure, never a locally computed one. Shares move
      // with every deposit, repayment and write-off, so anything derived here
      // would be a guess the contract is free to refuse.
      const withdrawableWei: bigint = await view.getWithdrawableAmount(
        pool.onChainPoolId,
        account.smartWallet.address,
      );
      if (withdrawableWei === 0n) continue;

      if (!account.sessionKeys?.length) {
        skipped.push({
          member: label,
          reason: 'no active session key — their balance stays in the pool, withdrawable by them',
        });
        continue;
      }

      const amount = Number(ethers.formatUnits(withdrawableWei, decimals));
      try {
        const receipt = await this.executeVaultCall(
          member.userId,
          account.smartWallet.address,
          account.sessionKeys[0],
          poolContractAddress,
          poolInterface.encodeFunctionData('withdraw', [pool.onChainPoolId, withdrawableWei]),
          amount,
        );
        refunded.push({ member: label, amount, txHash: receipt.hash });

        await this.activityService
          .record({
            userIdentifier: member.userId,
            action: UserActivityAction.POOL_WITHDRAW,
            amount,
            token: pool.token,
            txHash: receipt.hash,
            metadata: { poolId: id, reason: 'pool_closed' },
          })
          .catch(() => undefined);
      } catch (err: any) {
        skipped.push({ member: label, reason: err?.message || 'withdrawal failed' });
      }
    }

    // Closed only when nothing was left behind. A partial wind-down that
    // recorded itself as finished would hide balances the pool still owes.
    const fullyReturned = skipped.length === 0;
    if (fullyReturned) {
      await this.prisma.groupPool.update({
        where: { id },
        data: { closedAt: new Date(), poolBalance: 0 },
      });
    }

    for (const member of (pool.members || []).filter((m: any) => m.userId)) {
      this.unifiedNotificationService
        .notifyUser({
          userId: member.userId,
          type: 'pool_loan_repaid',
          title: fullyReturned ? 'Pool Closed' : 'Pool Wind-Down Started',
          body: fullyReturned
            ? `'${pool.name}' was closed and your balance was returned to your wallet.`
            : `'${pool.name}' is being closed. Some balances could not be returned automatically — ` +
              `open the pool to withdraw yours.`,
          token: pool.token,
          link: `${getAppBaseUrl()}/pools/${id}`,
          metadata: { poolId: id, closed: fullyReturned },
        })
        .catch(() => undefined);
    }

    this.logger.warn(
      `[Pools] Close requested for '${pool.name}' by ${callerId}: ` +
      `${refunded.length} refunded, ${skipped.length} skipped.`,
    );

    return { success: true, closed: fullyReturned, refunded, skipped };
  }

  async inviteMembers(poolId: string, inviterId: string, memberIdentifiers: string[]) {
    if (!memberIdentifiers || memberIdentifiers.length === 0) {
      throw new BadRequestException('Member list cannot be empty');
    }

    const pool = await this.findOne(poolId);

    // Verify inviter is the pool creator
    if (pool.creatorId !== inviterId) {
      throw new BadRequestException('Only the pool creator can invite members');
    }

    const inviteLink = `${getAppBaseUrl()}/pools/${poolId}?join=1`;
    const invitedCount = memberIdentifiers.length;

    // Get inviter name for notifications
    const inviter = await this.prisma.user.findUnique({
      where: { id: inviterId },
      select: { username: true },
    });
    const inviterName = inviter?.username || 'Someone';

    // Add members and send notifications
    const addedMembers: string[] = [];
    for (const identifier of memberIdentifiers) {
      const resolvedUserId = await this.resolveMemberToUserId(identifier);
      // Check if already a member
      const existing = await this.prisma.poolMember.findFirst({
        where: {
          poolId,
          OR: [
            { userIdentifier: identifier },
            ...(resolvedUserId ? [{ userId: resolvedUserId }] : []),
          ],
        },
      });

      if (!existing) {
        // Add as pending member
        await this.prisma.poolMember.create({
          data: {
            poolId,
            userId: resolvedUserId || undefined,
            userIdentifier: identifier,
            depositedAmount: 0,
          },
        });
        addedMembers.push(identifier);

        // Resolve to user and notify
        if (resolvedUserId) {
          this.unifiedNotificationService.notifyUser({
            userId: resolvedUserId,
            type: 'pool_invitation',
            title: '👥 Pool Invitation!',
            body: `${inviterName} invited you to join the "${pool.name}" pool.`,
            link: inviteLink,
            metadata: {
              poolId: pool.id,
              poolName: pool.name,
              inviter: inviterName,
            },
          }).catch(() => {});
        }
      }
    }

    return {
      success: true,
      poolId,
      invitedCount: addedMembers.length,
      inviteLink,
    };
  }

  async joinPool(poolId: string, userId: string) {
    const pool = await this.findOne(poolId);

    // Check if user is already a member
    const existing = await this.prisma.poolMember.findFirst({
      where: { poolId, userId },
    });

    if (existing) {
      return {
        success: true,
        message: 'Already a member of this pool',
        poolId,
      };
    }

    // Get user identifier
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { username: true, email: true },
    });

    const userIdentifier = user?.username || user?.email || userId;

    // Register on-chain before recording locally.
    //
    // A member the contract does not know cannot deposit, vote or withdraw —
    // `onlyMember` rejects them — so a database-only membership is a promise
    // the system cannot keep. The contract accepts additions only while the
    // pool is unfunded, which is deliberate: `memberCount` sets the vote
    // threshold, and letting it change under a pool holding other people's
    // money would let the creator add addresses they control and approve their
    // own loan. Once anyone has deposited, joining is closed.
    await this.addMemberOnChain(pool, userId);

    // Add as member
    await this.prisma.poolMember.create({
      data: {
        poolId,
        userId,
        userIdentifier,
        depositedAmount: 0,
      },
    });

    // Log activity
    await this.activityService.record({
      userIdentifier: userId,
      action: UserActivityAction.POOL_DEPOSIT,
      metadata: {
        poolId,
        poolName: pool.name,
        action: 'pool_joined',
      },
    }).catch(() => {});

    return {
      success: true,
      message: `Successfully joined ${pool.name}`,
      poolId,
      inviteLink: `${getAppBaseUrl()}/pools/${poolId}?join=1`,
    };
  }

  /**
   * Fetch all loans across all pools where the given user is the borrower
   */
  async findLoansForUser(userId: string) {
    const cleanId = userId.startsWith('@') ? userId.slice(1) : userId;
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { id: userId },
          { username: { equals: cleanId, mode: 'insensitive' } },
        ],
      },
      select: { id: true, username: true },
    });

    const targetIds = [userId];
    if (user?.id) targetIds.push(user.id);
    if (user?.username) targetIds.push(user.username, `@${user.username}`);

    try {
      const loans = await this.prisma.loanApplication.findMany({
        where: {
          borrowerId: { in: targetIds },
        },
        include: {
          pool: {
            select: {
              id: true,
              name: true,
              token: true,
              poolBalance: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      return loans;
    } catch (e: any) {
      this.logger.warn(`findLoansForUser failed: ${e.message}`);
      return [];
    }
  }

  /**
   * Automated cron to check active loans and send repayment reminders before deadlines
   */
  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async handleLoanRepaymentReminders() {
    this.logger.log('[PoolsCron] Running automated loan repayment reminder check...');
    try {
      const activeLoans = await this.prisma.loanApplication.findMany({
        where: {
          status: LoanStatus.EXECUTED,
          repaymentDeadline: { not: null },
        },
        include: {
          pool: {
            select: { id: true, name: true, token: true },
          },
        },
      });

      const now = new Date();
      for (const loan of activeLoans) {
        if (!loan.repaymentDeadline || !loan.pool) continue;

        const deadline = new Date(loan.repaymentDeadline);
        const diffMs = deadline.getTime() - now.getTime();
        const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

        // Mark a genuine default.
        //
        // Nothing in the system ever wrote DEFAULTED, so the admin dashboard's
        // defaulted and overdue counts were structurally zero rather than
        // empty. This is the one place that already knows a loan is past due.
        //
        // The grace period matters: branding someone a defaulter the morning
        // after a missed deadline is wrong when a repayment can be a day late
        // for entirely ordinary reasons. The status is only a label — the
        // borrower was already blocked from new loans while EXECUTED — so it
        // costs nothing to be slow and unfair to no one.
        if (-diffDays >= PoolsService.DEFAULT_GRACE_DAYS) {
          const marked = await this.prisma.loanApplication.updateMany({
            where: { id: loan.id, status: LoanStatus.EXECUTED },
            data: { status: LoanStatus.DEFAULTED },
          });
          if (marked.count === 1) {
            this.logger.warn(
              `[PoolsCron] Loan ${loan.id} marked DEFAULTED (${-diffDays}d overdue, ` +
              `${loan.amount} ${loan.pool.token} in pool '${loan.pool.name}').`,
            );
            await this.activityService
              .record({
                userIdentifier: loan.borrowerId,
                action: UserActivityAction.LOAN_DEFAULTED,
                amount: loan.amount,
                token: loan.pool.token,
                metadata: { poolId: loan.pool.id, loanId: loan.id, daysOverdue: -diffDays },
              })
              .catch(() => undefined);
          }
          continue;
        }

        // Remind if due within 3 days, due today (0), or overdue
        if (diffDays <= 3) {
          // Check if a reminder was logged in the last 20 hours to prevent duplicate daily pings
          let lastReminder: any = null;
          try {
            lastReminder = await this.prisma.notificationLog.findFirst({
              where: {
                userId: loan.borrowerId,
                notificationType: 'pool_loan_due_soon',
                sentAt: { gt: new Date(Date.now() - 20 * 60 * 60 * 1000) },
              },
            });
          } catch (e) {
            // ignore if schema table doesn't match
          }

          if (!lastReminder) {
            const daysText = diffDays < 0
              ? `overdue by ${Math.abs(diffDays)} day(s)`
              : diffDays === 0
                ? 'due today'
                : `due in ${diffDays} day(s)`;

            await this.unifiedNotificationService.notifyUser({
              userId: loan.borrowerId,
              type: 'pool_loan_due_soon' as any,
              title: diffDays < 0 ? '⚠️ Loan Overdue Warning' : '⏳ Loan Repayment Reminder',
              body: `Your loan of ${loan.amount} ${loan.pool.token} from pool '${loan.pool.name}' is ${daysText}. Repay on time to earn +10 Reputation ⭐ points and avoid late penalties.`,
              amount: loan.amount,
              token: loan.pool.token,
              link: `${getAppBaseUrl()}/pools/${loan.pool.id}`,
              metadata: {
                poolId: loan.pool.id,
                poolName: loan.pool.name,
                loanId: loan.id,
                repaymentDeadline: loan.repaymentDeadline,
                diffDays,
              },
            }).catch((err) => this.logger.warn(`Failed to send repayment reminder to ${loan.borrowerId}: ${err.message}`));
          }
        }
      }
    } catch (e: any) {
      this.logger.error(`Failed to run loan repayment reminder cron: ${e.message}`);
    }
  }
}

