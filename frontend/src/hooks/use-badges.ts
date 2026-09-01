import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

export function useMyBadges() {
  return useQuery({
    queryKey: ['my-badges'],
    queryFn: async () => {
      const res = await api.fetchMyBadges();
      return res;
    },
  });
}

export function useGlobalLeaderboard(limit = 100) {
  return useQuery({
    queryKey: ['global-leaderboard', limit],
    queryFn: async () => {
      const res = await api.fetchGlobalLeaderboard(limit);
      return res;
    },
  });
}

export function useMyRank() {
  return useQuery({
    queryKey: ['my-rank'],
    queryFn: async () => {
      const res = await api.fetchMyRank();
      return res;
    },
  });
}

export function useShareCardPayload() {
  return useQuery({
    queryKey: ['share-card-payload'],
    queryFn: async () => {
      const res = await api.fetchShareCardPayload();
      return res;
    },
  });
}

export function useInviteQr() {
  return useQuery({
    queryKey: ['invite-qr'],
    queryFn: async () => {
      const res = await api.fetchInviteQr();
      return res;
    },
  });
}
