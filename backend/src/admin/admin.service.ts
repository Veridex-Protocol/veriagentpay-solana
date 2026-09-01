import {
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
  BadRequestException,
  HttpException,
  HttpStatus,
  OnModuleInit,
} from '@nestjs/common';
import { AdminRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NOTIFICATION_SERVICE, type UserNotifier } from '../common/service-contracts';
import { safeEqual } from '../common/crypto.util';
import * as crypto from 'crypto';


/**
 * Hashes an admin OTP.
 *
 * A six-digit code has a million possibilities, so a bare SHA-256 of it is
 * reversible by precomputation in milliseconds — a leaked database row yields
 * the live code immediately. scrypt with a per-code random salt makes each
 * candidate cost real work and defeats any shared table.
 *
 * Format is `scrypt$<salt-hex>$<hash-hex>`, self-describing so existing
 * SHA-256 rows are still recognised and rejected rather than mis-compared.
 *
 * @see docs/security-remaining-issues.md — BE-M-11
 */
const OTP_KDF = { N: 16384, r: 8, p: 1, keylen: 32 };

function hashOtp(code: string, salt?: Buffer): string {
  const s = salt ?? crypto.randomBytes(16);
  const derived = crypto.scryptSync(code, s, OTP_KDF.keylen, OTP_KDF);
  return `scrypt$${s.toString('hex')}$${derived.toString('hex')}`;
}

function verifyOtpHash(code: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') {
    // A legacy unsalted digest. Refused rather than compared: the code it
    // represents predates this change and a fresh one costs the admin one tap.
    return false;
  }
  try {
    const salt = Buffer.from(parts[1], 'hex');
    const storedHash = Buffer.from(parts[2], 'hex');
    const derived = crypto.scryptSync(code, salt, OTP_KDF.keylen, OTP_KDF);
    return derived.length === storedHash.length && crypto.timingSafeEqual(derived, storedHash);
  } catch {
    return false;
  }
}

@Injectable()
export class AdminService implements OnModuleInit {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    // Token, not class: same module cycle as splits — see `service-contracts.ts`.
    @Inject(NOTIFICATION_SERVICE)
    private readonly unifiedNotificationService: UserNotifier,
    // Injected rather than `new PrismaClient()`: a second client opens its own
    // connection pool per process (SEC-052).
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit() {
    await this.seedSuperAdmin();
  }

  /**
   * Seeds default Super Admin profile (Emmanuel) on startup
   */
  private async seedSuperAdmin() {
    try {
      // Read from configuration. These were hardcoded — a real person's email,
      // Telegram handle, chat id and wallet — which committed PII to the
      // repository and pinned the super-admin to one identity that could not be
      // changed without a code deploy. Absent configuration means no seeding.
      const email = process.env.SUPER_ADMIN_EMAIL?.toLowerCase().trim();
      const telegramHandle = process.env.SUPER_ADMIN_TELEGRAM_HANDLE;
      const telegramChatId = process.env.SUPER_ADMIN_TELEGRAM_CHAT_ID;
      const walletAddress = process.env.SUPER_ADMIN_WALLET_ADDRESS;

      if (!email) {
        this.logger.log('SUPER_ADMIN_EMAIL is unset; skipping super-admin seeding.');
        return;
      }

      let admin = await this.prisma.admin.findUnique({ where: { email } });
      if (!admin) {
        admin = await this.prisma.admin.create({
          data: {
            name: process.env.SUPER_ADMIN_NAME || 'Super Admin',
            email,
            role: AdminRole.SUPER_ADMIN,
          },
        });
        this.logger.log(`Seeded Super Admin profile for [${email}]`);
      }

      // Seed identifiers
      const identifiers = [
        { platform: 'email', value: email },
        { platform: 'telegram', value: telegramHandle },
        { platform: 'telegram_chat_id', value: telegramChatId },
        { platform: 'wallet', value: walletAddress },
      ];

      for (const item of identifiers) {
        const existing = await this.prisma.adminIdentifier.findFirst({
          where: { platform: item.platform, value: item.value.toLowerCase() },
        });
        if (!existing) {
          await this.prisma.adminIdentifier.create({
            data: {
              adminId: admin.id,
              platform: item.platform,
              value: item.value.toLowerCase(),
            },
          });
        }
      }
    } catch (e: any) {
      this.logger.warn(`Super Admin seeding notice: ${e.message}`);
    }
  }

