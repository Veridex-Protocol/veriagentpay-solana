import { Injectable, BadRequestException, ForbiddenException, Logger, OnModuleInit } from '@nestjs/common';
import { SessionKeyManager, SpendingTracker } from '@veridex/agentic-payments';
import { UserActivityAction } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ethers } from 'ethers';
import * as crypto from 'crypto';
import { ActivityService } from '../activity/activity.service';
import { getSupportedTokens } from '../config/tokens.config';

import { createRelayerSigner } from './relayer-signer.factory';
import { assertRelayerMaySign } from './relayer-policy';
import { describeForLog, extractRevertSelector, toUserMessage } from '../common/user-error.util';
import { encryptSymmetric, decryptSymmetric } from './symmetric-crypto';
import { unwrapDataKey, wrapDataKey } from './key-wrapping';

/**
 * Binds a wrapped data key to the session it belongs to.
 *
 * KMS refuses a decrypt whose encryption context does not match the one used to
 * encrypt, so a ciphertext lifted from one row cannot be unwrapped while
 * pretending to be another's. Legacy rows predate this and carry no binding.
 */
function wrapContext(keyHash?: string): Record<string, string> {
  return keyHash ? { purpose: 'session-key', keyHash } : { purpose: 'session-key' };
}

// Re-exported so existing importers (including the v2 migration script) keep
// resolving them from here. The implementations moved to `symmetric-crypto.ts`
// so that `key-wrapping.ts` can use them without a cycle through this service.
export { encryptSymmetric, decryptSymmetric } from './symmetric-crypto';

import { HotStateService } from '../core/hot-state.service';

import { createBotChainProvider } from '../common/rpc-provider.helper';

@Injectable()
export class RelayerService implements OnModuleInit {
  private readonly logger = new Logger(RelayerService.name);
  private readonly prisma: PrismaService;
  private readonly provider: ethers.FallbackProvider | ethers.JsonRpcProvider;
  private relayerSigner: ethers.Signer;
  private relayerAddress: string;

  private readonly sessionKeyManager = new SessionKeyManager();
  private readonly spendingTracker = new SpendingTracker();

  private readonly sessionRegistryAddress = process.env.SESSION_REGISTRY_ADDRESS || '';

  constructor(
    private readonly activityService?: ActivityService,
    prismaService?: PrismaService,
    private readonly hotStateService?: HotStateService
  ) {
    this.prisma = prismaService || new PrismaService();
    this.provider = createBotChainProvider();
    this.relayerSigner = createRelayerSigner(this.provider);
  }

  async onModuleInit() {
    this.relayerAddress = await this.relayerSigner.getAddress();
    await this.checkRelayerBalance();
  }

  /**
   * Checks the relayer wallet native gas balance and logs a warning if under threshold
   */
  async checkRelayerBalance(): Promise<{ address: string; balanceFormatted: string; isLow: boolean }> {
    const relayerAddress = this.relayerAddress ?? await this.relayerSigner.getAddress();
    try {
      const balance = await this.provider.getBalance(relayerAddress);
      const balanceFormatted = ethers.formatEther(balance);
      const minThreshold = ethers.parseEther('0.05');
      const isLow = balance < minThreshold;
      if (isLow) {
        this.logger.warn(
          `Relayer wallet (${relayerAddress}) gas balance low/unfunded: ${balanceFormatted} native tokens. Sponsoring recipient claim gas requires funding.`
        );
      } else {
        this.logger.log(`Relayer wallet (${relayerAddress}) operational gas balance: ${balanceFormatted} native tokens.`);
      }
      return { address: relayerAddress, balanceFormatted, isLow };
    } catch (e: any) {
      const errString = `${e.message || ''} ${e.code || ''}`.toLowerCase();
      const isUnavailable = errString.includes('timeout') || errString.includes('etimedout') || errString.includes('econnreset') || errString.includes('503') || errString.includes('service temporarily unavailable') || errString.includes('server_error');
      if (isUnavailable) {
        this.logger.warn(
          `RPC endpoint temporarily unavailable when checking relayer balance (${e.message}). Will retry on next transaction.`
        );
      } else {
        this.logger.error(`Failed to check relayer wallet balance: ${e.message}`);
      }
      return { address: relayerAddress, balanceFormatted: '0.0', isLow: true };
    }
  }

  /**
   * Helper to decrypt stored session key private key
   */
  public async decryptSessionKey(sessionRecord: {
    encryptedKey: string;
    encryptedSymmetricKey?: string | null;
    keyHash?: string;
  }): Promise<string> {
    if (!sessionRecord.encryptedSymmetricKey) {
      throw new Error('Session key is missing its wrapped data key; refusing possible plaintext');
    }
    const symKey = await unwrapDataKey(
      sessionRecord.encryptedSymmetricKey,
      wrapContext(sessionRecord.keyHash),
    );
    return decryptSymmetric(sessionRecord.encryptedKey, symKey);
  }

