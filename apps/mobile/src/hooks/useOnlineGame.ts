import { useCallback, useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { MoveInput, TurnExtras } from '@risky-chess/shared';
import { newSubmissionId } from '../lib/chess';
import { newClientSeed } from '../lib/fairness';
import { loadSeat } from '../net/seats';
import { getSocket, request } from '../net/socket';
import { useGameStore } from '../state/gameStore';
import { logger } from '../lib/log';
import type { BetOutcome, BetRequest } from '../modes/types';

const SUBMIT_ATTEMPTS = 3;
const log = logger('online');

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
      else log.warn('request_state failed', { gameId, error: res.error, message: res.message });
    };

    const rejoin = async () => {
      const seat = await loadSeat(gameId);
      if (!seat) {
        log.warn('no stored seat for game', { gameId });
        return st().set({ error: 'You are not seated in this game.' });
      }
      const res = await request('rejoin_game', { gameId, playerToken: seat.playerToken });
      if (res.ok) {
        log.info('rejoined', { gameId, color: res.data.color, turnNumber: res.data.session.turnNumber, status: res.data.session.status });
        st().setSession(res.data.session, res.data.color);
      } else {
        log.warn('rejoin failed', { gameId, error: res.error, message: res.message });
        st().set({ error: res.message });
      }
    };

    const onConnect = () => {
      log.info('socket connected', { gameId });
      st().set({ connected: true, error: null });
      void rejoin();
    };
    const onDisconnect = (reason: string) => {
      log.warn('socket disconnected', { gameId, reason });
      st().set({ connected: false });
    };
    const mine = (id: string) => id === gameId;

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('game_started', (s) => mine(s.id) && st().setSession(s));
    socket.on('state_sync', (s) => mine(s.id) && st().setSession(s));
    socket.on('turn_started', (p) => {
      if (!mine(p.gameId)) return;
      log.debug('turn_started', { turnNumber: p.turnNumber, turn: p.turn, status: p.status, commitment: p.commitment?.slice(0, 12) });
      st().applyTurnStarted(p);
    });
    socket.on('turn_resolved', (r) => {
      if (!mine(r.gameId)) return;
      const applied = st().applyTurnResult(r);
      log.debug('turn_resolved', {
        turnNumber: r.turnNumber,
        mover: r.mover,
        pair: [r.moveA.lan, r.moveB?.lan ?? null],
        executed: r.executed.lan,
        odds: r.odds.A,
        roll: r.coin?.roll,
        effects: r.effects.map((e) => e.kind + ('reason' in e ? `:${e.reason}` : '')),
        walletAfter: r.walletAfter,
        applied,
      });
      if (applied === 'gap') {
        log.warn('missed a turn; resyncing', { got: r.turnNumber, had: st().session?.turnNumber });
        void sync();
      }
    });
    socket.on('game_over', (p) => {
      if (!mine(p.gameId)) return;
      log.info('game_over', { outcome: p.outcome, settled: p.effects?.length ?? 0, walletAfter: p.walletAfter });
      st().applyGameOver(p.outcome, p);
    });
    socket.on('opponent_disconnected', (p) => mine(p.gameId) && st().setOpponentPresence(p.color, p.graceEndsAt));
    socket.on('opponent_reconnected', (p) => mine(p.gameId) && st().setOpponentPresence(p.color, null));
    socket.on('bets_revealed', (p) => {
      if (!mine(p.gameId)) return;
      log.debug('bets_revealed', { w: p.bets.w?.length ?? 0, b: p.bets.b?.length ?? 0 });
      st().applyBetsRevealed(p.bets);
    });
    socket.on('error', (p) => log.error('server error event', p));

    if (socket.connected) onConnect();

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      for (const e of ['game_started', 'state_sync', 'turn_started', 'turn_resolved', 'game_over', 'opponent_disconnected', 'opponent_reconnected', 'bets_revealed', 'error'] as const) {
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
      // A fresh client seed per turn, kept across retries of the same submission.
      const payload = { gameId, turnNumber: s.turnNumber, clientSubmissionId: newSubmissionId(), moveA, moveB, extras: { ...extras, clientSeed: newClientSeed() } };
      log.debug('submit', { turnNumber: payload.turnNumber, moveA: moveA, moveB: moveB, extras: payload.extras });
      let res = await request('submit_moves', payload);
      for (let i = 1; i < SUBMIT_ATTEMPTS && !res.ok && res.error === 'NETWORK'; i++) {
        log.warn('submit timed out; retrying', { attempt: i + 1, turnNumber: payload.turnNumber });
        res = await request('submit_moves', payload);
      }
      if (!res.ok) {
        log.warn('submit rejected', { error: res.error, message: res.message, turnNumber: payload.turnNumber, fen: s.fen, moveA, moveB, extras: payload.extras });
        useGameStore.getState().set({ submitting: false, error: res.message });
        if (res.error === 'STALE_TURN') {
          const fresh = await request('request_state', { gameId });
          if (fresh.ok) useGameStore.getState().setSession(fresh.data.session);
        }
      }
    },
    [gameId],
  );

  /** A sealed side bet; the server answers with a state_sync carrying the new wallet and bet. */
  const placeBet = useCallback(
    async (req: BetRequest): Promise<BetOutcome> => {
      const res = await request('place_bet', { gameId, clientBetId: newSubmissionId(), ...req });
      if (!res.ok) log.warn('place_bet rejected', { ...req, error: res.error, message: res.message });
      else log.debug('bet placed', { kind: res.data.bet.kind, stake: res.data.bet.stake, payoutX100: res.data.bet.payoutX100 });
      return res.ok ? { ok: true } : { ok: false, message: res.message };
    },
    [gameId],
  );

  const resign = useCallback(async () => {
    const res = await request('resign', { gameId });
    if (!res.ok) {
      log.warn('resign failed', { error: res.error, message: res.message });
      useGameStore.getState().set({ error: res.message });
    }
  }, [gameId]);

  return { ...state, submit, resign, placeBet };
}