  /**
   * Verify if identifier (email / wallet / telegram handle) is whitelisted for admin access
   */
  /**
   * Whether `value` identifies a provisioned administrator.
   *
   * The `AdminIdentifier` table is the sole source of truth. The previous
   * implementation short-circuited on five hardcoded identifiers committed to
   * the repository, so anyone who read this file held a working admin
   * credential — and, combined with a login path that verified no credential at
   * all, that was full administrative access.
   *
   * Access is preserved because {seedSuperAdmin} already writes four of the
   * five legacy identifiers (email, telegram handle, telegram chat id, wallet)
   * into `AdminIdentifier` on startup. The fifth, `admin@veriagent.pay`, is
   * deliberately NOT carried over: a generic shared mailbox should not be an
   * administrative credential.
   *
   * @see docs/audit/11th-august-2026-1.md — SEC-004
   */
  async isWhitelisted(platform: string, value: string): Promise<boolean> {
    if (!value) return false;
    const cleanValue = value.toLowerCase().trim();

    try {
      const match = await this.prisma.adminIdentifier.findFirst({
        where: { value: cleanValue },
      });
      return !!match;
    } catch (e: any) {
      // Fail closed: a database error must deny access, not grant it.
      this.logger.error(`Admin whitelist lookup failed for "${cleanValue}": ${e.message}`);
      return false;
    }
  }

  /**
   * Generates a 6-digit OTP code and sends it to the admin's Telegram handle
   */
  async requestOtp(identifier: string): Promise<{ success: boolean; message: string }> {
    const cleanIdentifier = identifier.toLowerCase().trim();

    const isAllowed = await this.isWhitelisted('email', cleanIdentifier);
    if (!isAllowed) {
      throw new UnauthorizedException('Access Denied: Account not whitelisted for admin access');
    }

    // Throttle issuance. Without this, an attacker floods the admin's Telegram
    // and — more importantly — puts many simultaneously-valid codes into a
    // 10^6 space, multiplying the hit rate of a guessing attack by the number
    // of outstanding codes.
    const recentCount = await this.prisma.adminOtp.count({
      where: {
        identifier: cleanIdentifier,
        createdAt: { gte: new Date(Date.now() - 15 * 60 * 1000) },
      },
    });
    if (recentCount >= 3) {
      throw new HttpException(
        'Too many verification code requests. Try again in a few minutes.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Exactly one code may be live at a time.
    await this.prisma.adminOtp.deleteMany({ where: { identifier: cleanIdentifier } });

    // CSPRNG. `Math.random()` is a xorshift128+ PRNG whose state is recoverable
    // from observed outputs, which makes subsequent codes predictable.
    const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
    const codeHash = hashOtp(code);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    await this.prisma.adminOtp.create({
      data: {
        identifier: cleanIdentifier,
        codeHash,
        attempts: 0,
        expiresAt,
      },
    });

    // Telegram Bot notification
    const telegramChatId = process.env.ADMIN_TELEGRAM_CHAT_ID || process.env.ADMIN_TELEGRAM_ID;
    const botToken = process.env.TELEGRAM_BOT_TOKEN;

    let telegramSent = false;
    let telegramError = '';

    if (!botToken) {
      this.logger.error('TELEGRAM_BOT_TOKEN not configured in environment');
      telegramError = 'Telegram bot token not configured';
    } else if (!telegramChatId) {
      this.logger.error('ADMIN_TELEGRAM_CHAT_ID not configured in environment');
      telegramError = 'Telegram chat ID not configured';
    } else {
      try {
        const text = `🔐 *VeriAgent Admin OTP Verification Code*\n\n` +
                     `Your 6-digit login verification code is: \`${code}\`\n\n` +
                     `• Identifier: \`${identifier}\`\n` +
                     `• Expires in: 10 minutes\n\n` +
                     `⚠️ If you did not request this login code, please alert security immediately.`;

        const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: telegramChatId,
            text,
            parse_mode: 'Markdown',
          }),
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(`Telegram API error: ${result.description || response.statusText}`);
        }

        this.logger.log(`✅ Sent 2FA OTP code via Telegram to Chat ID [${telegramChatId}] for [${identifier}]`);
        telegramSent = true;
      } catch (err: any) {
        this.logger.error(`❌ Failed to deliver Telegram OTP: ${err.message}`);
        telegramError = err.message;
      }
    }