  /**
   * Provisions a session key and registers metadata in database with AES symmetric encryption
   */
  async provisionSessionKey(
    userId: string,
    smartAccountAddress: string,
    durationSeconds: number,
    maxValueLimit: bigint,
    perTxLimitUSD: number = 50.0,
    dailyLimitUSD: number = 200.0
  ) {
    const sessionWallet = ethers.Wallet.createRandom();
    const sessionKeyPair = {
      address: sessionWallet.address,
      privateKey: sessionWallet.privateKey,
    };

    const sessionKeyHash = ethers.keccak256(ethers.solidityPacked(['address'], [sessionKeyPair.address]));
    const expiryAt = new Date(Date.now() + durationSeconds * 1000);

    // Generate random symmetric key and encrypt session private key
    const randomSymKey = crypto.randomBytes(32).toString('hex');
    const encryptedKey = encryptSymmetric(sessionKeyPair.privateKey, randomSymKey);
    // Wrapped by KMS where configured, so the wrapping key never enters this
    // process and every later unwrap is an auditable, rate-limitable API call.
    const encryptedSymmetricKey = await wrapDataKey(randomSymKey, wrapContext(sessionKeyHash));

    const sessionRecord = await this.prisma.sessionKey.create({
      data: {
        userId,
        keyHash: sessionKeyHash,
        encryptedKey,
        encryptedSymmetricKey,
        credentialId: `cred_${Date.now()}`,
        dailyLimitUSD,
        perTxLimitUSD,
        expiryAt,
      }
    });

    await this.hotStateService?.setSessionKey({
      id: sessionRecord.id,
      userId,
      keyHash: sessionKeyHash,
      encryptedKey,
      encryptedSymmetricKey,
      perTxLimitUSD,
      dailyLimitUSD,
      expiryAt,
    });

    await this.prisma.auditEvent.create({
      data: {
        userId,
        action: 'SESSION_KEY_CREATED',
        details: { keyHash: sessionKeyHash, expiryAt, dailyLimitUSD, perTxLimitUSD },
        status: 'SUCCESS',
      }
    });

    const sessionRegistryAbi = ['function registerSession(bytes32 sessionKeyHash, uint64 expiry, uint256 maxValue)'];
    const sessionRegistryInterface = new ethers.Interface(sessionRegistryAbi);
    const registerCalldata = sessionRegistryInterface.encodeFunctionData('registerSession', [
      sessionKeyHash,
      Math.floor(expiryAt.getTime() / 1000),
      maxValueLimit
    ]);

    const moduleAbi = ['function setGlobalLimit(address vault, uint256 dailyLimit)'];
    const moduleInterface = new ethers.Interface(moduleAbi);
    const setGlobalLimitCalldata = moduleInterface.encodeFunctionData('setGlobalLimit', [
      smartAccountAddress,
      ethers.parseUnits(String(dailyLimitUSD), 6),
    ]);

    // The private key is deliberately absent. It is already stored encrypted
    // and is decrypted server-side on demand via `decryptSessionKey`; returning
    // it put raw key material into an HTTP response body, where every
    // TLS-terminating proxy, CDN, APM agent and browser devtools capture along
    // the way would hold a spendable key. Nothing consumed it.
    //
    // @see docs/security-remediation-plan.md — BE-C-02
    return {
      sessionKeyId: sessionRecord.id,
      sessionKeyHash,
      expiryAt,
      maxValue: maxValueLimit.toString(),
      sessionPublicKey: sessionKeyPair.address,
      registerCalldata,
      setGlobalLimitCalldata,
    };
  }

  /**
   * Instantly revokes an active session key in database and triggers on-chain revocation
   */
  async revokeSessionKey(userId: string, sessionKeyHash: string) {
    const sessionRecord = await this.prisma.sessionKey.findUnique({
      where: { keyHash: sessionKeyHash }
    });

    if (!sessionRecord || sessionRecord.userId !== userId) {
      throw new BadRequestException('Session key not found or unauthorized');
    }

    await this.prisma.sessionKey.update({
      where: { keyHash: sessionKeyHash },
      data: { revokedAt: new Date() }
    });

    await this.hotStateService?.revokeSessionKey(sessionKeyHash);

    await this.logAuditEvent(userId, 'SESSION_KEY_REVOKED', { sessionKeyHash }, 'SUCCESS');
    return { success: true, revokedAt: new Date() };
  }

