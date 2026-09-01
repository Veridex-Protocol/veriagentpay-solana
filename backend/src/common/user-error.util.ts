import { ethers } from 'ethers';

/**
 * Turns chain and infrastructure failures into something a person can act on.
 *
 * A user in a chat window was being shown the raw ethers error — the full
 * `TransactionReceipt`, the 512-character `logsBloom`, `code=CALL_EXCEPTION`.
 * It tells them nothing they can do, it leaks vault and relayer addresses into
 * group chats, and it reads like the product broke. The information is not
 * lost: the full error still goes to the logs, and the user gets a reference
 * they can quote to support.
 *
 * Everything user-facing goes through {@link toUserMessage}. Nothing else
 * should interpolate an `Error.message` into a message we send.
 */

/**
 * Custom-error signatures across the vault contracts, mapped to what the user
 * should do about them.
 *
 * Solidity reverts carry only a 4-byte selector, and the relayer submits with
 * an ABI narrow enough that ethers cannot decode it. Hashing the signatures
 * here keeps the map honest: rename an error in the contract and the entry
 * simply stops matching, rather than silently describing the wrong failure.
 */
const REVERT_REASONS: Record<string, string> = Object.fromEntries(
  (
    [
      // ── Session grants ──
      ['PayVault__SessionInactive()', 'Your instant-payment session is not active. Re-authorize it with your passkey to continue.'],
      ['PayVault__SessionExpired()', 'Your instant-payment session has expired. Re-authorize it with your passkey to continue.'],
      ['PayVault__LocalSessionRegistryNotSet()', 'Your account is not set up for instant payments yet. Re-authorize with your passkey to continue.'],
      ['PayVault__InvalidSessionNonce()', 'That payment was already processed or arrived out of order. Check your history before retrying.'],
      ['PayVault__ExecutionIdAlreadyProcessed()', 'That payment was already processed. Check your history before retrying.'],
      ['PayVault__SessionValueExceeded()', 'This amount is above your instant-payment limit. Approve it with your passkey instead.'],
      ['PayVault__SessionTargetNotAllowed()', 'This action is not permitted by your instant-payment settings. Approve it with your passkey instead.'],
      ['PayVault__SessionCannotReconfigurePolicy()', 'Changing your security settings needs your passkey.'],
      ['SessionRegistry__SessionNotFound()', 'Your instant-payment session is not active. Re-authorize it with your passkey to continue.'],
      ['SessionRegistry__ExpiryInPast()', 'Your instant-payment session has expired. Re-authorize it with your passkey to continue.'],

      // ── Limits ──
      ['PayVault__DailyLimitExceeded()', 'This would go over your daily spending limit. Approve it with your passkey or try again tomorrow.'],
      ['PayVault__SpendingModuleRequired()', 'Your spending limits are not configured yet. Open the app to finish setup.'],

      // ── Authorization ──
      ['PayVault__Unauthorized()', 'This action needs your passkey approval.'],
      ['PayVault__UnauthorizedPasskey()', 'That passkey is not registered on this account.'],
      ['PayVault__InvalidSignature()', 'We could not verify your approval. Please try again.'],
      ['PayVault__ChallengeMismatch()', 'Your approval did not match this payment. Please start over.'],

      // ── Vault state ──
      ['PayVault__VaultPaused()', 'Your account is paused. Unpause it in the app to make payments.'],
      ['PayVault__NotInitialized()', 'Your account is not finished setting up. Open the app to complete it.'],
      ['PayVault__RecoveryPendingBlocksExecution()', 'A recovery is pending on your account, so payments are on hold until it resolves.'],
      ['PayVault__ExecutionFailed()', 'The payment could not be completed on-chain. Your funds were not moved.'],
      ['PayVault__InvalidRecipient()', 'That recipient address is not valid.'],
    ] as [string, string][]
  ).map(([signature, reason]) => [ethers.id(signature).slice(0, 10), reason]),
);

/**
 * Shapes that mean "this text is for engineers, not for the person paying".
 *
 * Applied to messages we would otherwise pass through, so a raw chain error
 * cannot reach a user just because it arrived wrapped in an exception type we
 * normally trust.
 */