    // Return detailed status
    if (telegramSent) {
      return {
        success: true,
        message: `A 6-digit OTP verification code has been sent to your registered Telegram account (Chat ID: ${telegramChatId}).`,
      };
    } else {
      // Still save OTP to DB for testing, but warn about delivery failure
      // The code is deliberately absent. Logging it on the delivery-failure
      // path put valid admin OTPs into Loki, where they outlive their own TTL
      // and are readable by anyone with log access.
      //
      // @see docs/security-remediation-plan.md — BE-H-06
      this.logger.warn(
        `⚠️  OTP generated but Telegram delivery failed. Error: ${telegramError}. ` +
          'The code is not logged; the admin must request a new one.',
      );
      return {
        success: true,
        message: `OTP generated but Telegram delivery failed: ${telegramError}. [DEV MODE: Check backend logs for the OTP code]`,
      };
    }
  }

  /**
   * Verifies 6-digit Telegram OTP code
   */
  /**
   * Verifies a 6-digit code.
   *
   * The lookup is by identifier rather than by `(identifier, codeHash)` so that
   * a wrong guess still finds the record and can be counted against it. Keying
   * the query on the hash meant a failed attempt simply returned no row, which
   * is why unlimited guessing was possible against a 10^6 space.
   *
   * @see docs/audit/11th-august-2026-1.md — SEC-015
   */
  async verifyOtp(identifier: string, code: string): Promise<boolean> {
    if (!identifier || !code) return false;
    const cleanIdentifier = identifier.toLowerCase().trim();

    const otp = await this.prisma.adminOtp.findFirst({
      where: {
        identifier: cleanIdentifier,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otp) return false;

    if (otp.attempts >= 5) {
      await this.prisma.adminOtp.delete({ where: { id: otp.id } }).catch(() => {});
      this.logger.warn(`OTP attempt limit reached for ${cleanIdentifier}; code invalidated`);
      return false;
    }

    const matches = verifyOtpHash(code, otp.codeHash);

    if (!matches) {
      await this.prisma.adminOtp
        .update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } })
        .catch(() => {});
      return false;
    }

    // Delete used OTP
    await this.prisma.adminOtp.delete({ where: { id: otp.id } }).catch(() => {});
    return true;
  }

  async getAdminByEmail(email: string) {
    const cleanEmail = email.toLowerCase().trim();
    const admin = await this.prisma.admin.findFirst({
      where: {
        OR: [
          { email: cleanEmail },
          { identifiers: { some: { value: cleanEmail } } },
        ],
      },
      include: { identifiers: true },
    });

    // Null when there is no such admin. This previously returned a synthetic
    // SUPER_ADMIN for *any* unrecognised identifier, which made every
    // `if (!admin) throw` guard in the auth controller unreachable and resolved
    // unknown accounts to full privileges. Provision admins in the database.
    //
    // @see docs/security-remediation-plan.md — BE-C-01
    return admin;
  }

  async getAllAdmins() {
    try {
      const dbAdmins = await this.prisma.admin.findMany({
        include: { identifiers: true },
        orderBy: { createdAt: 'desc' },
      });
      return dbAdmins;
    } catch (err: any) {
      // Surface the failure rather than substituting a fabricated admin list.
      // This used to fall through to a hardcoded super-admin containing real
      // PII, so a database outage silently produced a plausible-looking screen
      // naming an account that may not exist.
      //
      // @see docs/security-remediation-plan.md — BE-C-01
      this.logger.error(`Failed to list admins: ${err.message}`);
      throw new InternalServerErrorException('Could not load admin accounts');
    }
  }

  async addAdminIdentifier(dto: { name?: string; email?: string; platform: string; value: string; role?: AdminRole }) {
    if (!dto.platform || !dto.value) throw new BadRequestException('Platform and value required');
    const cleanValue = dto.value.toLowerCase().trim();

    let admin = dto.email ? await this.prisma.admin.findUnique({ where: { email: dto.email } }) : null;
    if (!admin) {
      admin = await this.prisma.admin.create({
        data: {
          name: dto.name || `Admin ${cleanValue}`,
          email: dto.email || null,
          role: dto.role || AdminRole.SUPPORT,
        },
      });
    }

    await this.prisma.adminIdentifier.create({
      data: {
        adminId: admin.id,
        platform: dto.platform.toLowerCase(),
        value: cleanValue,
      },
    });

    return { success: true, adminId: admin.id };
  }

  async sendAdminAlert(dto: { userId: string; title: string; message: string; priority?: string }) {
    await this.unifiedNotificationService.notifyUser({
      userId: dto.userId,
      type: 'admin_alert',
      title: dto.title,
      body: dto.message,
    });
    return { success: true, userId: dto.userId };
  }

  async broadcastAlert(dto: { title: string; message: string; userIds?: string[] }) {
    const targetUsers = dto.userIds && dto.userIds.length > 0
      ? dto.userIds
      : (await this.prisma.user.findMany({ select: { id: true } })).map((u) => u.id);

    for (const userId of targetUsers) {
      await this.unifiedNotificationService.notifyUser({
        userId,
        type: 'admin_alert',
        title: dto.title,
        body: dto.message,
      }).catch(() => {});
    }

    return { success: true, broadcastCount: targetUsers.length };
  }
}
