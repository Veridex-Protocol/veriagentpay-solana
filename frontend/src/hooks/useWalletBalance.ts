import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

export interface WalletBalances {
  totalUsd: number;
  tokens: {
    symbol: 'USDC' | 'USDT' | 'BOT' | 'VERI';
    name: string;
    balance: number;
    priceUsd: number | null;
    valueUsd: number;
  }[];
}

export function useWalletBalance() {
  return useQuery<WalletBalances>({
    queryKey: ['wallet-balances'],
    queryFn: async () => {
      const data = await api.getBalances();
      return {
        totalUsd: data.totalUsd ?? 0,
        tokens: (data as any).tokens || [],
      };
    },
    refetchInterval: 15000,
  });
}
