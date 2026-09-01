import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

export function useEnvelopes() {
  return useQuery({
    queryKey: ['red-envelopes'],
    queryFn: async () => {
      const res = await api.fetchRedEnvelopes();
      return res.envelopes;
    },
    refetchInterval: 10000,
  });
}

export function useEnvelopeDetails(id: string) {
  return useQuery({
    queryKey: ['red-envelope-details', id],
    queryFn: async () => {
      const res = await api.fetchRedEnvelopeDetails(id);
      return res.envelope;
    },
    enabled: !!id,
  });
}

export function useCreateEnvelope() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { token: string; totalAmount: number; numRecipients: number; type: 'OPEN' | 'CUSTOM'; isRandom?: boolean; customRecipientId?: string; message?: string }) => {
      return await api.createRedEnvelope(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['red-envelopes'] });
    },
  });
}

export function useCancelEnvelope() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      return await api.cancelRedEnvelope(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['red-envelopes'] });
      queryClient.invalidateQueries({ queryKey: ['balances'] });
    },
  });
}

export function useClaimEnvelope() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      return await api.claimRedEnvelope(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['red-envelopes'] });
      queryClient.invalidateQueries({ queryKey: ['balances'] });
    },
  });
}
