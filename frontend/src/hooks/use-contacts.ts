import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

export interface ContactItem {
  id: string;
  name: string;
  platform: 'telegram' | 'whatsapp' | 'discord' | 'slack' | 'phone';
  identifier: string;
  walletAddress?: string | null;
  createdAt?: string;
}

export function useContacts() {
  return useQuery<ContactItem[]>({
    queryKey: ['contacts'],
    queryFn: async () => {
      const res = await api.fetchContacts();
      return res?.contacts || [];
    },
  });
}

export function useCreateContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; platform: string; identifier: string; walletAddress?: string }) =>
      api.createContact(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
    },
  });
}

export function useUpdateContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name?: string; identifier?: string; platform?: string } }) =>
      api.updateContact(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
    },
  });
}

export function useDeleteContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteContact(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
    },
  });
}
