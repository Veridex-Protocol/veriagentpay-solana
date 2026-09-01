'use client';

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useWalletStore } from '../../store/useWalletStore';
import { useToast } from './NotificationProvider';

interface SocketContextType {
  isConnected: boolean;
}

const SocketContext = createContext<SocketContextType>({ isConnected: false });

export const useSocket = () => useContext(SocketContext);

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const address = useWalletStore((state) => state.address);
  const token = useWalletStore((state) => state.token);
  const queryClient = useQueryClient();
  const toast = useToast();

  const [isConnected, setIsConnected] = useState(false);

  const socketRef = useRef<any>(null);

  useEffect(() => {
    if (!address) return;

    let socket: any;

    const connect = async () => {
      const { io } = await import('socket.io-client');
      // WebSocket upgrades are not proxied by Next rewrites, so this needs a
      // directly reachable backend origin rather than the same-origin /api path.
      const base = process.env.NEXT_PUBLIC_WS_URL || process.env.NEXT_PUBLIC_API_URL || '';

      socket = io(base, {
        auth: token ? { token } : undefined,
        // The gateway reads `address` from the handshake query to auto-join the
        // room; sending only `walletAddress` lands the client in `user:anonymous`.
        query: { address, walletAddress: address },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 2000,
        reconnectionAttempts: 10,
      });

      socketRef.current = socket;

      socket.on('connect', () => {
        setIsConnected(true);
        // The gateway auto-joins `user:${address}` from the handshake query.
        // Also emit joinRoom so any explicit subscription logic fires.
        socket.emit('joinRoom', { address });
      });

      socket.on('disconnect', () => setIsConnected(false));

      // External deposit credited by the listener service
      socket.on('deposit:new', (payload: { amount: string; token: string; from: string; txHash: string }) => {
        // Immediately refresh balance and activity feeds
        queryClient.invalidateQueries({ queryKey: ['balances'] });
        queryClient.invalidateQueries({ queryKey: ['activity'] });
        queryClient.invalidateQueries({ queryKey: ['deposits'] });

        toast.success(`+${payload.amount} ${payload.token} from ${payload.from.slice(0, 6)}…${payload.from.slice(-4)}`, {
          title: 'Deposit Received',
        });
      });

      // Notification records are stored under the authenticated user id.  The
      // gateway joins that room from the signed socket token and the public
      // wallet room for deposit events, so both real-time channels stay live.
      socket.on('notification:new', (payload: { title?: string; body?: string }) => {
        queryClient.invalidateQueries({ queryKey: ['notifications'] });
        queryClient.invalidateQueries({ queryKey: ['unread-count'] });
        toast.info(payload?.body || 'You have a new wallet update.', {
          title: payload?.title || 'Notification',
        });
      });

      socket.on('notification:unread-count', ({ count }: { count?: number }) => {
        if (typeof count === 'number') queryClient.setQueryData(['unread-count'], count);
      });
    };

    connect().catch(() => {
      // Socket is best-effort: fall back to poll-based updates already on the hooks.
      setIsConnected(false);
    });

    return () => {
      socket?.disconnect();
      socketRef.current = null;
      setIsConnected(false);
    };
  }, [address, token, queryClient, toast]);

  return (
    <SocketContext.Provider value={{ isConnected }}>
      {children}
    </SocketContext.Provider>
  );
};
