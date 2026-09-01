import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

export function useUser() {
  return useQuery({
    queryKey: ['user-me'],
    queryFn: async () => {
      const res = await api.getMe();
      return res;
    },
  });
}

export function useLinkedAccounts() {
  return useQuery({
    queryKey: ['linked-accounts'],
    queryFn: async () => {
      const res = await api.getLinkedAccounts();
      return res?.links || [];
    },
  });
}

export function useRequestAccountLink() {
  return useMutation({
    mutationFn: (input: string | { platform: string; username?: string }) =>
      typeof input === 'string'
        ? api.requestAccountLink(input)
        : api.requestAccountLink(input.platform, input.username),
  });
}

export function useVerifyAccountCode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { platform: string; code: string; username?: string }) =>
      api.verifyAccountCode(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['linked-accounts'] });
      queryClient.invalidateQueries({ queryKey: ['user-me'] });
    },
  });
}

export function useUnlinkAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (platform: string) => api.unlinkAccount(platform),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['linked-accounts'] });
      queryClient.invalidateQueries({ queryKey: ['user-me'] });
    },
  });
}
