import { ethers } from 'ethers';
import {
  describeForLog,
  extractRevertSelector,
  sanitizeOutboundMessage,
  toUserMessage,
} from './user-error.util';

/**
 * The error that reached a user's chat window, trimmed of the 512-character
 * logsBloom. Kept verbatim otherwise: the whole point of these tests is that
 * this exact shape never reaches a person again.
 */
const ETHERS_CALL_EXCEPTION =
  'transaction execution reverted (action="sendTransaction", data=null, reason=null, ' +
  'invocation=null, revert=null, transaction={ "data": "", "from": ' +
  '"0x949a537aFdcc2958edeC473Ce8C040E31EA6EE2B", "to": "0x306a3b9B6F60e46599005Fd4896Eb8f31D5B6F25" }, ' +
  'receipt={ "_type": "TransactionReceipt", "blockNumber": 19660051, "cumulativeGasUsed": "92365", ' +
  '"status": 0 }, code=CALL_EXCEPTION, version=6.16.0)';

describe('toUserMessage', () => {
  it('replaces a raw ethers CALL_EXCEPTION with the caller’s fallback', () => {
    const message = toUserMessage(new Error(ETHERS_CALL_EXCEPTION), 'The payment could not be escrowed.');

    expect(message).toBe('The payment could not be escrowed.');
    expect(message).not.toMatch(/0x949a537a/i);
    expect(message).not.toMatch(/CALL_EXCEPTION|TransactionReceipt|version=/);
  });

  it('decodes a known custom error into advice the user can act on', () => {
    const err: any = new Error('execution reverted (unknown custom error)');
    err.data = ethers.id('PayVault__SessionInactive()').slice(0, 10);

    expect(toUserMessage(err)).toMatch(/not active/i);
    expect(toUserMessage(err)).toMatch(/passkey/i);
  });

  it('reads the selector out of the message when that is all that survived', () => {
    const err = new Error(
      'execution reverted (unknown custom error) (action="estimateGas", data="0x2d851bf2", ...)',
    );

    expect(extractRevertSelector(err)).toBe('0x2d851bf2');
    // 0x2d851bf2 is PayVault__Unauthorized().
    expect(toUserMessage(err)).toMatch(/passkey/i);
  });

  it('passes our own advice through untouched', () => {
    const err = new Error('Transfer amount ($100) exceeds session per-tx limit ($50).');

    expect(toUserMessage(err)).toBe('Transfer amount ($100) exceeds session per-tx limit ($50).');
  });

  it('keeps the decoded reason in the log line', () => {
    const err: any = new Error('boom');
    err.data = ethers.id('PayVault__SessionInactive()').slice(0, 10);

    expect(describeForLog(err)).toContain('boom');
    expect(describeForLog(err)).toContain('known');
  });
});

describe('sanitizeOutboundMessage', () => {
  it('strips a receipt that a missed catch block interpolated into chat copy', () => {
    const leaked =
      `⚠️ *Payment Failed*\n\nCould not escrow 100 USDT for @lordzenith0. ` +
      `No funds have left your wallet.\n\n_${ETHERS_CALL_EXCEPTION}_\n\nPlease try again.`;

    const safe = sanitizeOutboundMessage(leaked);

    expect(safe).toContain('Payment Failed');
    expect(safe).toContain('No funds have left your wallet.');
    expect(safe).not.toContain('CALL_EXCEPTION');
    expect(safe).not.toContain('0x306a3b9B6F60e46599005Fd4896Eb8f31D5B6F25');
  });

  it('leaves an ordinary success message — transaction hash and all — alone', () => {
    const receiptText =
      `✅ *Payment Sent!*\n\n🔗 *Tx Hash:* \`0x27d3863b961c9ed6ea2ff15e1b166a79695324d83fb73ac1e484c9ed69f96909\``;

    expect(sanitizeOutboundMessage(receiptText)).toBe(receiptText);
  });
});
