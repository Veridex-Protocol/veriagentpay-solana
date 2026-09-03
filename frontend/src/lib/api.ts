import { useWalletStore } from '../store/useWalletStore';
import { startAuthentication } from '@simplewebauthn/browser';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || '';
export const AUTH_REQUIRED_MESSAGE = 'Please sign in with your passkey to continue.';

// A dashboard can issue several protected requests at once. When an access
// token expires they must share one refresh attempt instead of each endpoint
// starting its own request and producing a retry storm.
let refreshPromise: Promise<string | null> | null = null;
let refreshUnavailableUntil = 0;

export async function restoreAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;
  if (Date.now() < refreshUnavailableUntil) return null;

  refreshPromise = fetch(`${BASE_URL}/api/webauthn/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  })
    .then(async (res) => {
      if (!res.ok) {
        // A missing/rejected cookie cannot become valid between simultaneous
        // dashboard requests. Briefly suppress more refresh traffic while the
        // app moves the user into passkey recovery.
        refreshUnavailableUntil = Date.now() + 15_000;
        return null;
      }
      const session = await res.json();
      const accessToken = session.accessToken || null;
      useWalletStore.getState().setToken(accessToken);
      if (session.walletAddress) useWalletStore.getState().setAddress(session.walletAddress);
      useWalletStore.getState().setAuthRequired(false);
      refreshUnavailableUntil = 0;
      return accessToken;
    })
    .catch(() => {
      refreshUnavailableUntil = Date.now() + 15_000;
      return null;
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

/** What a share link's recipient may see before they have an account. */
export interface RedEnvelopePreview {
  id: string;
  token: string;
  totalAmount: number;
  message: string | null;
  type: 'OPEN' | 'CUSTOM';
  /** OPEN envelopes may split at random, so the exact share is drawn on claim. */
  isRandom: boolean;
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED' | 'EXPIRED';
  creatorUsername: string | null;
  claimCount: number;
  maxClaims: number;
  remainingClaims: number;
  remainingBalance: number;
  isTargeted: boolean;
}

export class ApiError extends Error {
  constructor(public message: string, public status: number, public code?: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function performPasskeyAuth(): Promise<string> {
  const challengeRes = await fetch(`${BASE_URL}/api/webauthn/authentication/options`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  });
  if (!challengeRes.ok) throw new Error('Failed to get WebAuthn challenge');
  const { challengeId, options } = await challengeRes.json();

  const assertion = await startAuthentication(options);

  const verifyRes = await fetch(`${BASE_URL}/api/webauthn/authentication/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ challengeId, response: assertion }),
    credentials: 'include',
  });
  if (!verifyRes.ok) throw new Error('Passkey verification failed');
  const result = await verifyRes.json();

  if (result.accessToken) {
    useWalletStore.getState().setToken(result.accessToken);
  }
  return result.accessToken;
}

