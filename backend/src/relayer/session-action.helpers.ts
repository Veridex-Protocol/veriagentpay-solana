import { ethers } from 'ethers';

/**
 * Correct construction of the two inputs every session-delegated action needs.
 *
 * Both were being got wrong independently at each call site, and both fail the
 * same way: the transaction reverts on-chain while the caller's `try` block
 * sees no error and the database records success.
 *
 * @see docs/security-remediation-plan.md — BE-C-04
 */

/** Action type byte for an arbitrary contract call. */
const ACTION_EXECUTE = 2;

const VAULT_NONCE_ABI = [
  'function localSessionNonces(bytes32 sessionKeyHash) view returns (uint256)',
];

/** The session key hash the registry and vault index grants by. */
export function sessionKeyHashOf(sessionPrivateKey: string): string {
  return ethers.keccak256(
    ethers.solidityPacked(['address'], [new ethers.Wallet(sessionPrivateKey).address]),
  );
}

/**
 * The vault's next expected nonce for this session key.
 *
 * @dev `PayVault.executeWithLocalSession` binds the nonce into the signed
 *      digest and rejects a replayed one. Passing anything else — a timestamp,
 *      a counter kept off-chain — produces a signature over a digest the vault
 *      will not reconstruct, so the call reverts every time.
 *
 *      Returns 0 when the vault is not yet deployed, which is the correct first
 *      nonce for a counterfactual account.
 */
export async function readSessionNonce(
  provider: ethers.Provider,
  vaultAddress: string,
  sessionPrivateKey: string,
): Promise<number> {
  try {
    const vault = new ethers.Contract(vaultAddress, VAULT_NONCE_ABI, provider);
    return Number(await vault.localSessionNonces(sessionKeyHashOf(sessionPrivateKey)));
  } catch {
    return 0;
  }
}

/**
 * ABI-encode an ACTION_EXECUTE payload.
 *
 * Layout, per `PayVault._executeCall`:
 *   [type(1)][target(32)][value(32)][dataLen(4)][data(variable)]
 *
 * @dev `ethers.solidityPacked(['uint8','address','bytes'], …)` does **not**
 *      produce this: it packs the address to 20 bytes and omits both the value
 *      word and the length prefix, so the vault reads a target spliced out of
 *      the wrong offsets. It reverts, or worse decodes to an unintended call.
 */
export function buildExecutePayload(
  target: string,
  calldata: string,
  value: bigint = 0n,
): string {
  const dataBytes = ethers.getBytes(calldata);
  const dataLen = Buffer.alloc(4);
  dataLen.writeUInt32BE(dataBytes.length, 0);

  return ethers.hexlify(
    ethers.concat([
      Buffer.from([ACTION_EXECUTE]),
      ethers.zeroPadValue(target, 32),
      ethers.zeroPadValue(ethers.toBeHex(value), 32),
      dataLen,
      dataBytes,
    ]),
  );
}