const TECHNICAL_MARKERS = [
  /code=[A-Z_]+/,
  /action="/,
  /version=\d/,
  /TransactionReceipt/,
  /logsBloom/i,
  /0x[0-9a-fA-F]{40,}/,
  /\bat\s+\w+\s*\(/,
  /CALL_EXCEPTION|BAD_DATA|UNPREDICTABLE_GAS|SERVER_ERROR|NETWORK_ERROR|could not coalesce/i,
];

// High-confidence indicators that an entire provider/SDK error was embedded
// in otherwise normal chat copy. This deliberately does not match a plain
// address or transaction hash because successful receipts legitimately show
// those to users.
const OUTBOUND_TECHNICAL_MARKERS = [
  /action="(?:sendTransaction|estimateGas|call)"/i,
  /\bTransactionReceipt\b/i,
  /\blogsBloom\b/i,
  /\breceipt=\s*\{/i,
  /\b(?:CALL_EXCEPTION|BAD_DATA|UNPREDICTABLE_GAS_LIMIT|SERVER_ERROR|NETWORK_ERROR)\b/i,
  /\bcode=[A-Z_]+\b/i,
  /\bversion=\d+\.\d+\.\d+/i,
  /\bcumulativeGasUsed\b/i,
  /\n\s*at\s+(?:async\s+)?[\w$.<>]+\s*\(/,
  /could not decode result data/i,
];

/** Longer than this and it is a dump, whatever it contains. */
const MAX_USER_MESSAGE_LENGTH = 220;

const GENERIC_FAILURE =
  'Something went wrong on our side and the transaction did not go through. No funds have left your wallet.';

/**
 * Pulls the 4-byte custom-error selector out of whatever shape ethers used.
 *
 * The selector lives in a different place depending on how the call failed —
 * `estimateGas` puts it on `data`, a nested JSON-RPC error buries it, and a
 * mined-then-reverted transaction has none at all until the call is replayed.
 */
export function extractRevertSelector(error: unknown): string | null {
  const err = error as any;
  const candidates = [
    err?.data,
    err?.error?.data,
    err?.info?.error?.data,
    err?.revert?.data,
    err?.cause?.data,
  ];

  for (const candidate of candidates) {
    const value = typeof candidate === 'string' ? candidate : candidate?.data;
    if (typeof value === 'string' && /^0x[0-9a-fA-F]{8}/.test(value)) {
      return value.slice(0, 10).toLowerCase();
    }
  }

  // Last resort: ethers stringifies the selector into the message as
  // `data="0x2d851bf2"`, which is often all that survives a rethrow.
  const match = /data="(0x[0-9a-fA-F]{8})/.exec(String(err?.message ?? ''));
  return match ? match[1].toLowerCase() : null;
}

/** The user-facing reason for a known contract revert, if we recognize it. */
export function describeRevert(error: unknown): string | null {
  const selector = extractRevertSelector(error);
  return selector ? REVERT_REASONS[selector] ?? null : null;
}

/**
 * A short, quotable id for correlating a user's report with the logs.
 *
 * Not a secret and not unique forever — it only has to survive long enough for
 * someone to paste it into a support chat while the log line is still warm.
 */
export function errorReference(): string {
  return `E-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function isTechnical(message: string): boolean {
  if (message.length > MAX_USER_MESSAGE_LENGTH) return true;
  return TECHNICAL_MARKERS.some((pattern) => pattern.test(message));
}

/**
 * The one function that decides what a user is allowed to see about a failure.
 *
 * Messages we wrote ourselves pass through — they are already advice. Anything
 * that looks like it came from a node, a provider, or a stack trace is replaced
 * by the closest known reason, or by a generic failure if we have none.
 *
 * @param fallback Shown when the error is unrecognizable. Give the caller's own
 *        context ("Your payment request could not be created.") rather than
 *        letting every surface say the same generic thing.
 */
export function toUserMessage(error: unknown, fallback: string = GENERIC_FAILURE): string {
  const err = error as { message?: string } | undefined;

  const reverted = describeRevert(error);
  if (reverted) return reverted;

  const raw = (err?.message ?? '').trim();
  if (!raw) return fallback;

  if (/insufficient funds|insufficient balance/i.test(raw)) {
    return 'There is not enough balance to cover this transaction.';
  }
  if (/timeout|timed out|ETIMEDOUT|ECONNREFUSED|ENOTFOUND/i.test(raw)) {
    return 'The network is slow to respond right now. Please try again in a moment.';
  }
  if (/nonce/i.test(raw)) {
    return 'A previous transaction is still settling. Please try again in a moment.';
  }
  if (/\b(?:jwt|access token|refresh token)\b.*\b(?:expired|invalid)\b|\b(?:expired|invalid)\b.*\b(?:jwt|access token|refresh token)\b/i.test(raw)) {
    return 'Your session has ended. Please sign in again.';
  }

  return isTechnical(raw) ? fallback : raw;
}

/**
 * Last-mile protection for chat drivers.
 *
 * Individual handlers should still call `toUserMessage`, but this prevents a
 * future missed catch block from ever posting a receipt, stack trace or RPC
 * payload to Telegram, WhatsApp, Discord or Slack.
 */
export function sanitizeOutboundMessage(message: string): string {
  if (!message || !OUTBOUND_TECHNICAL_MARKERS.some((pattern) => pattern.test(message))) {
    return message;
  }

  const firstLine = message.split('\n', 1)[0].trim();
  const safeHeading =
    firstLine.length <= 80 && /(?:failed|error|problem)/i.test(firstLine)
      ? firstLine
      : '⚠️ Something went wrong';
  const fundsUnmoved = /no funds (?:have )?left|funds were not moved/i.test(message);

  return `${safeHeading}\n\nWe couldn't complete that action.${
    fundsUnmoved ? ' No funds have left your wallet.' : ''
  }\n\nPlease try again. If it keeps happening, contact support.`;
}

/**
 * A user-facing failure with a reference the logs can be searched by.
 *
 * Use where the user may need to report the problem; use {@link toUserMessage}
 * alone where a reference would just be noise.
 */
export function toUserMessageWithReference(
  error: unknown,
  fallback?: string,
): { message: string; reference: string } {
  return { message: toUserMessage(error, fallback), reference: errorReference() };
}

/**
 * A compact, log-only description. Keeps the decoded revert reason next to the
 * original message so the logs stay more informative than the chat, not less.
 */
export function describeForLog(error: unknown): string {
  const err = error as { message?: string } | undefined;
  const selector = extractRevertSelector(error);
  const decoded = selector ? ` [revert ${selector}${REVERT_REASONS[selector] ? ' — known' : ' — UNKNOWN'}]` : '';
  return `${err?.message ?? String(error)}${decoded}`;
}