async function fetchApi<T>(endpoint: string, options: RequestInit = {}, _isRetry = false): Promise<T> {
  const state = useWalletStore.getState();
  const address = state.address || (typeof window !== 'undefined' ? localStorage.getItem('veriagent_wallet_address') : null);
  const token = state.token;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(address ? { 'x-wallet-address': address } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers as Record<string, string>),
  };

  try {
    const res = await fetch(`${BASE_URL}${endpoint}`, {
      ...options,
      headers,
      credentials: 'include',
    });

    if (!res.ok) {
      let errorMessage = `HTTP Error ${res.status}`;
      let errorCode: string | undefined;
      try {
        const errorData = await res.json();
        errorMessage = errorData.message || errorData.error || errorMessage;
        errorCode = errorData.code || errorData.errorCode;
        if (typeof window !== 'undefined' && (errorCode === 'SESSION_EXPIRED' || errorCode === 'SESSION_KEY_REQUIRED' || errorMessage?.toLowerCase().includes('session key'))) {
          window.dispatchEvent(new CustomEvent('session-key-expired', { detail: { errorCode, message: errorMessage } }));
        }
      } catch {}

      // Any 401 means this protected request no longer has a usable session.
      // Try the rotating HttpOnly cookie once, then hand the UI a stable,
      // customer-facing recovery state without leaking JWT terminology.
      if (res.status === 401) {
        if (!_isRetry) {
          const freshToken = await restoreAccessToken();
          if (freshToken) {
            const retryHeaders: Record<string, string> = {
              ...headers,
              Authorization: `Bearer ${freshToken}`,
            };
            return fetchApi<T>(endpoint, { ...options, headers: retryHeaders }, true);
          }
        }

        useWalletStore.getState().setToken(null);
        useWalletStore.getState().setAuthRequired(true);
        throw new ApiError(AUTH_REQUIRED_MESSAGE, 401, 'AUTHENTICATION_REQUIRED');
      }

      // Auto-trigger passkey prompt when biometrics required (one retry)
      if (!_isRetry && errorCode === 'SESSION_BYPASSED_BIOMETRICS_REQUIRED') {
        try {
          const freshToken = await performPasskeyAuth();
          const retryHeaders: Record<string, string> = {
            ...headers,
            Authorization: `Bearer ${freshToken}`,
            'x-passkey-verified': 'true',
          };
          return fetchApi<T>(endpoint, { ...options, headers: retryHeaders }, true);
        } catch (authErr: any) {
          if (authErr?.name === 'NotAllowedError' || authErr?.message?.includes('cancel')) {
            throw new ApiError('Biometric authentication was cancelled', 403, 'BIOMETRIC_CANCELLED');
          }
          throw new ApiError(authErr?.message || 'Biometric authentication failed', 403, 'BIOMETRIC_FAILED');
        }
      }

      throw new ApiError(errorMessage, res.status, errorCode);
    }

    return await res.json();
  } catch (err: any) {
    if (err instanceof ApiError) throw err;

    console.warn(`[API] Server request failed for ${endpoint}:`, err.message);
    throw new ApiError('Service unavailable. Please check your connection.', 503);
  }
}

