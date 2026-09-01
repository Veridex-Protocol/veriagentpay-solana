import { ForbiddenException } from '@nestjs/common';

/**
 * Off-chain guard on what the relayer key is willing to sign.
 *
 * The relayer is `owner` on every PayVault. On-chain, `PayVault.execute` now
 * refuses identity- and policy-mutating actions outright, so this is the second
 * of two independent layers: the contract is authoritative, and this stops a
 * compromised or buggy backend from even attempting those actions — turning a
 * silent on-chain revert into an explicit, auditable refusal.
 *
 * Keep this list in sync with the guard in `PayVault.execute`.
 *
 * @see docs/audit/11th-august-2026-1.md — SEC-011
 */

const ACTION_TRANSFER = 1;
const ACTION_EXECUTE = 2;
const ACTION_CONFIG = 3;
const ACTION_ADD_KEY = 5;
const ACTION_REMOVE_KEY = 6;

/** CONFIG sub-types the relayer must never reach. */
const FORBIDDEN_CONFIG_TYPES = new Map<number, string>([
  [1, 'daily limit'],
  [3, 'recovery guardians'],
  [7, 'spending limit module'],
  [10, 'session registry'],
  [11, 'owner rotation'],
]);

/** CONFIG sub-types that remain available: both are strictly risk-reducing. */
const ALLOWED_CONFIG_TYPES = new Set<number>([
  2, // pause
  8, // revoke session key
]);

export interface ActionPolicyVerdict {
  allowed: boolean;
  reason?: string;
}

/**
 * Inspects an ABI-encoded action payload and decides whether the relayer may
 * sign it.
 *
 * @param actionPayload `0x`-prefixed hex. Byte 0 is the action type; for
 *                      CONFIG actions, byte 1 is the config sub-type.
 */
export function evaluateRelayerAction(actionPayload: string): ActionPolicyVerdict {
  if (typeof actionPayload !== 'string' || !actionPayload.startsWith('0x')) {
    return { allowed: false, reason: 'Action payload must be 0x-prefixed hex' };
  }

  const body = actionPayload.slice(2);
  if (body.length < 2) {
    return { allowed: false, reason: 'Action payload is empty' };
  }

  const actionType = parseInt(body.slice(0, 2), 16);
  if (Number.isNaN(actionType)) {
    return { allowed: false, reason: 'Action payload is not valid hex' };
  }

  switch (actionType) {
    case ACTION_TRANSFER:
    case ACTION_EXECUTE:
      return { allowed: true };

    case ACTION_ADD_KEY:
    case ACTION_REMOVE_KEY:
      return {
        allowed: false,
        reason:
          'Key management requires direct passkey authorization and cannot be signed by the relayer',
      };

    case ACTION_CONFIG: {
      if (body.length < 4) {
        return { allowed: false, reason: 'CONFIG action is missing its sub-type' };
      }
      const configType = parseInt(body.slice(2, 4), 16);

      if (ALLOWED_CONFIG_TYPES.has(configType)) {
        return { allowed: true };
      }

      const label = FORBIDDEN_CONFIG_TYPES.get(configType);
      return {
        allowed: false,
        reason: label
          ? `CONFIG ${configType} (${label}) requires direct passkey authorization`
          : `CONFIG ${configType} is not permitted on the relayer path`,
      };
    }

    default:
      return { allowed: false, reason: `Unknown action type ${actionType}` };
  }
}

/** Throws unless the relayer is permitted to sign `actionPayload`. */
export function assertRelayerMaySign(actionPayload: string): void {
  const verdict = evaluateRelayerAction(actionPayload);
  if (!verdict.allowed) {
    throw new ForbiddenException(`Relayer policy: ${verdict.reason}`);
  }
}
