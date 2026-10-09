import { useEffect } from 'react';
import type { User, UserStats } from '@risky-chess/shared';
import { logger } from '../lib/log';
import { useAuthStore } from '../state/authStore';
import { useWalletStore } from '../state/walletStore';
import { api } from './api';
import { getSocket } from './socket';

const log = logger('presence');

/** Pulls the account and its balance from the server. */
export async function refreshMe(): Promise<void> {
  try {
    const me = await api<{ user: User; stats: UserStats }>('/me');
    useAuthStore.getState().setUser(me.user);
    useWalletStore.getState().setBalance(me.user.balanceCents);
    useWalletStore.getState().setStats(me.stats);
  } catch (e) {
    log.warn('refreshMe failed', { error: String(e) });
  }
}

/**
 * Keeps the balance live for the whole app: refreshes on every (re)connect
 * and applies balance_updated pushes. Mount once, in the root layout.
 */
export function usePresence(): void {
  const token = useAuthStore((s) => s.token);
  useEffect(() => {
    if (!token) return;
    const socket = getSocket();
    const onConnect = () => void refreshMe();
    const onBalance = (p: { balanceCents: number }) => useWalletStore.getState().setBalance(p.balanceCents);
    socket.on('connect', onConnect);
    socket.on('balance_updated', onBalance);
    void refreshMe();
    return () => {
      socket.off('connect', onConnect);
      socket.off('balance_updated', onBalance);
    };
  }, [token]);
}
