/**
 * Imports an existing relayer private key into AWS KMS (BYOK).
 *
 * Why import rather than let KMS generate
 *
 *   A KMS-generated signing key can never leave AWS. That is stronger, but it
 *   also means the relayer address is fixed to one provider forever — and the
 *   address is not something we can change cheaply: `PayVaultFactory.deployer`
 *   is immutable, and every vault carries `owner = relayer`. Moving providers
 *   would mean a new factory and a passkey-authorised ownership rotation on
 *   every existing vault.
 *
 *   Importing keeps a copy of the material outside AWS, so the same key can be
 *   imported elsewhere later and the address survives. The cost is that the
 *   material exists outside an HSM at least once, so it must be generated and
 *   stored accordingly.
 *
 * Handling
 *
 *   The key is read from an environment variable, never an argument — argv is
 *   visible to other processes and lands in shell history. Wrapped material is
 *   written to a 0600 temp directory and removed in a `finally`. Nothing is
 *   logged but the derived address, which is public.
 *
 * Usage
 *
 *   RELAYER_PRIVATE_KEY_TO_IMPORT=0x... \
 *   AWS_PROFILE=default \
 *     bun run scripts/import-relayer-key-kms.ts --env testnet
 *
 *   Add --create to mint the CMK as part of the run; omit it to import into an
 *   existing key by alias. Re-running against a key that already holds material
 *   fails: KMS refuses a second import unless the material is deleted first.
 */

import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ethers } from 'ethers';

// ── minimal DER, because Bun's crypto rejects secp256k1 JWKs ──

const derLen = (n: number): Buffer =>
  n < 128
    ? Buffer.from([n])
    : (() => {
        const bytes: number[] = [];
        let v = n;
        while (v > 0) {
          bytes.unshift(v & 0xff);
          v >>= 8;
        }
        return Buffer.from([0x80 | bytes.length, ...bytes]);
      })();

const tlv = (tag: number, value: Buffer): Buffer =>
  Buffer.concat([Buffer.from([tag]), derLen(value.length), value]);

const OID_EC_PUBLIC_KEY = Buffer.from('06072a8648ce3d0201', 'hex');
const OID_SECP256K1 = Buffer.from('06052b8104000a', 'hex');

/** PKCS#8 PrivateKeyInfo wrapping a SEC1 ECPrivateKey — what KMS expects. */
function pkcs8FromPrivateKey(privHex: string): Buffer {
  const d = Buffer.from(privHex.replace(/^0x/, ''), 'hex');
  if (d.length !== 32) throw new Error('Relayer private key must be 32 bytes.');

  const publicPoint = Buffer.from(
    ethers.SigningKey.computePublicKey(privHex, false).slice(2),
    'hex',
  );

  const ecPrivateKey = tlv(
    0x30,
    Buffer.concat([
      tlv(0x02, Buffer.from([0x01])),
      tlv(0x04, d),
      // [1] EXPLICIT BIT STRING; the leading 0x00 is the unused-bit count.
      tlv(0xa1, tlv(0x03, Buffer.concat([Buffer.from([0x00]), publicPoint]))),
    ]),
  );

  return tlv(
    0x30,
    Buffer.concat([
      tlv(0x02, Buffer.from([0x00])),
      tlv(0x30, Buffer.concat([OID_EC_PUBLIC_KEY, OID_SECP256K1])),
      tlv(0x04, ecPrivateKey),
    ]),
  );
}

const aws = (args: string[], opts: { input?: Buffer } = {}): string =>
  execFileSync('aws', args, { maxBuffer: 1 << 24, ...opts }).toString();

/** The Ethereum address KMS will sign as, derived from its own public key. */
export function addressFromKmsPublicKey(spkiBase64: string): string {
  const spki = Buffer.from(spkiBase64, 'base64');
  const point = spki.subarray(spki.length - 65);
  if (point[0] !== 0x04) {
    throw new Error('Unexpected SPKI layout; expected an uncompressed EC point.');
  }
  return ethers.computeAddress('0x' + point.toString('hex'));
}

