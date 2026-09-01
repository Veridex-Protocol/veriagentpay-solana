import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

export function useNotifications() {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const res: any = await api.getNotifications();
      if (Array.isArray(res)) return res;
      if (Array.isArray(res?.notifications)) return res.notifications;
      // The paginated API response is wrapped as
      // `{ notifications: { data, page, totalCount, ... } }`.
      if (Array.isArray(res?.notifications?.data)) return res.notifications.data;
      if (Array.isArray(res?.data)) return res.data;
      return [];
    },
    staleTime: 30000,
  });
}

export function useUnreadCount() {
  return useQuery({
    queryKey: ['unread-count'],
    queryFn: async () => {
      const res: any = await api.getUnreadCount();
      if (typeof res === 'number') return res;
      if (typeof res?.count === 'number') return res.count;
      if (typeof res?.unreadCount === 'number') return res.unreadCount;
      return 0;
    },
    refetchInterval: 30000,
  });
}

export function useMarkRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.markNotificationRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['unread-count'] });
    },
  });
}

export function useMarkAllRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.markAllNotificationsRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['unread-count'] });
    },
  });
}
