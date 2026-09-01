import { Injectable, ConflictException, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { Contact, UserActivityAction } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityService } from '../activity/activity.service';

export interface CreateContactDto {
  name: string;
  platform: 'telegram' | 'whatsapp' | 'discord' | 'slack' | 'phone';
  identifier: string;
  walletAddress?: string;
}

export interface UpdateContactDto {
  name?: string;
  identifier?: string;
  platform?: 'telegram' | 'whatsapp' | 'discord' | 'slack' | 'phone';
  walletAddress?: string;
}

export interface ContactSuggestion {
  name: string;
  identifier: string;
  platform: string;
  walletAddress: string | null;
  sendCount: number;
  lastSentAt: Date | null;
}

@Injectable()
export class ContactsService {
  private readonly logger = new Logger(ContactsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly activityService?: ActivityService,
  ) {}

  private normalizeIdentifier(identifier: string, platform: string) {
    const trimmed = identifier.trim();
    const handle = trimmed.replace(/^@/, '');
    // Telegram handles are identity data, not display text. Preserve their
    // original casing so two distinct, case-sensitive Telegram identities do
    // not collapse into one address-book contact.
    if (platform === 'phone') return trimmed;
    if (platform === 'telegram') return handle;
    return handle.toLowerCase();
  }

  private normalizeWalletAddress(walletAddress?: string) {
    return walletAddress?.trim().toLowerCase() || undefined;
  }

  /**
   * A recipient can have more than one platform handle, but it is still one
   * payment contact once those handles resolve to the same smart wallet.  Keep
   * the richest (non-web) handle as the canonical row and combine its usage.
   */
  private deduplicateRecipients<T extends Pick<Contact, 'walletAddress' | 'identifier' | 'platform' | 'sendCount' | 'lastSentAt'>>(contacts: T[]): T[] {
    const recipients = new Map<string, T>();

    for (const contact of contacts) {
      const key = contact.walletAddress
        ? `wallet:${contact.walletAddress.toLowerCase()}`
        : `handle:${contact.platform}:${this.normalizeIdentifier(contact.identifier, contact.platform)}`;
      const existing = recipients.get(key);
      if (!existing) {
        recipients.set(key, { ...contact });
        continue;
      }

      const useIncoming = existing.platform === 'web' && contact.platform !== 'web';
      const canonical = useIncoming ? contact : existing;
      recipients.set(key, {
        ...canonical,
        sendCount: existing.sendCount + contact.sendCount,
        lastSentAt: (!existing.lastSentAt || (contact.lastSentAt && contact.lastSentAt > existing.lastSentAt))
          ? contact.lastSentAt
          : existing.lastSentAt,
      });
    }

    return [...recipients.values()];
  }

  async findAllForUser(userId: string) {
    const contacts = await this.prisma.contact.findMany({
      where: { userId },
      orderBy: [{ lastSentAt: 'desc' }, { createdAt: 'asc' }],
    });
    return this.deduplicateRecipients(contacts).sort((a, b) => a.name.localeCompare(b.name));
  }

  async create(userId: string, dto: CreateContactDto) {
    if (!dto.name || !dto.name.trim()) {
      throw new BadRequestException('Contact name is required');
    }
    if (!dto.identifier || !dto.identifier.trim()) {
      throw new BadRequestException('Platform identifier is required');
    }

    const identifier = this.normalizeIdentifier(dto.identifier, dto.platform);
    const existing = await this.prisma.contact.findFirst({
      where: {
        userId,
        platform: dto.platform,
        identifier,
      },
    });

    const walletAddress = this.normalizeWalletAddress(dto.walletAddress);
    const sameWallet = walletAddress
      ? await this.prisma.contact.findFirst({
        where: { userId, walletAddress },
      })
      : null;

    if (existing || sameWallet) {
      throw new ConflictException(`Contact with ${dto.platform} identifier "${dto.identifier}" already exists.`);
    }

    const contact = await this.prisma.contact.create({
      data: {
        userId,
        name: dto.name.trim(),
        platform: dto.platform,
        identifier,
        walletAddress: walletAddress || null,
      },
    });

    await this.activityService?.record({
      userIdentifier: userId,
      action: UserActivityAction.CONTACT_ADDED,
      metadata: { contactId: contact.id, name: contact.name, platform: contact.platform },
    }).catch(() => {});

    return contact;
  }

