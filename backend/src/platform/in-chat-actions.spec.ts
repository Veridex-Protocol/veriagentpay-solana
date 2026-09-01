import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { InteractiveActionService } from './interactive-action.service';
import { ConversationStateService } from './conversation-state.service';
import { PlatformUiAdapter } from './platform-ui.adapter';

describe('In-Chat Zero-Redirect Zero-Friction Flow Verification', () => {
  describe('ConversationStateService', () => {
    let stateService: ConversationStateService;

    beforeEach(() => {
      stateService = new ConversationStateService();
    });

    it('sets and retrieves conversation state for multi-step chat wizards', () => {
      stateService.setState('telegram', 'user_123', {
        step: 'AWAITING_POOL_CREATE_NAME',
        messageIdsToCleanup: [101, 102],
      });

      const state = stateService.getState('telegram', 'user_123');
      expect(state).not.toBeNull();
      expect(state?.step).toBe('AWAITING_POOL_CREATE_NAME');
      expect(state?.messageIdsToCleanup).toEqual([101, 102]);
    });

    it('clears state and returns cleanup message IDs for self-cleaning chat hygiene', () => {
      stateService.setState('telegram', 'user_456', {
        step: 'AWAITING_VAULT_WITHDRAW_AMOUNT',
        messageIdsToCleanup: [201, 202],
      });

      const cleanupIds = stateService.clearState('telegram', 'user_456');
      expect(cleanupIds).toEqual([201, 202]);

      const stateAfter = stateService.getState('telegram', 'user_456');
      expect(stateAfter).toBeNull();
    });
  });

  describe('InteractiveActionService On-Chain Actions via Session Key', () => {
    let service: InteractiveActionService;
    let mockPrisma: any;
    let mockRelayer: any;
    let mockSplits: any;
    let mockRequests: any;
    let mockEnvelopes: any;
    let mockPools: any;
    let mockVault: any;
    let mockSubscription: any;
    let mockNotification: any;
    let mockRedis: any;

    beforeEach(() => {
      mockPrisma = {
        user: {
          findUnique: mock((args: any) => {
            return Promise.resolve({ id: args.where.id, requireBiometricsAlways: false });
          }),
        },
        sessionKey: {
          findFirst: mock(() => {
            return Promise.resolve({
              id: 'sk_active_123',
              expiryAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
              perTxLimitUSD: 500,
              revokedAt: null,
              activatedAt: new Date(),
            });
          }),
        },
        paymentRequest: {
          update: mock(() => Promise.resolve({ id: 'req_123', status: 'CANCELLED' })),
        },
      };

      mockRequests = {
        payRequest: mock(() => Promise.resolve({ success: true, txHash: '0xabc123789' })),
      };

      mockVault = {
        deposit: mock((userId: string, vaultId: string, amount: number) =>
          Promise.resolve({ success: true, txHash: '0xvaultdeposit123' })
        ),
        withdraw: mock((userId: string, vaultId: string, amount: number) =>
          Promise.resolve({ success: true, txHash: '0xvaultwithdraw456' })
        ),
      };

      mockPools = {
        createPool: mock((userId: string, dto: any) =>
          Promise.resolve({
            success: true,
            poolId: 'pool_789',
            pool: { id: 'pool_789', name: dto.name, token: dto.token, targetAmount: dto.targetAmount, members: [] },
          })
        ),
        repayLoan: mock((poolId: string, loanId: string, userId: string, amount: number) =>
          Promise.resolve({ success: true, txHash: '0xpoolrepay999' })
        ),
        findAllForUser: mock(() => Promise.resolve([])),
      };

      mockSubscription = {
        cancelSubscription: mock(() => Promise.resolve({ success: true })),
      };

      const redisStore = new Map<string, string>();
      mockRedis = {
        get: mock((key: string) => Promise.resolve(redisStore.get(key) || null)),
        set: mock((key: string, val: string) => {
          redisStore.set(key, val);
          return Promise.resolve('OK');
        }),
        setJson: mock((key: string, val: any, ttl?: number) => {
          redisStore.set(key, JSON.stringify(val));
          return Promise.resolve('OK');
        }),
        takeJson: mock((key: string) => {
          const val = redisStore.get(key);
          redisStore.delete(key);
          return Promise.resolve(val ? JSON.parse(val) : null);
        }),
        claimOnce: mock((key: string, ttlSeconds: number) => {
          return Promise.resolve(true);
        }),
      };

      service = new InteractiveActionService(
        mockPrisma,
        mockRelayer,
        mockSplits,
        mockRequests,
        mockEnvelopes,
        mockPools,
        mockVault,
        mockSubscription,
        mockNotification,
        mockRedis
      );
    });

    it('approves and executes payment request in-chat via active session key without redirect', async () => {
      const actionId = await service.generatePayload('approve', 'req_123', 'user_alice', 25, 'USDC');
      const result = await service.handleInteractiveAction(actionId, 'user_alice');

      expect(result.success).toBe(true);
      expect(result.message).toContain('Payment request approved and paid!');
      expect(result.message).toContain('0xabc123789');
      expect(mockRequests.payRequest).toHaveBeenCalled();
    });

    it('executes real on-chain vault deposit when session key is active', async () => {
      const result = await service.handleVaultDepositAction('user_alice', 50);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Vault Deposit Successful!');
      expect(result.message).toContain('0xvaultdeposit123');
      expect(mockVault.deposit).toHaveBeenCalled();
    });

    it('executes real on-chain vault withdrawal when session key is active', async () => {
      const result = await service.handleVaultWithdrawAction('user_alice', 25);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Vault Withdrawal Successful!');
      expect(result.message).toContain('0xvaultwithdraw456');
      expect(mockVault.withdraw).toHaveBeenCalled();
    });

    it('executes real on-chain pool loan repayment via session key', async () => {
      const result = await service.handlePoolRepayAction('pool_1', 'loan_1', 'user_alice', 50);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Loan Repayment Successful!');
      expect(result.message).toContain('0xpoolrepay999');
      expect(mockPools.repayLoan).toHaveBeenCalled();
    });

    it('creates group pool in-chat and returns pool details', async () => {
      const result = await service.handlePoolCreateAction('user_alice', 'Alpha Group', 'USDC', 2500);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Group Pool Created Successfully!');
      expect(result.message).toContain('Alpha Group');
      expect(mockPools.createPool).toHaveBeenCalled();
    });

    it('cancels recurring subscription in-chat', async () => {
      const result = await service.handleSubscriptionCancelAction('sub_123', 'user_alice');

      expect(result.success).toBe(true);
      expect(result.message).toContain('Subscription Cancelled!');
      expect(mockSubscription.cancelSubscription).toHaveBeenCalled();
    });
  });

  describe('PlatformUiAdapter Multi-Platform Adaptation', () => {
    it('adapts WhatsApp buttons to List Message when options exceed 3', () => {
      const card = {
        title: 'Select a Pool',
        body: 'Please choose which lending pool to interact with:',
        buttons: [
          [{ label: 'Pool 1 (USDC)', callbackId: 'pool:1' }],
          [{ label: 'Pool 2 (USDC)', callbackId: 'pool:2' }],
          [{ label: 'Pool 3 (USDC)', callbackId: 'pool:3' }],
          [{ label: 'Pool 4 (USDT)', callbackId: 'pool:4' }],
        ],
      };

      const wa = PlatformUiAdapter.toWhatsApp('+1234567890', card);
      expect(wa.interactive.type).toBe('list');
      expect(wa.interactive.action.sections[0].rows.length).toBe(4);
      expect(wa.interactive.action.sections[0].rows[0].title).toBe('Pool 1 (USDC)');
    });

    it('adapts WhatsApp buttons to Quick Reply buttons when options are <= 3', () => {
      const card = {
        title: 'Quick Actions',
        body: 'Choose an action:',
        buttons: [
          [{ label: 'Deposit $25', callbackId: 'vault:dep:25' }],
          [{ label: 'Deposit $50', callbackId: 'vault:dep:50' }],
        ],
      };

      const wa = PlatformUiAdapter.toWhatsApp('+1234567890', card);
      expect(wa.interactive.type).toBe('button');
      expect(wa.interactive.action.buttons.length).toBe(2);
    });

    it('formats Telegram inline keyboard with markdown', () => {
      const card = {
        title: 'AI Yield Vault',
        body: 'Earn verified 5.2% APY on BOTChain',
        buttons: [
          [{ label: 'Deposit $50', callbackId: 'vault_save:50' }],
          [{ label: 'Withdraw $25', callbackId: 'vault_withdraw_amt:25' }],
        ],
      };

      const tg = PlatformUiAdapter.toTelegram(card);
      expect(tg.text).toContain('AI Yield Vault');
      expect(tg.reply_markup?.inline_keyboard.length).toBe(2);
      expect(tg.reply_markup?.inline_keyboard[0][0].callback_data).toBe('vault_save:50');
    });

    it('formats Discord embeds and component action rows', () => {
      const card = {
        title: 'Pool Hub',
        body: 'Manage your community credit lines',
        buttons: [
          [
            { label: 'Deposit', callbackId: 'pool_action:deposit', style: 'primary' as const },
            { label: 'Repay', callbackId: 'pool_action:repay', style: 'primary' as const },
          ],
        ],
      };

      const discord = PlatformUiAdapter.toDiscord(card);
      expect(discord.embeds[0].title).toContain('Pool Hub');
      expect(discord.components.length).toBe(1);
      expect(discord.components[0].components.length).toBe(2);
    });
  });
});
