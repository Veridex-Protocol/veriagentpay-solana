import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface CandidateRecipient {
  handle: string;
  name: string;
  address: string;
}

export interface UserSessionState {
  chatId: string;
  userId?: string;
  step: 'IDLE' | 'AWAITING_RECIPIENT_SELECTION' | 'AWAITING_BIOMETRIC_AUTH' | 'AWAITING_MEMO';
  pendingIntent?: {
    action: 'PAY' | 'REQUEST' | 'SAVE' | 'SPLIT' | 'ENVELOPE';
    amount?: number;
    tokenSymbol?: string;
    recipientHandle?: string;
    candidateRecipients?: CandidateRecipient[];
    code?: string;
  };
  lastMessageId?: number;
  updatedAt: Date;
}

@Injectable()
export class BotSessionService {
  private readonly logger = new Logger(BotSessionService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Retrieves persistent session state for a Telegram chatId.
   */
  async getSession(chatId: string): Promise<UserSessionState> {
    try {
      const record = await this.prisma.userInsightCache.findUnique({
        where: { userId: `tg_session_${chatId}` },
      });

      if (record && record.reportMarkdown) {
        const parsed = JSON.parse(record.reportMarkdown);
        return {
          ...parsed,
          updatedAt: new Date(parsed.updatedAt),
        };
      }
    } catch (e: any) {
      this.logger.warn(`Failed to fetch session for ${chatId}: ${e.message}`);
    }

    return {
      chatId,
      step: 'IDLE',
      updatedAt: new Date(),
    };
  }

  /**
   * Saves or updates persistent session state for a Telegram chatId.
   */
  async saveSession(chatId: string, state: UserSessionState): Promise<void> {
    state.updatedAt = new Date();
    const serialized = JSON.stringify(state);
    const ttl = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h TTL

    try {
      await this.prisma.userInsightCache.upsert({
        where: { userId: `tg_session_${chatId}` },
        update: {
          reportMarkdown: serialized,
          expiresAt: ttl,
        },
        create: {
          userId: `tg_session_${chatId}`,
          reportMarkdown: serialized,
          expiresAt: ttl,
        },
      });
    } catch (e: any) {
      this.logger.error(`Failed to save session for ${chatId}: ${e.message}`);
    }
  }

  /**
   * Clears session state back to IDLE.
   */
  async clearSession(chatId: string): Promise<void> {
    await this.saveSession(chatId, {
      chatId,
      step: 'IDLE',
      updatedAt: new Date(),
    });
  }
}