  async update(userId: string, id: string, dto: UpdateContactDto) {
    return await this.prisma.contact.update({
      where: { id },
      data: {
        ...(dto.name ? { name: dto.name.trim() } : {}),
        ...(dto.identifier ? { identifier: dto.identifier.trim() } : {}),
        ...(dto.platform ? { platform: dto.platform } : {}),
        ...(dto.walletAddress !== undefined ? { walletAddress: dto.walletAddress } : {}),
      },
    });
  }

  async remove(userId: string, id: string) {
    try {
      await this.prisma.contact.deleteMany({
        where: { id, userId },
      });
      return { success: true };
    } catch (e) {
      return { success: true };
    }
  }

  /**
   * Auto-creates or updates a contact after a successful payment.
   * Increments sendCount and updates lastSentAt for frequency tracking.
   */
  async upsertAfterPayment(
    userId: string,
    platform: string,
    identifier: string,
    walletAddress?: string,
    displayName?: string,
  ): Promise<void> {
    const cleanIdentifier = this.normalizeIdentifier(identifier, platform);
    const cleanWalletAddress = this.normalizeWalletAddress(walletAddress);
    if (!cleanIdentifier) return;

    try {
      // A verified wallet wins over platform metadata. This prevents a web
      // send and a Telegram send to the same recipient from producing two
      // address-book entries.
      const matchingWallet = cleanWalletAddress
        ? await this.prisma.contact.findFirst({
          where: { userId, walletAddress: cleanWalletAddress },
          orderBy: { createdAt: 'asc' },
        })
        : null;
      const matchingIdentifier = await this.prisma.contact.findFirst({
        where: {
          userId,
          platform,
          identifier: cleanIdentifier,
        },
      });
      const existing = matchingWallet || matchingIdentifier;

      if (existing) {
        await this.prisma.contact.update({
          where: { id: existing.id },
          data: {
            sendCount: { increment: 1 },
            lastSentAt: new Date(),
            ...(cleanWalletAddress && !existing.walletAddress ? { walletAddress: cleanWalletAddress } : {}),
          },
        });
      } else {
        await this.prisma.contact.create({
          data: {
            userId,
            name: displayName || cleanIdentifier,
            platform,
            identifier: cleanIdentifier,
            walletAddress: cleanWalletAddress || null,
            sendCount: 1,
            lastSentAt: new Date(),
          },
        });
      }
    } catch (e: any) {
      this.logger.warn(`Failed to upsert contact after payment: ${e.message}`);
    }
  }

  /**
   * Returns the user's most frequently sent contacts + last sent contact,
   * for use as suggestions in the payment flow.
   */
  async getPaySuggestions(userId: string, limit = 5): Promise<ContactSuggestion[]> {
    try {
      const contacts = await this.prisma.contact.findMany({
        where: {
          userId,
          sendCount: { gt: 0 },
        },
        orderBy: [
          { sendCount: 'desc' },
          { lastSentAt: 'desc' },
        ],
        take: limit,
      });

      return this.deduplicateRecipients(contacts).map((c) => ({
        name: c.name,
        identifier: c.identifier,
        platform: c.platform,
        walletAddress: c.walletAddress,
        sendCount: c.sendCount,
        lastSentAt: c.lastSentAt,
      }));
    } catch (e: any) {
      this.logger.warn(`Failed to fetch pay suggestions: ${e.message}`);
      return [];
    }
  }
}
