import { useCallback, useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { MatchBet, MatchLine, MatchSide } from '@risky-chess/shared';
import { newSubmissionId } from '../lib/chess';
import { logger } from '../lib/log';
import { getSocket, request } from '../net/socket';
import { useGameStore } from '../state/gameStore';
import { useWalletStore } from '../state/walletStore';

const log = logger('watch');

export type BetResult = { ok: true; bet: MatchBet } | { ok: false; message: string; line?: MatchLine };

/**
 * A read-only seat in a public game: the sealed session, the live
 * sportsbook line and this account's bets on it. Reuses the game store
 * (reset on mount), so the same board components work for spectators.
 */
export function useWatchGame(gameId: string) {
  const state = useGameStore(useShallow((s) => ({ session: s.session, connected: s.connected, error: s.error })));
  const [line, setLine] = useState<MatchLine | null>(null);
  const [handleCents, setHandleCents] = useState(0);
  const [myBets, setMyBets] = useState<MatchBet[]>([]);

  useEffect(() => {
    const socket = getSocket();
    const st = useGameStore.getState;
    st().reset();
    const mine = (id: string) => id === gameId;

    const watch = async () => {
      const res = await request('watch_game', { gameId });
      if (!res.ok) {
        log.warn('watch_game failed', { gameId, error: res.error, message: res.message });
        return st().set({ error: res.message });
      }
      st().setSession(res.data.session);
      setLine(res.data.line);
      setMyBets(res.data.myBets);
    };
    const onConnect = () => {
      st().set({ connected: true, error: null });
      void watch();
    };
    const onDisconnect = () => st().set({ connected: false });

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('state_sync', (s) => mine(s.id) && st().setSession(s));
    socket.on('turn_started', (p) => mine(p.gameId) && st().applyTurnStarted(p));
    socket.on('turn_resolved', (r) => {
      if (!mine(r.gameId)) return;
      if (st().applyTurnResult(r) === 'gap') void watch();
    });
    socket.on('game_over', (p) => mine(p.gameId) && st().applyGameOver(p.outcome, p));
    socket.on('opponent_disconnected', (p) => mine(p.gameId) && st().setOpponentPresence(p.color, p.graceEndsAt));
    socket.on('opponent_reconnected', (p) => mine(p.gameId) && st().setOpponentPresence(p.color, null));
    socket.on('bets_revealed', (p) => mine(p.gameId) && st().applyBetsRevealed(p.bets));
    socket.on('market_update', (p) => {
      if (!mine(p.gameId)) return;
      setLine(p.line);
      setHandleCents(p.handleCents);
    });
    socket.on('match_bet_settled', (p) => {
      if (p.bet.gameId !== gameId) return;
      setMyBets((bets) => bets.map((b) => (b.id === p.bet.id ? p.bet : b)));
      useWalletStore.getState().setBalance(p.balanceCents);
    });

    if (socket.connected) onConnect();
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      for (const e of ['state_sync', 'turn_started', 'turn_resolved', 'game_over', 'opponent_disconnected', 'opponent_reconnected', 'bets_revealed', 'market_update', 'match_bet_settled'] as const) {
        socket.off(e);
      }
      if (socket.connected) void request('leave_game', { gameId });
    };
  }, [gameId]);

  const placeBet = useCallback(
    async (side: MatchSide, stakeCents: number, oddsX100: number): Promise<BetResult> => {
      const res = await request('place_match_bet', { gameId, clientBetId: newSubmissionId(), side, stakeCents, oddsX100 });
      if (!res.ok) {
        log.warn('place_match_bet rejected', { side, stakeCents, oddsX100, error: res.error, message: res.message });
        const fresh = (res.details as { line?: MatchLine } | undefined)?.line;
        if (fresh) setLine(fresh);
        return { ok: false, message: res.message, ...(fresh ? { line: fresh } : {}) };
      }
      setMyBets((bets) => [res.data.bet, ...bets]);
      useWalletStore.getState().setBalance(res.data.balanceCents);
      return { ok: true, bet: res.data.bet };
    },
    [gameId],
  );

  return { ...state, line, handleCents, myBets, placeBet };
}
