import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

export function useRequests(params?: { filter?: string; status?: string }) {
  return useQuery({
    queryKey: ['requests', params?.filter, params?.status],
    queryFn: async () => {
      const res = await api.fetchPaymentRequests(params);
      return res.requests;
    },
    refetchInterval: 10000,
  });
}

export function useRequestDetails(id: string) {
  return useQuery({
    queryKey: ['request-details', id],
    queryFn: async () => {
      const res = await api.fetchPaymentRequestDetails(id);
      return res.request;
    },
    enabled: !!id,
  });
}

export function useCreateRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { recipientIdentifier: string; token: string; amount: number; note?: string; expiresInDays?: number }) => {
      return await api.createPaymentRequest(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requests'] });
    },
  });
}

export function usePayRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      return await api.payPaymentRequest(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requests'] });
      queryClient.invalidateQueries({ queryKey: ['balances'] });
    },
  });
}

export function useCancelRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      return await api.cancelPaymentRequest(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requests'] });
    },
  });
}

export function useRemindRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      return await api.remindPaymentRequest(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requests'] });
    },
  });
}
