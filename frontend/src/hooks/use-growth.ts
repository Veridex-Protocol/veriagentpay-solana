import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

export function usePublicEnvelope(id: string) {
  return useQuery({
    queryKey: ['public-envelope', id],
    queryFn: async () => {
      const res = await api.fetchPublicEnvelope(id);
      return res.envelope;
    },
    enabled: !!id,
  });
}

export function useClaimPublicEnvelope() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      return await api.claimPublicEnvelope(id);
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['public-envelope', id] });
      queryClient.invalidateQueries({ queryKey: ['balances'] });
    },
  });
}

export function useManagedVaults() {
  return useQuery({
    queryKey: ['managed-vaults'],
    queryFn: async () => {
      const res = await api.fetchManagedVaults();
      return res.vaults;
    },
  });
}

export function useCreateManagedVault() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { name: string; symbol: string; token?: string; performanceFeeBps: number }) => {
      return await api.createManagedVault(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['managed-vaults'] });
    },
  });
}

export function useAirdropEligibility(wallet?: string) {
  return useQuery({
    queryKey: ['airdrop-eligibility', wallet],
    queryFn: async () => {
      return await api.fetchAirdropEligibility(wallet);
    },
  });
}

export function useClaimAirdrop() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      return await api.claimAirdrop();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['airdrop-eligibility'] });
    },
  });
}

export function useSavingsStreak() {
  return useQuery({
    queryKey: ['savings-streak'],
    queryFn: async () => api.fetchSavingsStreak(),
  });
}

export function useLeaderboard() {
  return useQuery({
    queryKey: ['yield-leaderboard'],
    queryFn: async () => {
      return await api.fetchLeaderboard();
    },
  });
}

export function useAmbassadorProfile() {
  return useQuery({
    queryKey: ['ambassador-profile'],
    queryFn: async () => {
      return await api.fetchAmbassadorProfile();
    },
  });
}
