import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';

const retryPoolRequest = (failureCount: number, error: Error) => {
  // A missing pool and an expired session cannot become valid on a retry.
  // Retrying them only produces noisy API traffic and makes a stale link feel
  // as though it is still loading.
  if (error instanceof ApiError && (error.status === 401 || error.status === 404)) return false;
  return failureCount < 2;
};

export function usePools() {
  return useQuery({
    queryKey: ['group-pools'],
    queryFn: async () => {
      const res = await api.fetchPools();
      return res.pools;
    },
    refetchInterval: 10000,
    retry: retryPoolRequest,
  });
}

export function usePoolDetails(id: string) {
  return useQuery({
    queryKey: ['group-pool-details', id],
    queryFn: async () => {
      const res = await api.fetchPoolDetails(id);
      return res.pool;
    },
    enabled: !!id,
    retry: retryPoolRequest,
  });
}

export function useCreatePool() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { name: string; token?: string; members?: string[]; targetAmount?: number; interestRate?: number; inviteMessage?: string }) => {
      return await api.createPool(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group-pools'] });
    },
  });
}

export function useDepositPool() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, amount }: { id: string; amount: number }) => {
      return await api.depositPool(id, amount);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['group-pools'] });
      queryClient.invalidateQueries({ queryKey: ['group-pool-details', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['balances'] });
    },
  });
}

export function useRequestLoan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { amount: number; purpose?: string; durationDays: number } }) => {
      return await api.requestPoolLoan(id, data);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['group-pool-details', variables.id] });
    },
  });
}

export function useVoteLoan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, loanId, approve }: { id: string; loanId: string; approve: boolean }) => {
      return await api.votePoolLoan(id, loanId, approve);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['group-pool-details', variables.id] });
    },
  });
}

export function useExecuteLoan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, loanId }: { id: string; loanId: string }) => {
      return await api.executePoolLoan(id, loanId);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['group-pools'] });
      queryClient.invalidateQueries({ queryKey: ['group-pool-details', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['balances'] });
    },
  });
}

export function useRepayLoan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, loanId, amount }: { id: string; loanId: string; amount: number }) => {
      return await api.repayPoolLoan(id, loanId, amount);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['group-pools'] });
      queryClient.invalidateQueries({ queryKey: ['group-pool-details', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['my-pool-loans'] });
      queryClient.invalidateQueries({ queryKey: ['balances'] });
    },
  });
}

export function useClosePool() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string }) => api.closePool(id),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['group-pools'] });
      queryClient.invalidateQueries({ queryKey: ['group-pool-details', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['balances'] });
    },
  });
}

export function useWriteOffLoan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, loanId }: { id: string; loanId: string }) => {
      return await api.writeOffPoolLoan(id, loanId);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['group-pools'] });
      queryClient.invalidateQueries({ queryKey: ['group-pool-details', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['my-pool-loans'] });
    },
  });
}

export function useMyPoolLoans() {
  return useQuery({
    queryKey: ['my-pool-loans'],
    queryFn: async () => {
      const res = await api.fetchMyPoolLoans();
      return res.loans || [];
    },
    refetchInterval: 12000,
    retry: retryPoolRequest,
  });
}

export function useRequestExtension() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, loanId, additionalDays }: { id: string; loanId: string; additionalDays: number }) => {
      return await api.requestPoolExtension(id, loanId, additionalDays);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['group-pool-details', variables.id] });
    },
  });
}

export function useWithdrawPool() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, amount }: { id: string; amount: number }) => {
      return await api.withdrawPool(id, amount);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['group-pools'] });
      queryClient.invalidateQueries({ queryKey: ['group-pool-details', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['balances'] });
    },
  });
}

export function useUserReputation(userIdentifier: string) {
  return useQuery({
    queryKey: ['user-reputation', userIdentifier],
    queryFn: async () => {
      const res = await api.getUserReputation(userIdentifier);
      return res.reputationPoints;
    },
    enabled: !!userIdentifier,
  });
}

export function useInvitePoolMembers() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, members }: { id: string; members: string[] }) => {
      return await api.invitePoolMembers(id, members);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['group-pool-details', variables.id] });
    },
  });
}

export function useJoinPool() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      return await api.joinPool(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group-pools'] });
    },
  });
}
