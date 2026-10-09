import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import type { LobbySnapshot } from '@risky-chess/shared';
import { logger } from '../lib/log';
import { getSocket, request } from '../net/socket';
import { useOnline } from '../net/useOnline';

const log = logger('lobby');

/**
 * Open tables, live markets and the wager feed, live while the screen is
 * focused: joins the lobby room on focus, leaves on blur.
 */
export function useLobby(): { snapshot: LobbySnapshot | null; online: boolean; refresh: () => void } {
  const [snapshot, setSnapshot] = useState<LobbySnapshot | null>(null);
  const online = useOnline();

  const refresh = useCallback(() => {
    void request('join_lobby', {}).then((res) => {
      if (res.ok) setSnapshot(res.data);
      else log.warn('join_lobby failed', { error: res.error, message: res.message });
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      const socket = getSocket();
      const onUpdate = (p: LobbySnapshot) => setSnapshot(p);
      socket.on('lobby_update', onUpdate);
      socket.on('connect', refresh);
      if (socket.connected) refresh();
      return () => {
        socket.off('lobby_update', onUpdate);
        socket.off('connect', refresh);
        if (socket.connected) void request('leave_lobby', {});
      };
    }, [refresh]),
  );

  return { snapshot, online, refresh };
}