export const api = {
  /**
   * Asks the server whether an escalation link's parameters are the ones it
   * signed, and that it has not expired.
   *
   * The HMAC key cannot live in the browser, so this cannot be checked here.
   * Call it before acting on `escalated=1`: the amount and recipient come
   * from a URL that may have been forwarded and edited.
   */
  verifyEscalation: (query: string) =>
    fetchApi<{ valid: boolean; reason?: string }>(`/api/escalation/verify?${query}`),

  // Payment Requests
  createPaymentRequest: (data: { recipientIdentifier: string; token: string; amount: number; note?: string; expiresInDays?: number }) =>
    fetchApi<{ success: boolean; request: any }>('/api/requests', { method: 'POST', body: JSON.stringify(data) }),
  fetchPaymentRequests: (params?: { filter?: string; status?: string }) => {
    const query = new URLSearchParams();
    if (params?.filter) query.append('filter', params.filter);
    if (params?.status) query.append('status', params.status);
    const qStr = query.toString();
    return fetchApi<{ requests: any[] }>(`/api/requests${qStr ? `?${qStr}` : ''}`);
  },
  fetchPaymentRequestDetails: (id: string) =>
    fetchApi<{ request: any }>(`/api/requests/${id}`),
  payPaymentRequest: (id: string) =>
    fetchApi<{ success: boolean; status: string; txHash: string }>(`/api/requests/${id}/pay`, { method: 'POST' }),
  cancelPaymentRequest: (id: string) =>
    fetchApi<{ success: boolean; status: string }>(`/api/requests/${id}/cancel`, { method: 'POST' }),
  remindPaymentRequest: (id: string) =>
    fetchApi<{ success: boolean; lastRemindedAt: string }>(`/api/requests/${id}/remind`, { method: 'POST' }),

  // External deposits (funding from MetaMask / Trust / any wallet)
  fetchDepositAddress: () =>
    fetchApi<{
      address: string;
      chainId: number;
      network: string;
      isDeployed: boolean;
      supportedTokens: Array<{ symbol: string; name: string; address: string; decimals: number; icon: string }>;
      paymentUri: string;
      qrDataUri: string | null;
      explorerUrl: string;
    }>('/api/deposits/address'),
  fetchDeposits: (limit = 25) =>
    fetchApi<{
      deposits: Array<{
        id: string;
        amount: string | null;
        amountRaw: string;
        token: string | null;
        tokenAddress: string;
        from: string;
        txHash: string;
        status: string;
        recognized: boolean;
        occurredAt: string;
        explorerUrl: string;
      }>;
    }>(`/api/deposits?limit=${limit}`),

  /** Payments the user sent that nobody has claimed yet. */
  fetchPendingEscrows: () =>
    fetchApi<Array<{
      code: string;
      amount: number | null;
      token: string | null;
      recipient: string | null;
      createdAt: string;
      expiresAt: string | null;
      /** False when the escrow never reached the chain: nothing to return. */
      escrowed: boolean;
    }>>('/api/shortlinks/mine/pending'),

  /** Cancels an unclaimed payment and returns the funds to the sender. */
  cancelEscrow: (code: string) =>
    fetchApi<{
      success: boolean;
      code: string;
      txHash: string | null;
      amount: number | null;
      token: string | null;
      recipient: string | null;
      refunded: boolean;
    }>(`/api/shortlinks/${code}/cancel`, { method: 'POST' }),

  // Savings streaks & Weekly Wrapped
  fetchSavingsStreak: () =>
    fetchApi<{
      currentStreak: number;
      longestStreak: number;
      totalBonusPoints: number;
      lastDepositDate: string | null;
      history: string[];
    }>('/api/streaks'),
  fetchWeeklyWrapped: () =>
    fetchApi<{
      sent: number;
      received: number;
      saved: number;
      currentStreak: number;
      longestStreak: number;
      badgeCount: number;
      weekStart: string;
      weekEnd: string;
    }>('/api/streaks/wrapped'),

  // Referrals
  fetchReferralCode: (src = 'web') =>
    fetchApi<{ code: string; shareUrl: string }>(`/api/referrals/code?src=${encodeURIComponent(src)}`),
  fetchReferralStats: () =>
    fetchApi<{
      code: string;
      referralCode: string;
      shareUrl: string;
      totalReferrals: number;
      activatedReferrals: number;
      pendingReferrals: number;
      referralPoints: number;
      totalPoints: number;
    }>('/api/referrals/stats'),
  fetchReferralLeaderboard: (period: 'week' | 'month' | 'all' = 'week') =>
    fetchApi<{
      period: string;
      entries: Array<{
        rank: number;
        userId: string;
        username: string;
        activations: number;
        retained: number;
        points: number;
      }>;
    }>(`/api/referrals/leaderboard?period=${period}`),

  // Auth & Account
  getMe: () => fetchApi<any>('/api/auth/me'),
  requestAccountLink: (platform: string, username?: string) =>
    fetchApi<{
      platform: string;
      /** 'otp' → the code was sent to the handle; 'deeplink' → open the bot. */
      delivery?: 'otp' | 'deeplink';
      code?: string;
      url?: string;
      instructions?: string;
      maskedTarget?: string;
      /** One-tap Telegram link that delivers the code as the /start payload. */
      deepLink?: string;
    }>('/api/account/link', {
      method: 'POST',
      body: JSON.stringify({ platform, username }),
    }),
  verifyAccountCode: (data: { platform: string; code: string; username?: string }) =>
    fetchApi<{ success: boolean; socialNode: any }>('/api/account/verify', { method: 'POST', body: JSON.stringify(data) }),
  getLinkedAccounts: () => fetchApi<{ links: any[] }>('/api/account/links'),
  unlinkAccount: (platform: string) =>
    fetchApi<{ success: boolean }>(`/api/account/unlink/${platform}`, { method: 'DELETE' }),

  // Balance
  getBalances: () => fetchApi<{ balances: Record<string, string>; yieldSummary?: any; totalUsd?: number }>('/api/balance'),

  // Activity
  fetchActivity: () => fetchApi<{ success: boolean; activities: any[] }>('/api/activity'),

  /**
   * Live composite APY attested by the zkTLS oracle.
   *
   * `compositeApy` is null when no yield source has a usable reading: the
   * oracle publishes nothing rather than a placeholder, so callers must handle
   * the absence instead of substituting a number of their own.
   */
  fetchOracleStatus: () =>
    fetchApi<{
      status: 'healthy' | 'degraded';
      compositeApy: number | null;
      lastAttestation: string | null;
      protocols: Array<{
        name: string;
        apy: number | null;
        tvlUsd: number | null;
        circuitBreakerOpen: boolean;
        cacheAgeMinutes: number | null;
        lastError?: string;
      }>;
    }>('/api/oracle/status'),

  /** Paginated history for the full activity page. */
  fetchActivityPage: (page = 1, limit = 20) =>
    fetchApi<{
      success: boolean;
      page: number;
      limit: number;
      totalCount: number;
      totalPages: number;
      activities: Array<{
        id: string;
        activity: string;
        recipient: string;
        amount: string;
        status: string;
        time: string;
        type: 'sent' | 'received';
        txHash: string | null;
        explorerUrl: string | null;
        external: boolean;
      }>;
    }>(`/api/activity?page=${page}&limit=${limit}`),

  /** Direct transfers and social-payment claim links created by this user. */
  fetchSentPayments: (page = 1, limit = 20, status = 'all') =>
    fetchApi<{
      success: boolean;
      page: number;
      limit: number;
      totalCount: number;
      totalPages: number;
      summary: {
        total: number;
        completed: number;
        awaitingClaim: number;
        claimed: number;
        cancelled: number;
        expired: number;
      };
      payments: Array<{
        id: string;
        kind: 'DIRECT' | 'CLAIM_LINK';
        recipient: string;
        recipientRegistered: boolean;
        channel: string;
        amount: number | null;
        token: string;
        status: 'COMPLETED' | 'AWAITING_CLAIM' | 'CLAIMED' | 'CANCELLED' | 'EXPIRED';
        createdAt: string;
        completedAt: string | null;
        txHash: string | null;
        claimTxHash: string | null;
        code: string | null;
        claimUrl: string | null;
        expiresAt: string | null;
        cancellable: boolean;
      }>;
    }>(`/api/activity/sent-payments?page=${page}&limit=${limit}&status=${encodeURIComponent(status)}`),

  // Contacts
  fetchContacts: () => fetchApi<{ contacts: any[] }>('/api/contacts'),
  createContact: (data: { name: string; platform: string; identifier: string; walletAddress?: string }) =>
    fetchApi<{ success: boolean; contact: any }>('/api/contacts', { method: 'POST', body: JSON.stringify(data) }),
  updateContact: (id: string, data: { name?: string; identifier?: string; platform?: string }) =>
    fetchApi<{ success: boolean; contact: any }>(`/api/contacts/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteContact: (id: string) =>
    fetchApi<{ success: boolean }>(`/api/contacts/${id}`, { method: 'DELETE' }),

  // Notifications
  getNotifications: () => fetchApi<{ notifications: any[] }>('/api/notifications'),
  getUnreadCount: () => fetchApi<{ count: number }>('/api/notifications/unread-count'),
  markNotificationRead: (id: string) => fetchApi<{ success: boolean }>(`/api/notifications/${id}/read`, { method: 'PATCH' }),
  markAllNotificationsRead: () => fetchApi<{ success: boolean }>('/api/notifications/read-all', { method: 'PATCH' }),

  // Relay Transfer
  transfer: (data: { to: string; token: string; amount: number }) =>
    fetchApi<{ txHash: string; success: boolean }>('/api/relay/transfer', { method: 'POST', body: JSON.stringify(data) }),

  transferWithPasskey: (data: { to: string; token: string; amount: number; note?: string; challengeId: string; assertion: any }) =>
    fetchApi<{ txHash: string; success: boolean; method: string }>('/api/relay/transfer/passkey', { method: 'POST', body: JSON.stringify(data) }),

  // On-chain-verified passkey actions. Prepare returns a challenge that commits
  // to the exact action; execute submits the assertion over it. See
  // lib/passkey-actions.ts: callers should use those wrappers, not these.
  preparePasskeyTransfer: (data: { to: string; token: string; amount: number; note?: string }) =>
    fetchApi<{ prepareId: string; challengeB64Url: string; vaultAddress: string; expiresAt: string; code?: string; shortUrl?: string }>(
      '/api/relay/passkey/prepare', { method: 'POST', body: JSON.stringify(data) }),

  preparePasskeySession: (data: { durationHours?: number; durationDays?: number; perTxLimitUSD?: number; dailyLimitUSD?: number }) =>
    fetchApi<{ prepareId: string; challengeB64Url: string; vaultAddress: string; expiresAt: string; sessionKeyId: string }>(
      '/api/relay/passkey/prepare-session', { method: 'POST', body: JSON.stringify(data) }),

  preparePasskeyLinkCancel: (code: string) =>
    fetchApi<{ prepareId: string; challengeB64Url: string; vaultAddress: string; expiresAt: string }>(
      '/api/relay/passkey/prepare-link-cancel', { method: 'POST', body: JSON.stringify({ code }) }),

  /**
   * Re-stamps the vault's contract allowlist with the protocol's current
   * addresses. Takes no arguments on purpose: the server decides what is
   * granted, so a compromised session cannot request its own escalation.
   */
  preparePolicyRefresh: () =>
    fetchApi<{ prepareId: string; challengeB64Url: string; vaultAddress: string; expiresAt: string }>(
      '/api/relay/passkey/prepare-policy-refresh', { method: 'POST' }),

  executePasskeyAction: (data: { prepareId: string; assertion: any }) =>
    fetchApi<{ txHash: string; success: boolean; kind: string; code?: string; shortUrl?: string }>(
      '/api/relay/passkey/execute', { method: 'POST', body: JSON.stringify(data) }),

  getWebAuthnChallenge: () =>
    fetchApi<{ challengeId: string; options: any }>('/api/webauthn/authentication/options', { method: 'POST' }),

  refreshToken: () =>
    fetchApi<{ success: boolean; accessToken: string; userId: string; walletAddress: string }>('/api/webauthn/refresh', { method: 'POST' }),

  // Yield Vaults
  getVaults: () => fetchApi<{ vaults: any[] }>('/api/vaults'),
  depositVault: (data: { vaultId: string; amount: number }) =>
    fetchApi<{ txHash: string }>('/api/vaults/deposit', { method: 'POST', body: JSON.stringify(data) }),
  withdrawVault: (data: { vaultId: string; amount: number }) =>
    fetchApi<{ txHash: string }>('/api/vaults/withdraw', { method: 'POST', body: JSON.stringify(data) }),

  // Session Keys
  getSessionKeys: () => fetchApi<{ keys: any[] }>('/api/session-keys'),
  getSessionKeyStatus: () => fetchApi<{ hasActiveKey: boolean; expiresAt: string | null; secondsRemaining: number; perTxLimitUSD: number; dailyLimitUSD: number }>('/api/session-keys/status'),
  deleteSessionKey: (id: string) =>
    fetchApi<{ success: boolean }>(`/api/session-keys/${id}`, { method: 'DELETE' }),

  // NLP Parser
  parseNlp: (text: string) =>
    fetchApi<{ intent: string; params?: { token?: string; amount?: string; recipient?: string } }>('/api/nlp', {
      method: 'POST',
      body: JSON.stringify({ text }),
    }),

  // Group Splits
  getSplits: () => fetchApi<{ success: boolean; splits: any[] }>('/api/splits'),
  getSplit: (id: string) => fetchApi<{ success: boolean; split: any }>(`/api/splits/${id}`),
  createSplit: (data: {
    description: string;
    totalAmount: number;
    token: string;
    participants: string[];
    customAmounts?: number[];
  }) => fetchApi<{ success: boolean; splitId: string; split: any }>('/api/splits', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  paySplit: (splitId: string) =>
    fetchApi<{ success: boolean; splitId: string; txHash: string }>(`/api/splits/${splitId}/pay`, {
      method: 'POST',
    }),

  // Red Envelopes
  createRedEnvelope: (data: { token: string; totalAmount: number; numRecipients: number; type: 'OPEN' | 'CUSTOM'; isRandom?: boolean; customRecipientId?: string; message?: string }) =>
    fetchApi<{ success: boolean; envelope: any; deepLink: string; shareMessages: any }>('/api/envelopes', { method: 'POST', body: JSON.stringify(data) }),
  fetchRedEnvelopes: () => fetchApi<{ envelopes: any[] }>('/api/envelopes'),
  fetchRedEnvelopeDetails: (id: string) => fetchApi<{ envelope: any }>(`/api/envelopes/${id}`),
  /**
   * Narrow, session-free view of a shared envelope. A recipient following a
   * share link has no wallet yet, so the authenticated detail endpoint would
   * only 401 at them before they could decide to sign up.
   */
  fetchRedEnvelopePreview: (id: string) =>
    fetchApi<{ envelope: RedEnvelopePreview }>(`/api/envelopes/${id}/preview`),
  cancelRedEnvelope: (id: string) => fetchApi<{ success: boolean; status: string; amountRefunded: number }>(`/api/envelopes/${id}/cancel`, { method: 'POST' }),
  claimRedEnvelope: (id: string) => fetchApi<{ success: boolean; claimedAmount: number; token: string }>(`/api/envelopes/${id}/claim`, { method: 'POST' }),
  fetchRedEnvelopeClaims: (id: string) => fetchApi<{ claims: any[] }>(`/api/envelopes/${id}/claims`),
  getEnvelopeSharePayload: (id: string) => fetchApi<{ deepLink: string; messages: any }>(`/api/envelopes/${id}/share`, { method: 'POST' }),

  // Referrals
  getReferrals: () =>
    fetchApi<{
      code: string;
      referralCode: string;
      /** Canonical invite URL: the same one the badge share card renders. */
      shareUrl: string;
      totalEarned: number;
      totalReferrals: number;
      activatedReferrals: number;
      referredUsers: { name: string; status: string; date: string; reward: string }[];
    }>('/api/referrals'),

  // Subscriptions
  getSubscriptions: () => fetchApi<{ subscriptions: any[] }>('/api/subscriptions'),
  createSubscription: (data: { to: string; token: string; amount: number; frequency: string }) =>
    fetchApi<{ subId: string }>('/api/subscriptions', { method: 'POST', body: JSON.stringify(data) }),
  deleteSubscription: (id: string) =>
    fetchApi<{ success: boolean }>(`/api/subscriptions/${id}`, { method: 'DELETE' }),

  // Group Lending Pools
  createPool: (data: { name: string; token?: string; members?: string[]; targetAmount?: number; interestRate?: number; inviteMessage?: string }) =>
    fetchApi<{ success: boolean; poolId: string; pool: any; inviteLink: string }>('/api/pools', { method: 'POST', body: JSON.stringify(data) }),
  fetchPools: () => fetchApi<{ pools: any[] }>('/api/pools'),
  fetchPoolDetails: (id: string) => fetchApi<{ pool: any }>(`/api/pools/${id}`),
  depositPool: (id: string, amount: number) =>
    fetchApi<{ success: boolean; depositedAmount: number; txHash?: string }>(`/api/pools/${id}/deposit`, { method: 'POST', body: JSON.stringify({ amount }) }),
  requestPoolLoan: (id: string, data: { amount: number; purpose?: string; durationDays: number }) =>
    fetchApi<{ success: boolean; loan: any }>(`/api/pools/${id}/loans`, { method: 'POST', body: JSON.stringify(data) }),
  votePoolLoan: (id: string, loanId: string, approve: boolean) =>
    fetchApi<{ success: boolean; status: string; approveVotes: number; rejectVotes: number }>(`/api/pools/${id}/loans/${loanId}/vote`, { method: 'POST', body: JSON.stringify({ approve }) }),
  executePoolLoan: (id: string, loanId: string) =>
    fetchApi<{ success: boolean; status: string; txHash: string; repaymentDeadline: string }>(`/api/pools/${id}/loans/${loanId}/execute`, { method: 'POST' }),
  repayPoolLoan: (id: string, loanId: string, amount: number) =>
    fetchApi<{ success: boolean; status: string; repaidAmount: number; txHash?: string; pointsEarned?: number; isOnTime?: boolean }>(`/api/pools/${id}/loans/${loanId}/repay`, { method: 'POST', body: JSON.stringify({ amount }) }),
  requestPoolExtension: (id: string, loanId: string, additionalDays: number) =>
    fetchApi<{ success: boolean; extensionRequest: any }>(`/api/pools/${id}/loans/${loanId}/extension`, { method: 'POST', body: JSON.stringify({ additionalDays }) }),
  closePool: (id: string) =>
    fetchApi<{ success: boolean; closed: boolean; refunded: Array<{ member: string; amount: number; txHash: string }>; skipped: Array<{ member: string; reason: string }> }>(
      `/api/pools/${id}/close`, { method: 'POST' }),

  writeOffPoolLoan: (id: string, loanId: string) =>
    fetchApi<{ success: boolean; status: string; writeOffVotes: number; threshold: number; writtenOff: boolean }>(`/api/pools/${id}/loans/${loanId}/write-off`, { method: 'POST' }),
  withdrawPool: (id: string, amount: number) =>
    fetchApi<{ success: boolean; withdrawnAmount: number }>(`/api/pools/${id}/withdraw`, { method: 'POST', body: JSON.stringify({ amount }) }),
  invitePoolMembers: (id: string, members: string[]) =>
    fetchApi<{ success: boolean; invitedCount: number; inviteLink: string }>(`/api/pools/${id}/invite`, { method: 'POST', body: JSON.stringify({ members }) }),
  joinPool: (id: string) =>
    fetchApi<{ success: boolean; message: string; poolId: string; inviteLink: string }>(`/api/pools/${id}/join`, { method: 'POST' }),
  getUserReputation: (userIdentifier: string) =>
    fetchApi<{ userIdentifier: string; reputationPoints: number }>(`/api/pools/reputation/${userIdentifier}`),
  fetchMyPoolLoans: () => fetchApi<{ loans: any[] }>('/api/pools/user/my-loans'),

  // GTM Growth & Virality Features
  createPublicEnvelope: (data: { token?: string; totalAmount: number; maxClaims: number }) =>
    fetchApi<{ success: boolean; envelope: any; deepLink: string; shareMessages: any }>('/api/envelopes/public', { method: 'POST', body: JSON.stringify(data) }),
  fetchPublicEnvelope: (id: string) => fetchApi<{ envelope: any }>(`/api/envelopes/public/${id}`),
  claimPublicEnvelope: (id: string) => fetchApi<{ success: boolean; claimedAmount: number; token: string }>(`/api/envelopes/public/${id}/claim`, { method: 'POST' }),

  createManagedVault: (data: { name: string; symbol: string; token?: string; performanceFeeBps: number }) =>
    fetchApi<{ success: boolean; vault: any; shareLink: string }>('/api/vaults/managed', { method: 'POST', body: JSON.stringify(data) }),
  fetchManagedVaults: () => fetchApi<{ vaults: any[] }>('/api/vaults/managed'),

  fetchAirdropEligibility: (wallet?: string) => fetchApi<any>(`/api/airdrop/eligibility${wallet ? `?wallet=${wallet}` : ''}`),
  claimAirdrop: () => fetchApi<{ success: boolean; claim: any }>('/api/airdrop/claim', { method: 'POST' }),

  // Savings streak lives at /api/streaks (see above): it resolves the caller
  // from the auth token rather than trusting a wallet-address header.
  fetchLeaderboard: () => fetchApi<{ topVaults: any[]; showdownPrizePool: number }>('/api/leaderboard'),

  // Badges & Dynamic Share Cards
  fetchMyBadges: () => fetchApi<{ userIdentifier: string; totalEarned: number; badges: any[] }>('/api/badges/my-badges'),
  fetchGlobalLeaderboard: (limit?: number) => fetchApi<{ totalUsers: number; rankings: any[] }>(`/api/leaderboard${limit ? `?limit=${limit}` : ''}`),
  fetchMyRank: () => fetchApi<{ userIdentifier: string; globalRank: number | null; percentile: string | null; reputationPoints: number; totalReferred: number; primaryBadge: string | null }>('/api/leaderboard/me/rank'),
  fetchShareCardPayload: () => fetchApi<any>('/api/share/badge'),
  fetchInviteQr: () => fetchApi<{ inviteUrl: string; qrDataUrl: string }>('/api/qr/invite'),

  // Behavioral Notification Preferences (feed)
  fetchNotificationPreferences: () => fetchApi<{ preferences: any }>('/api/notifications/preferences'),
  updateNotificationPreferences: (prefs: any) => fetchApi<{ success: boolean; preferences: any }>('/api/notifications/preferences', { method: 'POST', body: JSON.stringify(prefs) }),

  // User notification toggles (push / Telegram bot / yield alerts)
  fetchNotificationPrefs: () =>
    fetchApi<{ pushAlerts: boolean; telegramBot: boolean; yieldAlerts: boolean }>('/api/settings/notifications'),
  updateNotificationPrefs: (prefs: { pushAlerts?: boolean; telegramBot?: boolean; yieldAlerts?: boolean }) =>
    fetchApi<{ pushAlerts: boolean; telegramBot: boolean; yieldAlerts: boolean }>('/api/settings/notifications', {
      method: 'PATCH',
      body: JSON.stringify(prefs),
    }),

  // NLP Intent Parser (@veridex/agents)
  parseIntent: (text: string) => fetchApi<{ intent: string; params: any }>('/api/nlp/parse', { method: 'POST', body: JSON.stringify({ text }) }),

  // Ambassador
  fetchAmbassadorProfile: () => fetchApi<{ profile: any }>('/api/ambassador/profile'),

  // Watched User Tokens (Arbitrary ERC-20s)
  fetchUserTokens: () =>
    fetchApi<{
      tokens: Array<{
        address: string;
        symbol: string;
        name: string;
        decimals: number;
        custom: boolean;
        lastBalanceRaw?: string | null;
        balanceSyncedAt?: string | null;
      }>;
    }>('/api/tokens'),
  addUserToken: (address: string) =>
    fetchApi<{ success: boolean; token: any; alreadyKnown?: boolean }>('/api/tokens', {
      method: 'POST',
      body: JSON.stringify({ address }),
    }),
  removeUserToken: (address: string) =>
    fetchApi<{ success: boolean }>(`/api/tokens/${address}`, { method: 'DELETE' }),
};