  /**
   * Executes a high-performance fast-path session action (<10ms policy check using HotStateService)
   */
  async executeLocalSessionAction(
    userId: string,
    vaultAddress: string,
    sessionPrivateKey: string,
    actionPayload: string,
    txAmountUSD: number,
    nonce: number,
    options?: { skipBiometricCheck?: boolean; inbound?: boolean }
  ) {
    // CRITICAL: Check if user requires biometrics for all transactions
    if (!options?.skipBiometricCheck) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { requireBiometricsAlways: true }
      });

      if (user?.requireBiometricsAlways) {
        // Allow if passkey was verified within the last 2 minutes
        const recentPasskeyAuth = await this.prisma.passkeyCredential.findFirst({
          where: {
            userId,
            revokedAt: null,
            lastUsedAt: { gte: new Date(Date.now() - 120_000) },
          },
          select: { id: true },
        });

        if (!recentPasskeyAuth) {
          await this.logAuditEvent(userId, 'SESSION_BYPASSED_BIOMETRICS_REQUIRED', { txAmountUSD }, 'BLOCKED');
          const error = new ForbiddenException('Biometric authentication required by user security settings');
          (error as any).code = 'SESSION_BYPASSED_BIOMETRICS_REQUIRED';
          (error as any).requirePasskey = true;
          throw error;
        }
      }
    }

    const sessionWallet = new ethers.Wallet(sessionPrivateKey);
    const sessionKeyHash = ethers.keccak256(ethers.solidityPacked(['address'], [sessionWallet.address]));
    let sessionKeyId: string | undefined;

    // 2.1 Redis-backed Policy & Spending Check via HotStateService
    if (this.hotStateService) {
      const cachedKey = await this.hotStateService.getSessionKey(sessionKeyHash);
      if (!cachedKey) {
        await this.logAuditEvent(userId, 'POLICY_BLOCKED', { reason: 'SESSION_EXPIRED_OR_REVOKED', sessionKeyHash }, 'BLOCKED');
        const error = new ForbiddenException('Session key is expired, revoked, or invalid');
        (error as any).code = 'SESSION_EXPIRED';
        throw error;
      }

      if (cachedKey.userId && cachedKey.userId !== userId) {
        await this.logAuditEvent(userId, 'POLICY_BLOCKED', { reason: 'SESSION_KEY_USER_MISMATCH', sessionKeyHash }, 'BLOCKED');
        throw new ForbiddenException('Session key does not belong to this user');
      }

      // Spending limits cap what a compromised session key can take out of a
      // vault. An inbound action credits the vault, so there is no loss to cap
      // and the caps must not apply — a $50 per-tx limit was rejecting a $100
      // escrow claim, i.e. blocking the user from receiving their own money.
      // Key validity above is still enforced.
      if (!options?.inbound) {
        const policyVerdict = await this.hotStateService.validateAndRecordSpending(
          sessionKeyHash,
          txAmountUSD,
          cachedKey.perTxLimitUSD,
          cachedKey.dailyLimitUSD
        );

        if (!policyVerdict.allowed) {
          await this.logAuditEvent(userId, 'POLICY_BLOCKED', { reason: policyVerdict.reason, txAmountUSD }, 'BLOCKED');
          throw new ForbiddenException(policyVerdict.reason);
        }
      }
      sessionKeyId = cachedKey.id;
    } else {
      // DB Fallback if HotStateService unavailable
      const sessionRecord = await this.prisma.sessionKey.findUnique({
        where: { keyHash: sessionKeyHash }
      });

      if (!sessionRecord || sessionRecord.revokedAt || sessionRecord.expiryAt < new Date()) {
        await this.logAuditEvent(userId, 'POLICY_BLOCKED', { reason: 'SESSION_EXPIRED_OR_REVOKED', sessionKeyHash }, 'BLOCKED');
        const error = new ForbiddenException('Session key is expired, revoked, or invalid');
        (error as any).code = 'SESSION_EXPIRED';
        throw error;
      }

      if (sessionRecord.userId !== userId) {
        await this.logAuditEvent(userId, 'POLICY_BLOCKED', { reason: 'SESSION_KEY_USER_MISMATCH', sessionKeyHash }, 'BLOCKED');
        throw new ForbiddenException('Session key does not belong to this user');
      }

      // See the HotState branch: spend caps do not apply to inbound actions.
      if (!options?.inbound) {
        if (txAmountUSD > Number(sessionRecord.perTxLimitUSD)) {
          await this.logAuditEvent(userId, 'POLICY_BLOCKED', { reason: 'PER_TX_LIMIT_EXCEEDED', txAmountUSD, limit: sessionRecord.perTxLimitUSD }, 'BLOCKED');
          throw new ForbiddenException(`Transaction amount ($${txAmountUSD}) exceeds single transaction limit ($${sessionRecord.perTxLimitUSD})`);
        }

        const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const recentSpending = await this.prisma.spendingRecord.aggregate({
          where: {
            sessionKeyId: sessionRecord.id,
            timestamp: { gte: last24h }
          },
          _sum: { amountUSD: true }
        });

        const currentDailyTotal = Number(recentSpending._sum.amountUSD || 0);
        if (currentDailyTotal + txAmountUSD > Number(sessionRecord.dailyLimitUSD)) {
          await this.logAuditEvent(userId, 'POLICY_BLOCKED', { reason: 'DAILY_LIMIT_EXCEEDED', currentDailyTotal, txAmountUSD, limit: sessionRecord.dailyLimitUSD }, 'BLOCKED');
          throw new ForbiddenException(`Transaction exceeds daily cumulative limit ($${sessionRecord.dailyLimitUSD})`);
        }
      }
      sessionKeyId = sessionRecord.id;
    }

    // Check vault has funds for the transfer (ERC20 balance check via actionPayload token)
    try {
      const actionType = parseInt(actionPayload.slice(2, 4), 16);
      if (actionType === 1 && actionPayload.length >= 194) {
        // ACTION_TRANSFER: extract token address from payload bytes [1..33]
        const tokenAddr = ethers.getAddress('0x' + actionPayload.slice(28, 68));
        if (tokenAddr !== ethers.ZeroAddress) {
          const erc20 = new ethers.Contract(
            tokenAddr,
            ['function balanceOf(address) view returns (uint256)'],
            this.provider
          );
          const tokenBalance = await erc20.balanceOf(vaultAddress);
          // Extract amount from payload bytes [65..97]
          const transferAmount = BigInt('0x' + actionPayload.slice(132, 196));
          if (tokenBalance < transferAmount) {
            await this.logAuditEvent(userId, 'INSUFFICIENT_FUNDS', { vaultAddress, txAmountUSD, tokenAddr }, 'BLOCKED');
            return {
              success: false,
              errorCode: 'INSUFFICIENT_FUNDS',
              message: 'Insufficient token balance. Top up your wallet first.',
              fiatTopUpUrl: `https://checkout.thirdweb.com/buy?amount=${txAmountUSD}&address=${vaultAddress}`,
            };
          }
        } else {
          // Native token transfer
          const balance = await this.provider.getBalance(vaultAddress);
          const transferAmount = BigInt('0x' + actionPayload.slice(132, 196));
          if (balance < transferAmount) {
            await this.logAuditEvent(userId, 'INSUFFICIENT_FUNDS', { vaultAddress, txAmountUSD }, 'BLOCKED');
            return {
              success: false,
              errorCode: 'INSUFFICIENT_FUNDS',
              message: 'Insufficient balance. Top up instantly with credit card / bank transfer.',
              fiatTopUpUrl: `https://checkout.thirdweb.com/buy?amount=${txAmountUSD}&address=${vaultAddress}`,
            };
          }
        }
      }
    } catch (balanceErr: any) {
      this.logger.warn(`Balance pre-check failed (non-blocking): ${balanceErr.message}`);
    }

    // Check relayer wallet gas balance prior to submission
    await this.checkRelayerBalance();

    // A CALL to an address with no code succeeds and does nothing: the receipt
    // comes back status 1 with zero logs, having burned only base + calldata
    // gas. Every downstream check then reads as "mysteriously produced no
    // events", and callers that trusted the success went on to tell users
    // their funds had moved. Deploy first, or refuse.
    // Reassigned, not discarded: a legacy row whose address the current factory
    // cannot deploy is repaired to the canonical one, and the returned address
    // is the only address that now has code. Continuing with the old value
    // would relay into the very empty address this call exists to prevent.
    vaultAddress = await this.ensureVaultDeployed(vaultAddress);

    const LOCAL_SESSION_DOMAIN = ethers.keccak256(ethers.toUtf8Bytes('VERIDEX_LOCAL_SESSION_V1'));
    const network = await this.provider.getNetwork();
    const chainId = network.chainId;

    const digest = ethers.solidityPackedKeccak256(
      ['bytes32', 'uint256', 'address', 'uint256', 'bytes32'],
      [LOCAL_SESSION_DOMAIN, chainId, vaultAddress, nonce, ethers.keccak256(actionPayload)]
    );

    const ethSignedHash = ethers.hashMessage(ethers.getBytes(digest));
    const sessionSignature = sessionWallet.signingKey.sign(ethSignedHash).serialized;

    // The grant must already exist on-chain. Submitting without it burns the
    // user's gas to buy a revert.
    await this.assertSessionGrantActive(userId, vaultAddress, sessionKeyHash, sessionKeyId);

    this.logger.log(`[SessionAction] Starting executeWithLocalSession for vault ${vaultAddress}, nonce ${nonce}, actionPayload: ${actionPayload}`);

    try {
      const vaultAbi = [
        'function executeWithLocalSession(bytes calldata sessionSignature, bytes calldata actionPayload, uint256 nonce)',
      ];
      const vaultContract = new ethers.Contract(vaultAddress, vaultAbi, this.relayerSigner);

      // Use higher gas for ACTION_EXECUTE (complex contract calls like envelope/pool creation)
      const actionTypeForGas = parseInt(actionPayload.slice(2, 4), 16);
      const gasLimit = actionTypeForGas === 2 ? 800_000 : 500_000;

      this.logger.log(`[SessionAction] Submitting transaction to vault (gasLimit: ${gasLimit})...`);
      const tx = await vaultContract.executeWithLocalSession(
        sessionSignature, actionPayload, nonce,
        { gasLimit },
      );
      this.logger.log(`[SessionAction] Transaction submitted. Hash: ${tx.hash}. Waiting for confirmation...`);
      const receipt = await Promise.race([
        tx.wait(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Transaction confirmation timeout (60s)')), 60000))
      ]);

      this.logger.log(`[SessionAction] Transaction mined. Status: ${receipt.status}, Gas used: ${receipt.gasUsed?.toString()}, Logs: ${receipt.logs.length}`);

      if (receipt.status !== 1) {
        throw new Error('On-chain execution reverted');
      }

      // Verify events exist in logs based on action type
      const actionType = parseInt(actionPayload.slice(2, 4), 16);
      const transferTopic = ethers.id('Transfer(address,address,uint256)');
      const approvalTopic = ethers.id('Approval(address,address,uint256)');

      if (actionType === 1) {
        // ACTION_TRANSFER: must have Transfer event
        const hasTransferEvent = receipt.logs.some(
          (log: any) => log.topics?.[0] === transferTopic
        );
        if (!hasTransferEvent) {
          this.logger.error(
            `[SessionAction] CRITICAL: Tx ${tx.hash} succeeded but NO Transfer event found. ` +
            `Gas used: ${receipt.gasUsed?.toString()}/${tx.gasLimit?.toString()}. ` +
            `Likely out-of-gas on internal call.`
          );
          await this.logAuditEvent(userId, 'TRANSFER_NO_EVENT', {
            vaultAddress, txHash: tx.hash, amountUSD: txAmountUSD,
            gasUsed: receipt.gasUsed?.toString(),
            gasLimit: tx.gasLimit?.toString(),
          }, 'FAILED', tx.hash, Number(chainId));
          throw new Error(
            'Transaction confirmed but token transfer did not execute. ' +
            'This may be caused by insufficient gas or a contract-level issue. Please retry.'
          );
        }
      } else if (actionType === 2) {
        // ACTION_EXECUTE: verify at least one meaningful event (Transfer, Approval, or custom)
        const hasRelevantEvent = receipt.logs.some(
          (log: any) => log.topics?.[0] === transferTopic || log.topics?.[0] === approvalTopic
        );
        if (!hasRelevantEvent && receipt.logs.length === 0) {
          this.logger.error(
            `[SessionAction] CRITICAL: Tx ${tx.hash} (ACTION_EXECUTE) succeeded but NO events emitted. ` +
            `Gas used: ${receipt.gasUsed?.toString()}/${tx.gasLimit?.toString()}.`
          );
          await this.logAuditEvent(userId, 'EXECUTE_NO_EVENT', {
            vaultAddress, txHash: tx.hash, amountUSD: txAmountUSD,
            gasUsed: receipt.gasUsed?.toString(),
            gasLimit: tx.gasLimit?.toString(),
          }, 'FAILED', tx.hash, Number(chainId));
          throw new Error(
            'Transaction confirmed but contract execution produced no events. ' +
            'This may be caused by insufficient gas or a contract-level issue. Please retry.'
          );
        }
      }

      this.logger.log(`[SessionAction] ✅ Transfer event verified. Transaction successful: ${tx.hash}`);

      // Money received must not consume the key's daily *spending* budget.
      if (sessionKeyId && !options?.inbound) {
        if (this.hotStateService) {
          await this.hotStateService.recordSpendingAsync(sessionKeyId, txAmountUSD, tx.hash);
        } else {
          await this.prisma.spendingRecord.create({
            data: {
              sessionKeyId,
              amountUSD: txAmountUSD,
              txHash: tx.hash,
            }
          });
        }
      }

      await this.logAuditEvent(userId, 'PAYMENT_RELAYED', { vaultAddress, txHash: tx.hash, amountUSD: txAmountUSD }, 'SUCCESS', tx.hash, Number(chainId));
      // Inbound relays (escrow claims, refunds) are logged by the caller with
      // the action that actually describes them. Recording TRANSFER_SENT here
      // too would double-count the same tx hash and, worse, file money the
      // user *received* as money they sent.
      if (!options?.inbound && this.activityService && typeof this.activityService.record === 'function') {
        await this.activityService.record({
          userIdentifier: userId,
          action: UserActivityAction.TRANSFER_SENT,
          amount: txAmountUSD,
          token: 'USD',
          txHash: tx.hash,
          metadata: { vaultAddress, chainId: Number(chainId), execution: 'LOCAL_SESSION' },
        });
      }

      return {
        success: true,
        txHash: tx.hash,
      };
    } catch (e: any) {
      await this.attachRevertData(e);
      this.logger.error(`Relayer transaction failure: ${describeForLog(e)}`, e.stack);
      await this.logAuditEvent(
        userId,
        'TRANSACTION_FAILED',
        { error: e.message, vaultAddress, revertSelector: extractRevertSelector(e) },
        'FAILED',
      );

      // The user gets advice, not the receipt. The full error, including the
      // decoded selector, is in the log line above.
      const failure = new BadRequestException(
        toUserMessage(e, 'The payment could not be completed on-chain. No funds have left your wallet.'),
      );
      (failure as any).code = 'RELAYER_SUBMISSION_FAILED';
      throw failure;
    }
  }

  /**
   * Recovers the revert reason for a transaction that was mined and failed.
   *
   * `tx.wait()` on a `status: 0` receipt throws with no revert data at all —
   * the node returned a receipt, not an error — so the failure reaches the logs
   * as an undifferentiated CALL_EXCEPTION. Replaying the same call against the
   * block it failed in re-runs it in the failing state and returns the
   * selector, which is the difference between "reverted" and "the session grant
   * was missing".
   *
   * Best-effort by construction: mutates `error.data` when it finds something
   * and stays silent when it does not.
   */
  private async attachRevertData(error: any): Promise<void> {
    if (!error || typeof error !== 'object') return;
    if (extractRevertSelector(error)) return;

    const txHash = error.receipt?.hash ?? error.transactionHash;
    if (!txHash) return;

    try {
      const tx = await this.provider.getTransaction(txHash);
      if (!tx) return;
      await this.provider.call({
        to: tx.to,
        from: tx.from,
        data: tx.data,
        value: tx.value,
        blockTag: tx.blockNumber ?? undefined,
      });
    } catch (replayErr: any) {
      const data = replayErr?.data ?? replayErr?.info?.error?.data;
      if (typeof data === 'string' && data.startsWith('0x')) error.data = data;
    }
  }

  async executeOwnerTransfer(
    userId: string,
    vaultAddress: string,
    actionPayload: string,
    txAmountUSD: number,
  ): Promise<{ success: boolean; txHash: string }> {
    // Refuse identity- and policy-mutating actions before the key is used. The
    // contract enforces this too; refusing here makes the attempt visible and
    // auditable rather than a silent on-chain revert.
    assertRelayerMaySign(actionPayload);

    await this.checkRelayerBalance();

    const network = await this.provider.getNetwork();
    const chainId = network.chainId;

    try {
      const vaultAbi = ['function execute(bytes calldata actionPayload)'];
      const vaultContract = new ethers.Contract(vaultAddress, vaultAbi, this.relayerSigner);

      const ownerActionType = parseInt(actionPayload.slice(2, 4), 16);
      const ownerGasLimit = ownerActionType === 2 ? 800_000 : 500_000;
      const tx = await vaultContract.execute(actionPayload, { gasLimit: ownerGasLimit });
      const receipt = await Promise.race([
        tx.wait(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Transaction confirmation timeout (60s)')), 60000))
      ]);

      if (receipt.status !== 1) {
        throw new Error('On-chain execution reverted');
      }

      const transferTopic = ethers.id('Transfer(address,address,uint256)');
      const hasTransferEvent = receipt.logs.some(
        (log: any) => log.topics?.[0] === transferTopic
      );
      if (!hasTransferEvent) {
        this.logger.error(
          `[OwnerTransfer] CRITICAL: Tx ${tx.hash} succeeded but NO Transfer event. ` +
          `Gas used: ${receipt.gasUsed?.toString()}/${tx.gasLimit?.toString()}.`
        );
        await this.logAuditEvent(userId, 'TRANSFER_NO_EVENT', {
          vaultAddress, txHash: tx.hash, amountUSD: txAmountUSD,
          gasUsed: receipt.gasUsed?.toString(),
        }, 'FAILED', tx.hash, Number(chainId));
        throw new Error('Transaction confirmed but token transfer did not execute. Please retry.');
      }

      await this.logAuditEvent(userId, 'PAYMENT_RELAYED_PASSKEY', { vaultAddress, txHash: tx.hash, amountUSD: txAmountUSD }, 'SUCCESS', tx.hash, Number(chainId));

      return { success: true, txHash: tx.hash };
    } catch (e: any) {
      await this.attachRevertData(e);
      this.logger.error(`Owner transfer failure: ${describeForLog(e)}`, e.stack);
      await this.logAuditEvent(
        userId,
        'TRANSACTION_FAILED',
        { error: e.message, vaultAddress, method: 'PASSKEY', revertSelector: extractRevertSelector(e) },
        'FAILED',
      );
      throw new BadRequestException(
        toUserMessage(e, 'The transfer could not be completed on-chain. No funds have left your wallet.'),
      );
    }
  }

  private async logAuditEvent(userId: string, action: string, details: any, status: string, txHash?: string, chainId?: number) {
    try {
      await this.prisma.auditEvent.create({
        data: {
          userId,
          action,
          details,
          status,
          txHash: txHash || null,
          chainId: chainId || null,
        }
      });
    } catch (e: any) {
      this.logger.error(`Failed to write audit event log: ${e.message}`);
    }
  }

  /**
   * Deploys the user's vault if it does not yet exist on-chain.
   *
   * Passkey onboarding only computes a counterfactual CREATE2 address; the
   * contract itself is not created until someone pays for it. Direct payments
   * deployed on demand, but the escrow path did not, so a first-time sender's
   * every relayed call went to an empty address — succeeding, emitting nothing,
   * moving nothing, while the bot reported the funds as escrowed.
   *
   * Deployment is deliberately part of relaying rather than of any one caller,
   * so no future flow can reintroduce the gap.
   */
  async ensureVaultDeployed(vaultAddress: string): Promise<string> {
    const code = await this.provider.getCode(vaultAddress);
    if (code !== '0x' && code !== '0x0') return vaultAddress;

    this.logger.log(`[Deploy] Vault ${vaultAddress} has no code on-chain. Deploying via factory...`);

    const wallet = await this.prisma.smartWallet.findUnique({
      where: { address: vaultAddress },
      include: {
        user: {
          select: {
            customTokens: {
              where: { removedAt: null },
              select: { address: true, symbol: true },
            },
          },
        },
      },
    });
    if (!wallet) {
      throw new BadRequestException('Smart account is not deployed and no wallet record exists for it. Please complete wallet setup.');
    }

    const factoryAddress =
      process.env.PAY_VAULT_FACTORY_ADDRESS || process.env.FACTORY_CONTRACT_ADDRESS || '';
    if (!factoryAddress) throw new Error('PAY_VAULT_FACTORY_ADDRESS not configured');

    const ownerKeyHash = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'uint256'],
        [BigInt(wallet.publicKeyX), BigInt(wallet.publicKeyY)],
      ),
    );

    const factory = new ethers.Contract(
      factoryAddress,
      [
        'function createVault(bytes32 ownerKeyHash, address owner) returns (address vault)',
        'function getAddress(bytes32 ownerKeyHash, address owner) view returns (address)',
        'function implementation() view returns (address)',
        'event VaultCreated(address indexed vault, bytes32 indexed ownerKeyHash, address indexed owner)',
      ],
      this.relayerSigner,
    );

    // Explicit signature: bare `getAddress` collides with ethers v6's
    // Contract.getAddress(), which ignores arguments and returns the factory.
    const predicted: string = await factory['getAddress(bytes32,address)'](
      ownerKeyHash,
      this.relayerAddress,
    );
    if (predicted.toLowerCase() !== vaultAddress.toLowerCase()) {
      const repairedAddress = await this.repairLegacyCounterfactualWallet({
        wallet,
        vaultAddress,
        predicted,
        ownerKeyHash,
        factoryAddress,
        factory,
      });

      if (!repairedAddress) {
        this.logger.error(
          `[Deploy] Factory predicts ${predicted} but the stored vault address is ${vaultAddress}.`,
        );
        throw new BadRequestException(
          'Smart account address mismatch detected. The original address has been preserved because it may hold funds. Please contact support for recovery.',
        );
      }

      return this.ensureVaultDeployed(repairedAddress);
    }

    const receipt = await (await factory.createVault(ownerKeyHash, this.relayerAddress)).wait();
    if (!receipt || receipt.status !== 1) {
      throw new BadRequestException('Smart account deployment failed on-chain. Please retry.');
    }

    const deployedCode = await this.provider.getCode(vaultAddress);
    if (deployedCode === '0x' || deployedCode === '0x0') {
      throw new BadRequestException(
        'Smart account deployment reported success but no contract exists at your address. Please contact support.',
      );
    }

    await this.prisma.smartWallet.update({
      where: { address: vaultAddress },
      data: {
        isDeployed: true,
        factoryAddress,
        derivationVersion: 'OWNER_BOUND_V2',
      },
    });

    this.logger.log(`[Deploy] Vault ${vaultAddress} deployed. Tx: ${receipt.hash}`);
    return vaultAddress;
  }

  /**
   * Repairs only the one legacy CREATE2 calculation shipped before the factory
   * bound the relayer owner into its salt. A legacy address cannot be deployed
   * by the current factory, so leaving an unfunded row untouched permanently
   * blocks wallet setup. This is deliberately fail-closed: every known asset
   * balance must be zero before the row can point at the canonical address.
   */
  private async repairLegacyCounterfactualWallet(params: {
    wallet: {
      id: string;
      userId: string;
      address: string;
      publicKeyX: string;
      publicKeyY: string;
      isDeployed: boolean;
      user: { customTokens: Array<{ address: string; symbol: string }> };
    };
    vaultAddress: string;
    predicted: string;
    ownerKeyHash: string;
    factoryAddress: string;
    factory: ethers.Contract;
  }): Promise<string | null> {
    const { wallet, vaultAddress, predicted, ownerKeyHash, factoryAddress, factory } = params;

    if (wallet.isDeployed) return null;

    let implementation: string;
    try {
      implementation = await factory.implementation();
    } catch (error: any) {
      this.logger.error(`[Deploy] Cannot inspect factory implementation for legacy recovery: ${error.message}`);
      return null;
    }

    const cloneInitCode =
      `0x3d602d80600a3d3981f3363d3d373d3d3d363d73${implementation.slice(2).toLowerCase()}5af43d82803e903d91602b57fd5bf3`;
    const legacyAddress = ethers.getCreate2Address(
      factoryAddress,
      ethers.keccak256(ethers.solidityPacked(['bytes32'], [ownerKeyHash])),
      ethers.keccak256(cloneInitCode),
    );

    if (legacyAddress.toLowerCase() !== vaultAddress.toLowerCase()) return null;

    const tokenAddresses = new Map<string, string>();
    for (const token of Object.values(getSupportedTokens())) {
      if (token.symbol !== 'BOT' && ethers.isAddress(token.address)) {
        tokenAddresses.set(token.address.toLowerCase(), token.address);
      }
    }
    for (const token of wallet.user.customTokens) {
      if (ethers.isAddress(token.address)) {
        tokenAddresses.set(token.address.toLowerCase(), token.address);
      }
    }

    try {
      const nativeBalance = await this.provider.getBalance(vaultAddress);
      if (nativeBalance !== 0n) return null;

      for (const tokenAddress of tokenAddresses.values()) {
        const token = new ethers.Contract(
          tokenAddress,
          ['function balanceOf(address) view returns (uint256)'],
          this.provider,
        );
        if ((await token.balanceOf(vaultAddress)) !== 0n) return null;
      }
    } catch (error: any) {
      this.logger.error(`[Deploy] Could not prove legacy wallet ${vaultAddress} is unfunded: ${error.message}`);
      return null;
    }

    const updated = await this.prisma.smartWallet.updateMany({
      where: { id: wallet.id, address: vaultAddress, isDeployed: false },
      data: {
        address: predicted,
        factoryAddress,
        derivationVersion: 'OWNER_BOUND_V2',
      },
    });
    if (updated.count !== 1) return null;

    await this.logAuditEvent(
      wallet.userId,
      'LEGACY_COUNTERFACTUAL_WALLET_REPAIRED',
      { previousAddress: vaultAddress, repairedAddress: predicted, factoryAddress },
      'SUCCESS',
    );
    this.logger.warn(
      `[Deploy] Repaired unfunded legacy counterfactual wallet ${vaultAddress} -> ${predicted}.`,
    );
    return predicted;
  }

  /**
   * Refuses a session action whose on-chain grant does not exist.
   *
   * The relayer used to register the grant itself, through
   * `PayVault.execute(ACTION_EXECUTE -> registerSession)`. The vault now
   * rejects that with `PayVault__Unauthorized`, deliberately: a delegated
   * authority must not be able to widen its own delegation. The grant is
   * created by the user's passkey instead — see
   * {@link PasskeyExecutionService.prepareSessionGrant}.
   *
   * What was left behind was worse than a missing feature. The failed
   * registration was swallowed as a warning and the action was submitted
   * anyway, so every payment on an ungranted key cost the relayer a full gas
   * fee to mine a `PayVault__SessionInactive` revert, and told the user their
   * payment had failed for reasons only an ethers stack trace could explain.
   *
   * A key whose grant is missing is also marked inactive in the database, so
   * the next attempt routes straight to passkey activation rather than
   * re-discovering this on-chain.
   */
  private async assertSessionGrantActive(
    userId: string,
    vaultAddress: string,
    sessionKeyHash: string,
    sessionKeyId?: string,
  ): Promise<void> {
    const vault = new ethers.Contract(
      vaultAddress,
      ['function localSessionRegistry() view returns (address)'],
      this.provider,
    );

    let registryAddress: string;
    try {
      registryAddress = await vault.localSessionRegistry();
    } catch (e: any) {
      this.logger.error(
        `[SessionGrant] Could not read localSessionRegistry from vault ${vaultAddress}: ${describeForLog(e)}`,
      );
      throw this.sessionNotActivatedError(userId, vaultAddress, sessionKeyHash, 'REGISTRY_UNREADABLE', sessionKeyId);
    }

    if (!registryAddress || registryAddress === ethers.ZeroAddress) {
      throw this.sessionNotActivatedError(userId, vaultAddress, sessionKeyHash, 'REGISTRY_UNSET', sessionKeyId);
    }

    const registry = new ethers.Contract(
      registryAddress,
      ['function getSession(address vault, bytes32 sessionKeyHash) view returns (bool active, uint64 expiry, uint256 maxValue)'],
      this.provider,
    );

    let active: boolean;
    let expiry: bigint;
    try {
      [active, expiry] = await registry.getSession(vaultAddress, sessionKeyHash);
    } catch (e: any) {
      this.logger.error(
        `[SessionGrant] Could not read grant for ${sessionKeyHash} from registry ${registryAddress}: ${describeForLog(e)}`,
      );
      throw this.sessionNotActivatedError(userId, vaultAddress, sessionKeyHash, 'GRANT_UNREADABLE', sessionKeyId);
    }

    if (!active) {
      throw this.sessionNotActivatedError(userId, vaultAddress, sessionKeyHash, 'GRANT_MISSING', sessionKeyId);
    }

    // The vault compares against `block.timestamp`, so a grant expiring within
    // the next block is already gone by the time the transaction lands.
    if (Number(expiry) <= Math.floor(Date.now() / 1000)) {
      throw this.sessionNotActivatedError(userId, vaultAddress, sessionKeyHash, 'GRANT_EXPIRED', sessionKeyId);
    }
  }

  /**
   * Builds the "activate your session key" failure, and records the missing
   * grant so nothing hands the key out again.
   *
   * Carries `SESSION_KEY_REQUIRED` / `requirePasskey` because that is what the
   * chat and API surfaces already key on to offer a passkey prompt.
   */
  private sessionNotActivatedError(
    userId: string,
    vaultAddress: string,
    sessionKeyHash: string,
    reason: string,
    sessionKeyId?: string,
  ): ForbiddenException {
    this.logger.warn(
      `[SessionGrant] No usable on-chain grant (${reason}) for session ${sessionKeyHash} on vault ${vaultAddress}; refusing to submit.`,
    );

    // Fire-and-forget: the user is getting an answer either way, and a failed
    // bookkeeping write must not turn a clear refusal into a stack trace.
    void this.prisma.sessionKey
      .updateMany({ where: { keyHash: sessionKeyHash }, data: { activatedAt: null } })
      .catch((e) => this.logger.warn(`[SessionGrant] Could not clear activatedAt for ${sessionKeyHash}: ${e.message}`));

    if (sessionKeyId) void this.hotStateService?.revokeSessionKey(sessionKeyHash);

    void this.logAuditEvent(
      userId,
      'SESSION_GRANT_MISSING',
      { vaultAddress, sessionKeyHash, reason },
      'BLOCKED',
    ).catch(() => undefined);

    const error = new ForbiddenException(
      'Your instant-payment session is not active on-chain yet. Authorize it with your passkey to send from chat.',
    );
    (error as any).code = 'SESSION_KEY_REQUIRED';
    (error as any).requirePasskey = true;
    return error;
  }
}
