import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useWalletStore } from '../store/useWalletStore';

// Hook: Fetch Wallet Balances
export function useBalances() {
  const address = useWalletStore((state) => state.address);
  const setBalances = useWalletStore((state) => state.setBalances);

  return useQuery({
    queryKey: ['balances', address],
    queryFn: async () => {
      const res = await api.getBalances();
      if (res?.balances) {
        setBalances(res.balances);
      }
      return res;
    },
    refetchInterval: 12000,
  });
}

// Hook: Fetch User Activity (real transaction history)
export function useActivity() {
  return useQuery({
    queryKey: ['activity'],
    queryFn: async () => {
      const res = await api.fetchActivity();
      return res?.activities || [];
    },
    refetchInterval: 15000,
  });
}

/**
 * Live yield rate from the zkTLS oracle.
 *
 * Returns null rather than a fallback when the oracle has no usable reading:
 * every surface quoting a rate should either show the attested figure or admit
 * it does not have one. Hardcoded APYs used to drift from what the oracle
 * actually published, which made the "verified" claim untrue.
 */
export function useYieldApy() {
  const query = useQuery({
    queryKey: ['oracleStatus'],
    queryFn: () => api.fetchOracleStatus(),
    // The oracle re-attests on a 10-minute cadence; matching it keeps the UI
    // within one cycle without polling harder than the data changes.
    refetchInterval: 5 * 60 * 1000,
    staleTime: 60 * 1000,
  });

  const apy = query.data?.compositeApy ?? null;
  return {
    apy,
    /** Pre-formatted for display, e.g. "3.77%", null when unavailable. */
    label: apy === null ? null : `${apy.toFixed(2)}%`,
    isLoading: query.isLoading,
    isVerified: query.data?.status === 'healthy' && apy !== null,
  };
}

// Hook: Paginated history for the standalone activity page
export function useActivityPage(page = 1, limit = 20) {
  return useQuery({
    queryKey: ['activityPage', page, limit],
    queryFn: () => api.fetchActivityPage(page, limit),
    // Keeps the previous page on screen while the next one loads, so the list
    // does not collapse to a spinner on every page change.
    placeholderData: (prev) => prev,
    refetchInterval: 30000,
  });
}

// Hook: Sender-centric payment history, including unclaimed social payments
export function useSentPayments(page = 1, status = 'all', limit = 20) {
  const address = useWalletStore((state) => state.address);
  return useQuery({
    queryKey: ['sentPayments', address, page, limit, status],
    queryFn: () => api.fetchSentPayments(page, limit, status),
    enabled: Boolean(address),
    placeholderData: (previous) => previous,
    refetchInterval: 30000,
  });
}

// Hook: External deposit history (from MetaMask / Trust / any external wallet)
export function useDeposits(limit = 25) {
  return useQuery({
    queryKey: ['deposits', limit],
    queryFn: async () => {
      const res = await api.fetchDeposits(limit);
      return res?.deposits || [];
    },
    refetchInterval: 30000,
  });
}

// Hook: Unclaimed payments the user sent, which they can still pull back
export function usePendingEscrows() {
  const address = useWalletStore((state) => state.address);
  return useQuery({
    queryKey: ['pendingEscrows', address],
    queryFn: () => api.fetchPendingEscrows(),
    enabled: Boolean(address),
    refetchInterval: 30000,
  });
}

// Hook: Cancel an unclaimed payment and get the funds back
export function useCancelEscrow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => api.cancelEscrow(code),
    onSuccess: () => {
      // The refund lands back in the wallet, so balances and history move too.
      queryClient.invalidateQueries({ queryKey: ['pendingEscrows'] });
      queryClient.invalidateQueries({ queryKey: ['balances'] });
      queryClient.invalidateQueries({ queryKey: ['activity'] });
      queryClient.invalidateQueries({ queryKey: ['sentPayments'] });
    },
  });
}

