import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as crypto from 'crypto';
import { encodeCBOR } from '@levischuck/tiny-cbor';
import { decodeCredentialPublicKey } from '@simplewebauthn/server/helpers';

interface CredentialPayload {
  userId: string;
  publicKeyX: string;
  publicKeyY: string;
  walletAddress?: string;
}

interface DecryptedCredential extends CredentialPayload {
  id: string;
  counter: number;
}

interface CredentialRecord {
  id: string;
  userId: string;
  lookupHash: string | null;
  credentialId: string | null;
  encryptedPayload: string | null;
  wrappedDek: string | null;
  kekVersion: number;
  iv: string | null;
  authTag: string | null;
  publicKeyX: string | null;
  publicKeyY: string | null;
  counter: number;
}

@Injectable()
export class CredentialVaultService implements OnModuleInit {
  private readonly logger = new Logger(CredentialVaultService.name);
  private kekMap: Map<number, Buffer> = new Map();
  private currentKekVersion: number = 0;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    this.loadKeks();
  }

  private loadKeks() {
    const currentVersion = parseInt(process.env.CREDENTIAL_KEK_CURRENT || '0', 10);
    if (currentVersion === 0) {
      this.logger.warn(
        'CREDENTIAL_KEK_CURRENT not set. Credential vault running in legacy (unencrypted) mode. ' +
        'Set CREDENTIAL_KEK_CURRENT=1 and CREDENTIAL_KEK_V1=<64-char-hex> to enable encryption.'
      );
      return;
    }

    this.currentKekVersion = currentVersion;

    for (let v = 1; v <= currentVersion; v++) {
      const hexKey = process.env[`CREDENTIAL_KEK_V${v}`];
      if (hexKey) {
        if (hexKey.length !== 64) {
          throw new Error(`CREDENTIAL_KEK_V${v} must be a 64-character hex string (256-bit key)`);
        }
        this.kekMap.set(v, Buffer.from(hexKey, 'hex'));
        this.logger.log(`Loaded KEK version ${v}`);
      } else if (v === currentVersion) {
        throw new Error(`CREDENTIAL_KEK_V${v} is required when CREDENTIAL_KEK_CURRENT=${v}`);
      }
    }

    this.logger.log(`Credential vault initialized. Current KEK version: ${this.currentKekVersion}, loaded ${this.kekMap.size} key(s)`);
  }

  computeLookupHash(credentialId: string): string {
    return crypto.createHash('sha256').update(credentialId).digest('hex');
  }

  async storeCredential(credentialId: string, payload: CredentialPayload): Promise<string> {
    const lookupHash = this.computeLookupHash(credentialId);

    if (this.currentKekVersion === 0) {
      // Legacy mode: store plaintext (backwards-compatible during setup)
      const existing = await this.findByLookupOrCredentialId(lookupHash, credentialId);
      if (existing) {
        await this.prisma.$executeRaw`
          UPDATE "PasskeyCredential"
          SET "lookupHash" = ${lookupHash}, "publicKeyX" = ${payload.publicKeyX}, "publicKeyY" = ${payload.publicKeyY}
          WHERE "id" = ${existing.id}
        `;
        return existing.id;
      }

      const id = crypto.randomUUID();
      await this.prisma.$executeRaw`
        INSERT INTO "PasskeyCredential" ("id", "userId", "lookupHash", "credentialId", "publicKeyX", "publicKeyY", "kekVersion", "counter", "createdAt")
        VALUES (${id}, ${payload.userId}, ${lookupHash}, ${credentialId}, ${payload.publicKeyX}, ${payload.publicKeyY}, 0, 0, NOW())
      `;
      return id;
    }

    // Envelope encryption
    const { encryptedPayload, wrappedDek, iv, authTag } = this.encrypt(payload);

    const existing = await this.findByLookupOrCredentialId(lookupHash, credentialId);
    if (existing) {
      await this.prisma.$executeRaw`
        UPDATE "PasskeyCredential"
        SET "lookupHash" = ${lookupHash},
            "encryptedPayload" = ${encryptedPayload},
            "wrappedDek" = ${wrappedDek},
            "kekVersion" = ${this.currentKekVersion},
            "iv" = ${iv},
            "authTag" = ${authTag},
            "credentialId" = NULL,
            "publicKeyX" = NULL,
            "publicKeyY" = NULL
        WHERE "id" = ${existing.id}
      `;
      return existing.id;
    }

    const id = crypto.randomUUID();
    await this.prisma.$executeRaw`
      INSERT INTO "PasskeyCredential" ("id", "userId", "lookupHash", "encryptedPayload", "wrappedDek", "kekVersion", "iv", "authTag", "counter", "createdAt")
      VALUES (${id}, ${payload.userId}, ${lookupHash}, ${encryptedPayload}, ${wrappedDek}, ${this.currentKekVersion}, ${iv}, ${authTag}, 0, NOW())
    `;
    return id;
  }

  async lookupAndDecrypt(credentialId: string): Promise<DecryptedCredential | null> {
    const lookupHash = this.computeLookupHash(credentialId);
    const record = await this.findByLookupOrCredentialId(lookupHash, credentialId);

    if (!record) return null;

    // Legacy unencrypted record
    if (record.kekVersion === 0 || !record.encryptedPayload) {
      if (!record.publicKeyX || !record.publicKeyY) return null;
      return {
        id: record.id,
        userId: record.userId,
        publicKeyX: record.publicKeyX,
        publicKeyY: record.publicKeyY,
        walletAddress: undefined,
        counter: record.counter,
      };
    }

    // Envelope-encrypted record
    const payload = this.decrypt(
      record.encryptedPayload,
      record.wrappedDek!,
      record.kekVersion,
      record.iv!,
      record.authTag!,
    );

    if (!payload) return null;

    return {
      id: record.id,
      ...payload,
      counter: record.counter,
    };
  }

  async incrementCounter(credentialId: string): Promise<void> {
    const lookupHash = this.computeLookupHash(credentialId);
    await this.prisma.$executeRaw`
      UPDATE "PasskeyCredential"
      SET "counter" = "counter" + 1
      WHERE "lookupHash" = ${lookupHash} OR "credentialId" = ${credentialId}
    `;
  }

  /**
   * Rotate a single record's DEK wrapper from oldKekVersion to current.
   * Does NOT re-encrypt the payload — only re-wraps the DEK.
   */
  async rotateRecord(recordId: string): Promise<boolean> {
    const records: CredentialRecord[] = await this.prisma.$queryRaw`
      SELECT * FROM "PasskeyCredential" WHERE "id" = ${recordId}
    `;
    const record = records[0];
    if (!record || !record.wrappedDek || record.kekVersion >= this.currentKekVersion) {
      return false;
    }

    const oldKek = this.kekMap.get(record.kekVersion);
    if (!oldKek) {
      this.logger.error(`Cannot rotate record ${recordId}: KEK v${record.kekVersion} not loaded`);
      return false;
    }

    const dek = this.unwrapDek(record.wrappedDek, oldKek);
    if (!dek) return false;

    const currentKek = this.kekMap.get(this.currentKekVersion)!;
    const newWrappedDek = this.wrapDek(dek, currentKek);

    await this.prisma.$executeRaw`
      UPDATE "PasskeyCredential"
      SET "wrappedDek" = ${newWrappedDek}, "kekVersion" = ${this.currentKekVersion}
      WHERE "id" = ${recordId}
    `;

    return true;
  }

  /**
   * Batch rotate all records still on old KEK versions.
   * Call from a cron job or admin endpoint after deploying a new KEK.
   */
  async rotateAll(): Promise<{ rotated: number; failed: number }> {
    if (this.currentKekVersion === 0) return { rotated: 0, failed: 0 };

    const staleRecords: { id: string }[] = await this.prisma.$queryRaw`
      SELECT "id" FROM "PasskeyCredential"
      WHERE "kekVersion" < ${this.currentKekVersion} AND "encryptedPayload" IS NOT NULL
    `;

    let rotated = 0;
    let failed = 0;

    for (const { id } of staleRecords) {
      const success = await this.rotateRecord(id);
      if (success) rotated++;
      else failed++;
    }

    this.logger.log(`KEK rotation complete: ${rotated} rotated, ${failed} failed out of ${staleRecords.length} records`);
    return { rotated, failed };
  }

  /**
   * Migrate a legacy (kekVersion=0) record to envelope encryption.
   * Requires the credentialId to be available (from the auth flow).
   */
  async migrateLegacyRecord(credentialId: string): Promise<boolean> {
    if (this.currentKekVersion === 0) return false;

    const lookupHash = this.computeLookupHash(credentialId);
    const record = await this.findByLookupOrCredentialId(lookupHash, credentialId);

    if (!record || record.kekVersion > 0) return false;
    if (!record.publicKeyX || !record.publicKeyY) return false;

    // Look up wallet address for the user
    const users: { address: string | null }[] = await this.prisma.$queryRaw`
      SELECT sw."address" FROM "User" u
      LEFT JOIN "SmartWallet" sw ON sw."userId" = u."id"
      WHERE u."id" = ${record.userId}
      LIMIT 1
    `;

    const payload: CredentialPayload = {
      userId: record.userId,
      publicKeyX: record.publicKeyX,
      publicKeyY: record.publicKeyY,
      walletAddress: users[0]?.address || undefined,
    };

    const { encryptedPayload, wrappedDek, iv, authTag } = this.encrypt(payload);

    await this.prisma.$executeRaw`
      UPDATE "PasskeyCredential"
      SET "lookupHash" = ${lookupHash},
          "encryptedPayload" = ${encryptedPayload},
          "wrappedDek" = ${wrappedDek},
          "kekVersion" = ${this.currentKekVersion},
          "iv" = ${iv},
          "authTag" = ${authTag},
          "credentialId" = NULL,
          "publicKeyX" = NULL,
          "publicKeyY" = NULL
      WHERE "id" = ${record.id}
    `;

    this.logger.log(`Migrated legacy credential ${record.id} to envelope encryption`);
    return true;
  }

  /**
   * Reconstruct standards-compliant ES256 COSE keys for legacy passkeys.
   * This is idempotent and never changes users, wallets, balances, or credential IDs.
   */
  async migrateLegacyWebAuthnPublicKeys(options: { apply?: boolean; requireAllCompatible?: boolean } = {}) {
    const apply = options.apply === true;
    const requireAllCompatible = options.requireAllCompatible !== false;
    const records: Array<CredentialRecord & {
      credentialPublicKey: Buffer | null;
      username: string | null;
      walletAddress: string | null;
      label: string | null;
    }> = await this.prisma.$queryRaw`
      SELECT pc."id", pc."userId", pc."lookupHash", pc."credentialId", pc."encryptedPayload",
             pc."wrappedDek", pc."kekVersion", pc."iv", pc."authTag", pc."publicKeyX",
             pc."publicKeyY", pc."counter", pc."credentialPublicKey", pc."label",
             u."username", sw."address" AS "walletAddress"
      FROM "PasskeyCredential" pc
      JOIN "User" u ON u."id" = pc."userId"
      LEFT JOIN "SmartWallet" sw ON sw."userId" = u."id"
      WHERE pc."credentialPublicKey" IS NULL AND pc."revokedAt" IS NULL
      ORDER BY pc."createdAt" ASC
    `;

    const compatible: Array<{ id: string; lookupHash: string; cose: Buffer }> = [];
    const report: Array<{
      userId: string;
      username: string | null;
      walletAddress: string | null;
      status: 'compatible' | 'incompatible';
      reason?: string;
    }> = [];

    for (const record of records) {
      try {
        let publicKeyX = record.publicKeyX;
        let publicKeyY = record.publicKeyY;

        if ((!publicKeyX || !publicKeyY) && record.encryptedPayload) {
          if (!record.wrappedDek || !record.iv || !record.authTag || record.kekVersion <= 0) {
            throw new Error('encrypted credential metadata is incomplete');
          }
          const decrypted = this.decrypt(
            record.encryptedPayload,
            record.wrappedDek,
            record.kekVersion,
            record.iv,
            record.authTag,
          );
          publicKeyX = decrypted?.publicKeyX || null;
          publicKeyY = decrypted?.publicKeyY || null;
        }

        if (!publicKeyX || !publicKeyY) throw new Error('P-256 coordinates are missing');
        const x = this.coordinateToBytes(publicKeyX);
        const y = this.coordinateToBytes(publicKeyY);
        const cose = Buffer.from(encodeCBOR(new Map<number, any>([
          [1, 2],
          [3, -7],
          [-1, 1],
          [-2, x],
          [-3, y],
        ])));

        const decoded = decodeCredentialPublicKey(new Uint8Array(cose)) as Map<number, any>;
        if (decoded.get(1) !== 2 || decoded.get(3) !== -7 || decoded.get(-1) !== 1) {
          throw new Error('reconstructed COSE key failed validation');
        }

        const lookupHash = record.lookupHash ||
          (record.credentialId ? this.computeLookupHash(record.credentialId) : '');
        if (!lookupHash) throw new Error('credential lookup index is missing');

        compatible.push({ id: record.id, lookupHash, cose });
        report.push({
          userId: record.userId,
          username: record.username,
          walletAddress: record.walletAddress,
          status: 'compatible',
        });
      } catch (error: any) {
        report.push({
          userId: record.userId,
          username: record.username,
          walletAddress: record.walletAddress,
          status: 'incompatible',
          reason: error.message,
        });
      }
    }

    const incompatible = report.filter(item => item.status === 'incompatible').length;
    if (apply && requireAllCompatible && incompatible > 0) {
      return { mode: 'apply-aborted', candidates: records.length, compatible: compatible.length, incompatible, migrated: 0, report };
    }

    let migrated = 0;
    if (apply && compatible.length > 0) {
      await this.prisma.$transaction(async tx => {
        for (const item of compatible) {
          await tx.passkeyCredential.update({
            where: { id: item.id },
            data: {
              lookupHash: item.lookupHash,
              credentialPublicKey: item.cose,
              deviceType: 'unknown',
              backedUp: false,
              backupStateKnown: false,
              label: 'Legacy testnet passkey',
            },
          });
          migrated++;
        }
      });
    }

    return {
      mode: apply ? 'applied' : 'dry-run',
      candidates: records.length,
      compatible: compatible.length,
      incompatible,
      migrated,
      report,
    };
  }

  /**
   * Lazily upgrades one legacy credential during its first hardened login.
   * The caller must still verify the WebAuthn assertion after this returns.
   */
  async ensureWebAuthnPublicKey(credentialId: string): Promise<Buffer | null> {
    const lookupHash = this.computeLookupHash(credentialId);
    const existing = await this.prisma.passkeyCredential.findUnique({ where: { lookupHash } });
    if (existing?.credentialPublicKey) return Buffer.from(existing.credentialPublicKey);

    const legacy = await this.lookupAndDecrypt(credentialId);
    if (!legacy) return null;
    const x = this.coordinateToBytes(legacy.publicKeyX);
    const y = this.coordinateToBytes(legacy.publicKeyY);
    const cose = Buffer.from(encodeCBOR(new Map<number, any>([
      [1, 2],
      [3, -7],
      [-1, 1],
      [-2, x],
      [-3, y],
    ])));
    decodeCredentialPublicKey(new Uint8Array(cose));

    const updated = await this.prisma.passkeyCredential.updateMany({
      where: { id: legacy.id, credentialPublicKey: null, revokedAt: null },
      data: {
        lookupHash,
        credentialPublicKey: cose,
        deviceType: 'unknown',
        backedUp: false,
        backupStateKnown: false,
        label: existing?.label || 'Legacy testnet passkey',
      },
    });
    if (updated.count !== 1) {
      const raced = await this.prisma.passkeyCredential.findUnique({ where: { lookupHash } });
      return raced?.credentialPublicKey ? Buffer.from(raced.credentialPublicKey) : null;
    }
    this.logger.log(`Lazily prepared legacy credential ${legacy.id} for hardened WebAuthn verification`);
    return cose;
  }

  private coordinateToBytes(value: string): Uint8Array {
    const coordinate = BigInt(value);
    if (coordinate <= 0n || coordinate >= (1n << 256n)) {
      throw new Error('P-256 coordinate is out of range');
    }
    return new Uint8Array(Buffer.from(coordinate.toString(16).padStart(64, '0'), 'hex'));
  }

  // --- Internal helpers ---

  private async findByLookupOrCredentialId(lookupHash: string, credentialId: string): Promise<CredentialRecord | null> {
    const records: CredentialRecord[] = await this.prisma.$queryRaw`
      SELECT "id", "userId", "lookupHash", "credentialId", "encryptedPayload", "wrappedDek",
             "kekVersion", "iv", "authTag", "publicKeyX", "publicKeyY", "counter"
      FROM "PasskeyCredential"
      WHERE "lookupHash" = ${lookupHash} OR "credentialId" = ${credentialId}
      LIMIT 1
    `;
    return records[0] || null;
  }

  // --- Crypto primitives ---

  private encrypt(payload: CredentialPayload): { encryptedPayload: string; wrappedDek: string; iv: string; authTag: string } {
    const dek = crypto.randomBytes(32);
    const iv = crypto.randomBytes(12);

    const cipher = crypto.createCipheriv('aes-256-gcm', dek, iv);
    const plaintext = JSON.stringify(payload);
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');

    const currentKek = this.kekMap.get(this.currentKekVersion)!;
    const wrappedDek = this.wrapDek(dek, currentKek);

    return {
      encryptedPayload: encrypted,
      wrappedDek,
      iv: iv.toString('hex'),
      authTag,
    };
  }

  private decrypt(encryptedPayload: string, wrappedDek: string, kekVersion: number, ivHex: string, authTagHex: string): CredentialPayload | null {
    const kek = this.kekMap.get(kekVersion);
    if (!kek) {
      this.logger.error(`KEK version ${kekVersion} not loaded — cannot decrypt`);
      return null;
    }

    const dek = this.unwrapDek(wrappedDek, kek);
    if (!dek) return null;

    try {
      const iv = Buffer.from(ivHex, 'hex');
      const authTag = Buffer.from(authTagHex, 'hex');
      const decipher = crypto.createDecipheriv('aes-256-gcm', dek, iv);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encryptedPayload, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return JSON.parse(decrypted) as CredentialPayload;
    } catch (err: any) {
      this.logger.error(`Decryption failed: ${err.message}`);
      return null;
    }
  }

  private wrapDek(dek: Buffer, kek: Buffer): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', kek, iv);
    let wrapped = cipher.update(dek);
    wrapped = Buffer.concat([wrapped, cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${wrapped.toString('hex')}:${tag.toString('hex')}`;
  }

  private unwrapDek(wrappedDek: string, kek: Buffer): Buffer | null {
    try {
      const [ivHex, ciphertextHex, tagHex] = wrappedDek.split(':');
      const iv = Buffer.from(ivHex, 'hex');
      const ciphertext = Buffer.from(ciphertextHex, 'hex');
      const tag = Buffer.from(tagHex, 'hex');

      const decipher = crypto.createDecipheriv('aes-256-gcm', kek, iv);
      decipher.setAuthTag(tag);
      let unwrapped = decipher.update(ciphertext);
      unwrapped = Buffer.concat([unwrapped, decipher.final()]);
      return unwrapped;
    } catch (err: any) {
      this.logger.error(`DEK unwrap failed: ${err.message}`);
      return null;
    }
  }
}
