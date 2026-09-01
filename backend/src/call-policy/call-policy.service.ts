import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ethers } from 'ethers';
import { PrismaService } from '../prisma/prisma.service';

/**
 * The contracts a user's session key is allowed to reach.
 *
 * ## What this can and cannot do
 *
 * It defines the set that a wallet owner is *offered* when they re-authorize.
 * It cannot push anything to anyone's vault: `setVaultCallPolicy` is
 * `onlyVault`, and `PayVault` rejects every non-passkey path to the spending
 * module (`PayVault__SessionCannotReconfigurePolicy`). Only the owner's passkey
 * can widen their own permissions.
 *
 * That asymmetry is the point. An admin who could silently grant a session key
 * reach into a new contract could drain every wallet on the platform with one
 * database write. Proposing the set and imposing it are different powers, and
 * only the first belongs here.
 *
 * ## Why it is data and not code
 *
 * A vault's allowlist is fixed when the vault is created — `PayVaultFactory`
 * writes its seed in the constructor and has no setter. So a redeployed
 * protocol contract leaves every existing vault refusing the new address until
 * its owner re-authorizes. Keeping the list in the database makes that an
 * operational change; keeping it in `CallPolicyDefaults` alone would make every
 * new contract a code deploy.
 */
@Injectable()
export class CallPolicyService {
  private readonly logger = new Logger(CallPolicyService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Everything a refresh should currently grant.
   *
   * @dev Falls back to the built-in protocol set when the table is empty, so a
   *      deployment that has never touched the admin screen still authorizes
   *      the contracts the product needs. An empty table means "not configured",
   *      never "grant nothing" — the latter would quietly break group pools for
   *      everyone.
   */
  async activeEntries(): Promise<Array<{ target: string; selector: string; allowed: boolean }>> {
    const rows = await this.prisma.sessionCallPolicyEntry.findMany({
      where: { allowed: true },
      orderBy: { createdAt: 'asc' },
    });

    if (rows.length > 0) {
      return rows.map((r) => ({ target: r.target, selector: r.selector, allowed: true }));
    }

    return CallPolicyService.builtInEntries();
  }

  /**
   * The protocol's own contracts, derived from configuration.
   *
   * @dev Mirrors `CallPolicyDefaults` in the contracts package, which seeds the
   *      same pairs into newly created vaults. The two must agree: this list
   *      repairs vaults created before a change, that one prevents the need.
   */
  static builtInEntries(): Array<{ target: string; selector: string; allowed: boolean }> {
    const entries: Array<{ target: string; selector: string; allowed: boolean }> = [];

    const socialPayments = process.env.ENVELOPE_ESCROW_ADDRESS || process.env.SOCIAL_PAYMENTS_ADDRESS;
    if (socialPayments && ethers.isAddress(socialPayments)) {
      const spSignatures = [
        'createRedEnvelopeExtended(address,uint256,uint32,bool,bytes32,uint256,uint8,address,uint256)',
        'createRedEnvelopeExtended(address,uint256,uint32,bool,bytes32,uint256,uint8,address,uint256,bool)',
        'claimRedEnvelope(uint256,uint256,bytes)',
        'requestCancelEnvelope(uint256)',
        'cancelEnvelope(uint256)',
      ];
      for (const sig of spSignatures) {
        entries.push({ target: socialPayments, selector: ethers.id(sig).slice(0, 10), allowed: true });
      }
    }

    const pool = process.env.POOL_CONTRACT_ADDRESS || process.env.GROUP_LENDING_POOL_ADDRESS;
    if (pool && ethers.isAddress(pool)) {
      const poolSignatures = [
        'createPool(string,address,address[])',
        'addMember(uint256,address)',
        'deposit(uint256,uint256)',
        'withdraw(uint256,uint256)',
        'requestLoan(uint256,uint256,uint256)',
        'voteOnLoan(uint256,uint256,bool)',
        'repayLoan(uint256,uint256,uint256)',
        'requestExtension(uint256,uint256,uint256)',
      ];
      for (const sig of poolSignatures) {
        entries.push({ target: pool, selector: ethers.id(sig).slice(0, 10), allowed: true });
      }
    }

    return entries;
  }

  /** Everything on record, including revoked pairs, for the admin screen. */
  async list() {
    const entries = await this.prisma.sessionCallPolicyEntry.findMany({
      orderBy: [{ target: 'asc' }, { createdAt: 'asc' }],
    });

    return {
      entries,
      /** True while the table is empty and the built-in set is standing in. */
      usingBuiltInDefaults: entries.length === 0,
      builtIn: CallPolicyService.builtInEntries(),
    };
  }

  /**
   * Adds or updates one (contract, function) pair.
   *
   * @dev The selector is derived from the signature rather than accepted from
   *      the caller. A hand-typed selector that does not match its label is
   *      indistinguishable from a correct one on screen, and it would authorize
   *      a function nobody reviewed.
   */
  async upsert(
    input: { label: string; target: string; signature: string; allowed?: boolean },
    admin?: { id?: string; email?: string },
  ) {
    if (!input?.target || !ethers.isAddress(input.target)) {
      throw new BadRequestException('A valid contract address is required.');
    }
    if (!input?.signature || !/^[A-Za-z_][A-Za-z0-9_]*\(.*\)$/.test(input.signature.trim())) {
      throw new BadRequestException(
        'A full function signature is required, e.g. "deposit(uint256,uint256)".',
      );
    }
    if (!input?.label?.trim()) {
      throw new BadRequestException('A label is required so the entry is auditable.');
    }

    const signature = input.signature.replace(/\s+/g, '');
    const selector = ethers.id(signature).slice(0, 10);
    const target = ethers.getAddress(input.target);
    const allowed = input.allowed !== false;

    const entry = await this.prisma.sessionCallPolicyEntry.upsert({
      where: { target_selector: { target, selector } },
      update: { label: input.label.trim(), signature, allowed, updatedBy: admin?.email || admin?.id },
      create: {
        label: input.label.trim(),
        target,
        signature,
        selector,
        allowed,
        updatedBy: admin?.email || admin?.id,
      },
    });

    // Written straight to the audit table rather than through
    // `AdminAuditService`. This service is consumed by the relayer as well as
    // the admin API, and reaching into AdminModule for a logger pulled the
    // whole admin graph into the relayer's imports — which closed a module
    // cycle and left `RelayerModule` undefined wherever it was imported
    // without a forwardRef.
    await this.prisma.adminAuditLog
      .create({
        data: {
          adminId: admin?.id || null,
          adminEmail: admin?.email || null,
          action: 'SESSION_CALL_POLICY_UPDATED',
          target,
          details: { signature, selector, allowed },
        },
      })
      .catch(() => undefined);

    this.logger.warn(
      `[CallPolicy] ${allowed ? 'Permitted' : 'Revoked'} ${signature} on ${target} ` +
      `by ${admin?.email || admin?.id || 'unknown admin'}.`,
    );

    return entry;
  }

  /**
   * Revokes a pair.
   *
   * @dev Marks it disallowed rather than deleting: the row is the record of
   *      what was once authorized, and a refresh needs to send `allowed: false`
   *      to actually withdraw the permission from a vault that already has it.
   */
  async revoke(id: string, admin?: { id?: string; email?: string }) {
    const existing = await this.prisma.sessionCallPolicyEntry.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Call policy entry not found.');

    const entry = await this.prisma.sessionCallPolicyEntry.update({
      where: { id },
      data: { allowed: false, updatedBy: admin?.email || admin?.id },
    });

    this.logger.warn(
      `[CallPolicy] Revoked ${existing.signature} on ${existing.target} ` +
      `by ${admin?.email || admin?.id || 'unknown admin'}. ` +
      `Existing vaults keep the permission until their owners re-authorize.`,
    );

    return entry;
  }

  /**
   * Seeds the table from the built-in protocol set.
   *
   * @dev A starting point for the admin screen, so the first edit is a change
   *      to a visible list rather than an empty page whose emptiness silently
   *      means something else.
   */
  async seedFromBuiltIn(admin?: { id?: string; email?: string }) {
    const socialPayments = process.env.ENVELOPE_ESCROW_ADDRESS || process.env.SOCIAL_PAYMENTS_ADDRESS;
    if (socialPayments && ethers.isAddress(socialPayments)) {
      const spEntries: Array<[string, string]> = [
        ['SocialPayments.createRedEnvelope', 'createRedEnvelopeExtended(address,uint256,uint32,bool,bytes32,uint256,uint8,address,uint256)'],
        ['SocialPayments.createRedEnvelopeSponsored', 'createRedEnvelopeExtended(address,uint256,uint32,bool,bytes32,uint256,uint8,address,uint256,bool)'],
        ['SocialPayments.claimRedEnvelope', 'claimRedEnvelope(uint256,uint256,bytes)'],
        ['SocialPayments.requestCancelEnvelope', 'requestCancelEnvelope(uint256)'],
        ['SocialPayments.cancelEnvelope', 'cancelEnvelope(uint256)'],
      ];
      for (const [label, signature] of spEntries) {
        await this.upsert({ label, target: socialPayments, signature, allowed: true }, admin);
      }
    }

    const pool = process.env.POOL_CONTRACT_ADDRESS || process.env.GROUP_LENDING_POOL_ADDRESS;
    if (pool && ethers.isAddress(pool)) {
      const poolEntries: Array<[string, string]> = [
        ['GroupLendingPool.createPool', 'createPool(string,address,address[])'],
        ['GroupLendingPool.addMember', 'addMember(uint256,address)'],
        ['GroupLendingPool.deposit', 'deposit(uint256,uint256)'],
        ['GroupLendingPool.withdraw', 'withdraw(uint256,uint256)'],
        ['GroupLendingPool.requestLoan', 'requestLoan(uint256,uint256,uint256)'],
        ['GroupLendingPool.voteOnLoan', 'voteOnLoan(uint256,uint256,bool)'],
        ['GroupLendingPool.repayLoan', 'repayLoan(uint256,uint256,uint256)'],
        ['GroupLendingPool.requestExtension', 'requestExtension(uint256,uint256,uint256)'],
      ];
      for (const [label, signature] of poolEntries) {
        await this.upsert({ label, target: pool, signature, allowed: true }, admin);
      }
    }

    if (!socialPayments && !pool) {
      throw new BadRequestException('Neither SOCIAL_PAYMENTS_ADDRESS nor POOL_CONTRACT_ADDRESS is configured.');
    }

    return this.list();
  }
}