// Hook: Fetch Yield Vaults
export function useVaults() {
  return useQuery({
    queryKey: ['vaults'],
    queryFn: async () => {
      const res = await api.getVaults();
      return res?.vaults || [];
    },
  });
}

// Hook: Vault Deposit Mutation
export function useDepositVault() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { vaultId: string; amount: number }) => api.depositVault(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vaults'] });
      queryClient.invalidateQueries({ queryKey: ['balances'] });
    },
  });
}

// Hook: Vault Withdraw Mutation
export function useWithdrawVault() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { vaultId: string; amount: number }) => api.withdrawVault(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vaults'] });
      queryClient.invalidateQueries({ queryKey: ['balances'] });
    },
  });
}

// Hook: Fetch Session Keys
export function useSessionKeys() {
  return useQuery({
    queryKey: ['session-keys'],
    queryFn: async () => {
      const res = await api.getSessionKeys();
      return res?.keys || [];
    },
  });
}

// Hook: Fetch Session Key Status
export function useSessionKeyStatus() {
  return useQuery({
    queryKey: ['session-key-status'],
    queryFn: () => api.getSessionKeyStatus(),
    refetchInterval: 60_000,
  });
}

// Hook: Create Session Key Mutation
// Hook: Delete Session Key Mutation
export function useDeleteSessionKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteSessionKey(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['session-keys'] });
    },
  });
}

// Hook: Transfer Mutation
export function useTransfer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { to: string; token: string; amount: number }) =>
      api.transfer(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['balances'] });
      queryClient.invalidateQueries({ queryKey: ['activity'] });
      queryClient.invalidateQueries({ queryKey: ['sentPayments'] });
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
    },
  });
}

// Hook: Group Splits
export function useSplits() {
  return useQuery({
    queryKey: ['splits'],
    queryFn: async () => {
      const res = await api.getSplits();
      return res;
    },
  });
}

export function useSplit(id: string) {
  return useQuery({
    queryKey: ['split', id],
    queryFn: async () => {
      const res = await api.getSplit(id);
      return res;
    },
    enabled: !!id,
  });
}

export function useCreateSplit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      description: string;
      totalAmount: number;
      token: string;
      participants: string[];
      customAmounts?: number[];
    }) => api.createSplit(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['splits'] });
    },
  });
}

export function usePaySplit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (splitId: string) => api.paySplit(splitId),
    onSuccess: (_, splitId) => {
      queryClient.invalidateQueries({ queryKey: ['splits'] });
      queryClient.invalidateQueries({ queryKey: ['split', splitId] });
      queryClient.invalidateQueries({ queryKey: ['balances'] });
      queryClient.invalidateQueries({ queryKey: ['activity'] });
    },
  });
}

// Hook: Referrals
export function useReferrals() {
  return useQuery({
    queryKey: ['referrals'],
    queryFn: () => api.getReferrals(),
  });
}

// Hook: Subscriptions
export function useSubscriptions() {
  return useQuery({
    queryKey: ['subscriptions'],
    queryFn: async () => {
      const res = await api.getSubscriptions();
      return res?.subscriptions || [];
    },
  });
}

export function useCreateSubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { to: string; token: string; amount: number; frequency: string }) =>
      api.createSubscription(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
    },
  });
}

export function useDeleteSubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteSubscription(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
    },
  });
}

// Hook: Watched Tokens (Arbitrary ERC-20s)
export function useUserTokens() {
  return useQuery({
    queryKey: ['userTokens'],
    queryFn: async () => {
      const res = await api.fetchUserTokens();
      return res?.tokens || [];
    },
  });
}

export function useAddToken() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (address: string) => api.addUserToken(address),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userTokens'] });
      queryClient.invalidateQueries({ queryKey: ['balances'] });
    },
  });
}

export function useRemoveToken() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (address: string) => api.removeUserToken(address),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userTokens'] });
      queryClient.invalidateQueries({ queryKey: ['balances'] });
    },
  });
}
