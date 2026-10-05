import { useCallback, useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { MoveInput, TurnExtras } from '@risky-chess/shared';
import { newSubmissionId } from '../lib/chess';
import { loadSeat } from '../net/seats';
import { getSocket, request } from '../net/socket';
import { useGameStore } from '../state/gameStore';

const SUBMIT_ATTEMPTS = 3;

/**
 * Binds the store to the server for one game. (Re)joins by token on mount
 * and after every reconnect, so a dropped socket resumes the same seat.
 */
export function useOnlineGame(gameId: string) {
  // Only the fields the screen renders; actions are read via getState().
  const state = useGameStore(
    useShallow((s) => ({
      session: s.session,
      color: s.color,
      connected: s.connected,
      submitting: s.submitting,
      error: s.error,
      opponentGraceEndsAt: s.opponentGraceEndsAt,
    })),
  );

  useEffect(() => {
    const socket = getSocket();
    const st = useGameStore.getState;
    st().reset();

    const sync = async () => {
      const res = await request('request_state', { gameId });
      if (res.ok) st().setSession(res.data.session);
    };

    const rejoin = async () => {
      const seat = await loadSeat(gameId);
      if (!seat) return st().set({ error: 'You are not seated in this game.' });
      const res = await request('rejoin_game', { gameId, playerToken: seat.playerToken });
      if (res.ok) st().setSession(res.data.session, res.data.color);
      else st().set({ error: res.message });
    };

    const onConnect = () => {
      st().set({ connected: true, error: null });
      void rejoin();
    };
    const onDisconnect = () => st().set({ connected: false });
    const mine = (id: string) => id === gameId;

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('game_started', (s) => mine(s.id) && st().setSession(s));
    socket.on('state_sync', (s) => mine(s.id) && st().setSession(s));
    socket.on('turn_started', (p) => mine(p.gameId) && st().applyTurnStarted(p));
    socket.on('turn_resolved', (r) => {
      if (mine(r.gameId) && st().applyTurnResult(r) === 'gap') void sync();
    });
    socket.on('game_over', (p) => mine(p.gameId) && st().applyGameOver(p.outcome, p));
    socket.on('opponent_disconnected', (p) => mine(p.gameId) && st().setOpponentPresence(p.color, p.graceEndsAt));
    socket.on('opponent_reconnected', (p) => mine(p.gameId) && st().setOpponentPresence(p.color, null));

    if (socket.connected) onConnect();

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      for (const e of ['game_started', 'state_sync', 'turn_started', 'turn_resolved', 'game_over', 'opponent_disconnected', 'opponent_reconnected'] as const) {
        socket.off(e);
      }
    };
  }, [gameId]);

  const submit = useCallback(
    async (moveA: MoveInput, moveB: MoveInput | null, extras?: TurnExtras) => {
      const s = useGameStore.getState().session;
      if (!s) return;
      useGameStore.getState().set({ submitting: true, error: null });
      // One id across retries: the server dedupes, so a lost ack never double-resolves.
      const payload = { gameId, turnNumber: s.turnNumber, clientSubmissionId: newSubmissionId(), moveA, moveB, ...(extras ? { extras } : {}) };
      let res = await request('submit_moves', payload);
      for (let i = 1; i < SUBMIT_ATTEMPTS && !res.ok && res.error === 'NETWORK'; i++) {
        res = await request('submit_moves', payload);
      }
      if (!res.ok) {
        useGameStore.getState().set({ submitting: false, error: res.message });
        if (res.error === 'STALE_TURN') {
          const fresh = await request('request_state', { gameId });
          if (fresh.ok) useGameStore.getState().setSession(fresh.data.session);
        }
      }
    },
    [gameId],
  );

  const resign = useCallback(async () => {
    const res = await request('resign', { gameId });
    if (!res.ok) useGameStore.getState().set({ error: res.message });
  }, [gameId]);

  return { ...state, submit, resign };
}
