import { KMSClient, GetPublicKeyCommand, SignCommand } from '@aws-sdk/client-kms';
import { ethers } from 'ethers';

/**
 * An ethers signer backed by an AWS KMS secp256k1 key.
 *
 * The private key never enters this process. An attacker holding code execution
 * can still *request* signatures while they hold the instance's credentials,
 * but they cannot take the key with them, every request is a CloudTrail event,
 * and access is revoked by editing a key policy rather than by redeploying.
 *
 * Three details make KMS output usable as an Ethereum signature:
 *
 *   1. KMS returns DER, not the raw (r, s) pair ethers expects.
 *   2. ECDSA signatures are malleable — (r, s) and (r, n - s) are both valid.
 *      Ethereum rejects the high-s form (EIP-2), so s is normalised.
 *   3. KMS does not return a recovery id. It is found by trying both parities
 *      and keeping the one that recovers the address we know we are.
 */
export class KmsSigner extends ethers.AbstractSigner {
  private readonly client: KMSClient;
  private readonly keyId: string;
  private cachedAddress?: string;

  constructor(keyId: string, provider?: ethers.Provider | null, region?: string) {
    super(provider ?? null);
    this.keyId = keyId;
    this.client = new KMSClient(region ? { region } : {});
  }

  connect(provider: ethers.Provider | null): KmsSigner {
    const next = new KmsSigner(this.keyId, provider);
    next.cachedAddress = this.cachedAddress;
    return next;
  }

  /**
   * @dev Cached after the first call. The address is derived from the key's
   *      public half and cannot change for the lifetime of the key, so paying
   *      for a KMS round-trip on every transaction would be waste.
   */
  async getAddress(): Promise<string> {
    if (this.cachedAddress) return this.cachedAddress;

    const { PublicKey } = await this.client.send(
      new GetPublicKeyCommand({ KeyId: this.keyId }),
    );
    if (!PublicKey) throw new Error('KMS returned no public key for the relayer.');

    const spki = Buffer.from(PublicKey);
    const point = spki.subarray(spki.length - 65);
    if (point[0] !== 0x04) {
      throw new Error('Unexpected SPKI layout; expected an uncompressed EC point.');
    }

    this.cachedAddress = ethers.computeAddress('0x' + point.toString('hex'));
    return this.cachedAddress;
  }

  /** Signs a 32-byte digest, returning a canonical Ethereum signature. */
  private async signDigest(digest: string): Promise<ethers.Signature> {
    const { Signature: der } = await this.client.send(
      new SignCommand({
        KeyId: this.keyId,
        Message: Buffer.from(digest.slice(2), 'hex'),
        // The digest is already hashed; asking KMS to hash again would sign
        // the wrong thing entirely.
        MessageType: 'DIGEST',
        SigningAlgorithm: 'ECDSA_SHA_256',
      }),
    );
    if (!der) throw new Error('KMS returned no signature.');

    const { r, s } = decodeDerSignature(Buffer.from(der));
    const canonical = normaliseS(s);
    const address = await this.getAddress();

    // KMS omits the recovery id, so recover the address under both parities and
    // keep whichever matches. Exactly one can.
    for (const yParity of [0, 1] as const) {
      const candidate = ethers.Signature.from({
        r: '0x' + r.toString(16).padStart(64, '0'),
        s: '0x' + canonical.toString(16).padStart(64, '0'),
        yParity,
      });
      if (ethers.recoverAddress(digest, candidate).toLowerCase() === address.toLowerCase()) {
        return candidate;
      }
    }

    throw new Error('No recovery id reproduced the relayer address.');
  }

  async signTransaction(tx: ethers.TransactionRequest | ethers.Transaction): Promise<string> {
    let unsigned: ethers.Transaction;

    if (tx instanceof ethers.Transaction) {
      // `AbstractSigner.sendTransaction` — which every contract call goes
      // through — populates the request and hands us a `Transaction` instance.
      // Its fields live behind prototype getters, so `resolveProperties` sees
      // no own enumerable properties and returns `{}`. Signing that produced a
      // completely empty transaction (`0x02f84c8080…`), which the node rejected
      // as "invalid chain id for signer: have 0". `Transaction.from` reads
      // through the getters correctly.
      unsigned = ethers.Transaction.from(tx);
    } else {
      // A plain request may carry promises; settle them as Wallet does.
      const resolved = await ethers.resolveProperties(tx);
      if (resolved.from) {
        const address = await this.getAddress();
        if (resolved.from.toString().toLowerCase() !== address.toLowerCase()) {
          throw new Error('Transaction `from` does not match the relayer address.');
        }
        delete resolved.from;
      }
      unsigned = ethers.Transaction.from(resolved as any);
    }

    // A transaction with no chain id would be replayable on any chain, and is
    // the shape the empty-object bug produced — refuse it rather than sign it.
    if (unsigned.chainId === 0n) {
      throw new Error('Refusing to sign a transaction with no chain id.');
    }

    unsigned.signature = await this.signDigest(unsigned.unsignedHash);
    return unsigned.serialized;
  }

  async signMessage(message: string | Uint8Array): Promise<string> {
    const signature = await this.signDigest(ethers.hashMessage(message));
    return signature.serialized;
  }

  async signTypedData(
    domain: ethers.TypedDataDomain,
    types: Record<string, ethers.TypedDataField[]>,
    value: Record<string, any>,
  ): Promise<string> {
    const digest = ethers.TypedDataEncoder.hash(domain, types, value);
    const signature = await this.signDigest(digest);
    return signature.serialized;
  }
}

/**
 * Extracts (r, s) from a DER-encoded ECDSA signature.
 *
 * @dev DER INTEGERs are signed and minimally encoded, so a value whose high bit
 *      is set carries a leading zero byte and a small value is shorter than 32
 *      bytes. Reading fixed 32-byte windows would corrupt both cases.
 */
export function decodeDerSignature(der: Buffer): { r: bigint; s: bigint } {
  if (der[0] !== 0x30) throw new Error('Malformed DER signature: expected SEQUENCE.');

  let offset = 2;
  // Long-form length for the outer sequence.
  if (der[1] & 0x80) offset += der[1] & 0x7f;

  const readInteger = (): bigint => {
    if (der[offset] !== 0x02) throw new Error('Malformed DER signature: expected INTEGER.');
    const length = der[offset + 1];
    const value = der.subarray(offset + 2, offset + 2 + length);
    offset += 2 + length;
    return BigInt('0x' + value.toString('hex'));
  };

  return { r: readInteger(), s: readInteger() };
}

/** secp256k1 group order. */
const N = BigInt('0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141');

/**
 * Folds a high-s signature into its low-s equivalent.
 *
 * @dev Both are cryptographically valid, but Ethereum rejects high-s under
 *      EIP-2 to remove signature malleability. KMS has no opinion and returns
 *      whichever it computed.
 */
export function normaliseS(s: bigint): bigint {
  return s > N / 2n ? N - s : s;
}
