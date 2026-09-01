import { Injectable, Logger, Optional } from '@nestjs/common';
import { RedisService } from '../core/redis.service';

export type ConversationStep =
  | 'AWAITING_DEPOSIT_AMOUNT'
  | 'AWAITING_REQUEST_AMOUNT'
  | 'AWAITING_REQUEST_PURPOSE'
  | 'AWAITING_INVITE_MEMBERS'
  | 'AWAITING_VAULT_DEPOSIT_AMOUNT'
  | 'AWAITING_VAULT_WITHDRAW_AMOUNT'
  | 'AWAITING_POOL_CREATE_NAME'
  | 'AWAITING_POOL_CREATE_TOKEN'
  | 'AWAITING_POOL_CREATE_TARGET'
  | 'AWAITING_POOL_REPAY_AMOUNT'
  | 'AWAITING_CUSTOM_TOKEN_ADDRESS';

export interface ConversationState {
  step: ConversationStep;
  poolId?: string;
  poolName?: string;
  poolToken?: string;
  loanId?: string;
  amount?: number;
  data?: Record<string, any>;
  /** Message IDs to clean up after the flow completes */
  messageIdsToCleanup: (number | string)[];
  /** Timestamp for auto-expiry */
  expiresAt: number;
}

const STATE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const CLEANUP_INTERVAL_MS = 60 * 1000; // 1 minute

@Injectable()
export class ConversationStateService {
  private readonly logger = new Logger(ConversationStateService.name);
  /** Key: `${platform}:${userId}` → ConversationState */
  private readonly states = new Map<string, ConversationState>();
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(
    @Optional()
    private readonly redis?: RedisService,
  ) {
    this.cleanupTimer = setInterval(() => this.cleanupExpired(), CLEANUP_INTERVAL_MS);
  }

  private makeKey(platform: string, userId: string): string {
    return `${platform}:${userId}`;
  }

  /**
   * Set a conversation state for a user on a specific platform.
   */
  setState(platform: string, userId: string, state: Omit<ConversationState, 'expiresAt'>): void {
    const key = this.makeKey(platform, userId);
    const fullState: ConversationState = {
      ...state,
      expiresAt: Date.now() + STATE_TTL_MS,
    };
    this.states.set(key, fullState);
    if (this.redis) {
      this.redis.setJson(`conv_state:${key}`, fullState, STATE_TTL_MS).catch((err) => {
        this.logger.warn(`Failed to persist conv_state in Redis: ${err.message}`);
      });
    }
    this.logger.debug(`[ConvState] Set ${key} → ${state.step} (pool: ${state.poolId})`);
  }

  /**
   * Get the current conversation state for a user, or null if none/expired.
   */
  getState(platform: string, userId: string): ConversationState | null {
    const key = this.makeKey(platform, userId);
    const state = this.states.get(key);
    if (!state) return null;
    if (Date.now() > state.expiresAt) {
      this.states.delete(key);
      if (this.redis) this.redis.del(`conv_state:${key}`).catch(() => undefined);
      return null;
    }
    return state;
  }

  /**
   * Clear the conversation state for a user (after flow completes or is cancelled).
   * Returns the list of message IDs that should be cleaned up.
   */
  clearState(platform: string, userId: string): (number | string)[] {
    const key = this.makeKey(platform, userId);
    const state = this.states.get(key);
    const messageIds = state?.messageIdsToCleanup || [];
    this.states.delete(key);
    if (this.redis) {
      this.redis.del(`conv_state:${key}`).catch(() => undefined);
    }
    this.logger.debug(`[ConvState] Cleared ${key}`);
    return messageIds;
  }

  /**
   * Add a message ID to the cleanup list for the current conversation.
   */
  addMessageToCleanup(platform: string, userId: string, messageId: number | string): void {
    const key = this.makeKey(platform, userId);
    const state = this.states.get(key);
    if (state) {
      state.messageIdsToCleanup.push(messageId);
    }
  }

  /**
   * Check if a user has an active conversation state.
   */
  hasActiveState(platform: string, userId: string): boolean {
    return this.getState(platform, userId) !== null;
  }

  private cleanupExpired(): void {
    const now = Date.now();
    let cleaned = 0;
    for (const [key, state] of this.states.entries()) {
      if (now > state.expiresAt) {
        this.states.delete(key);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      this.logger.debug(`[ConvState] Cleaned ${cleaned} expired conversation states`);
    }
  }

  onModuleDestroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }
}