async function main() {
  const args = process.argv.slice(2);
  const flag = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : '';
  };

  const environment = flag('--env');
  if (!['testnet', 'mainnet'].includes(environment)) {
    throw new Error('Pass --env testnet or --env mainnet.');
  }

  // Two roles share this flow because both are secp256k1 signing keys whose
  // addresses are load-bearing: the relayer's is `PayVaultFactory.deployer`
  // (immutable), and the price signer's is baked into `SignedPriceOracle` at
  // construction. Both are imported rather than generated so the address
  // survives a move between providers.
  const ROLES: Record<string, { alias: string; envVar: string }> = {
    relayer: { alias: 'relayer-signing', envVar: 'RELAYER_PRIVATE_KEY_TO_IMPORT' },
    'price-signer': { alias: 'price-signer', envVar: 'PRICE_SIGNER_PRIVATE_KEY_TO_IMPORT' },
  };

  const role = flag('--role') || 'relayer';
  const spec = ROLES[role];
  if (!spec) {
    throw new Error(`Unknown --role ${role}. Use ${Object.keys(ROLES).join(' or ')}.`);
  }

  const privHex = process.env[spec.envVar];
  if (!privHex || !/^0x[0-9a-fA-F]{64}$/.test(privHex)) {
    throw new Error(
      `Set ${spec.envVar} to a 0x-prefixed 32-byte hex key. ` +
        'Pass it through the environment, never as an argument.',
    );
  }

  const alias = `alias/veriagent-pay/${spec.alias}-${environment}`;
  const expectedAddress = new ethers.Wallet(privHex).address;

  let keyId: string;
  if (args.includes('--create')) {
    keyId = aws([
      'kms', 'create-key',
      '--origin', 'EXTERNAL',
      '--key-spec', 'ECC_SECG_P256K1',
      '--key-usage', 'SIGN_VERIFY',
      '--description', `VeriAgent Pay ${role} (${environment}, imported)`,
      '--tags', `TagKey=Project,TagValue=veriagent-pay`,
      `TagKey=Environment,TagValue=${environment}`,
      `TagKey=Purpose,TagValue=${spec.alias}`,
      '--query', 'KeyMetadata.KeyId', '--output', 'text',
    ]).trim();
    aws(['kms', 'create-alias', '--alias-name', alias, '--target-key-id', keyId]);
    console.log(`Created ${alias}`);
  } else {
    keyId = aws([
      'kms', 'describe-key', '--key-id', alias,
      '--query', 'KeyMetadata.KeyId', '--output', 'text',
    ]).trim();
  }

  const params = JSON.parse(
    aws([
      'kms', 'get-parameters-for-import', '--key-id', keyId,
      '--wrapping-algorithm', 'RSAES_OAEP_SHA_256',
      '--wrapping-key-spec', 'RSA_4096', '--output', 'json',
    ]),
  );

  const wrapped = crypto.publicEncrypt(
    {
      key: crypto.createPublicKey({
        key: Buffer.from(params.PublicKey, 'base64'),
        format: 'der',
        type: 'spki',
      }),
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    pkcs8FromPrivateKey(privHex),
  );

  // 0600 temp files: the CLI needs paths, and wrapped material is still
  // material. Removed unconditionally below.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'veriagent-kms-'));
  try {
    const materialPath = path.join(dir, 'material.bin');
    const tokenPath = path.join(dir, 'token.bin');
    fs.writeFileSync(materialPath, wrapped, { mode: 0o600 });
    fs.writeFileSync(tokenPath, Buffer.from(params.ImportToken, 'base64'), { mode: 0o600 });

    aws([
      'kms', 'import-key-material', '--key-id', keyId,
      '--encrypted-key-material', `fileb://${materialPath}`,
      '--import-token', `fileb://${tokenPath}`,
      '--expiration-model', 'KEY_MATERIAL_DOES_NOT_EXPIRE',
    ]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // The only assertion that matters: KMS must sign as the address the rest of
  // the system already trusts. A mismatch means the wrong key went in.
  const derived = addressFromKmsPublicKey(
    aws(['kms', 'get-public-key', '--key-id', keyId, '--query', 'PublicKey', '--output', 'text']).trim(),
  );
  if (derived.toLowerCase() !== expectedAddress.toLowerCase()) {
    throw new Error(`Address mismatch: KMS derived ${derived}, expected ${expectedAddress}.`);
  }

  const envKey = role === 'relayer' ? 'RELAYER_KMS_KEY_ID' : 'PRICE_SIGNER_KMS_KEY_ID';
  console.log(`Imported into ${alias}`);
  console.log(`${role} address: ${derived}`);
  console.log(`Set ${envKey}=${alias}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
