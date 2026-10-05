import { create } from 'zustand';
import type { Color, GameOutcome, GameSession, TurnResult, TurnStartedPayload } from '@risky-chess/shared';

interface OnlineGameState {
  session: GameSession | null;
  color: Color | null;
  connected: boolean;
  submitting: boolean;
  error: string | null;
  /** Set while the opponent is disconnected: when they forfeit. */
  opponentGraceEndsAt: number | null;

  reset(): void;
  setSession(session: GameSession, color?: Color): void;
  applyTurnResult(r: TurnResult): 'applied' | 'duplicate' | 'gap';
  applyTurnStarted(p: TurnStartedPayload): void;
  applyGameOver(outcome: GameOutcome): void;
  setOpponentPresence(color: Color, graceEndsAt: number | null): void;
  set(partial: Partial<Pick<OnlineGameState, 'connected' | 'submitting' | 'error'>>): void;
}

const initial = { session: null, color: null, connected: false, submitting: false, error: null, opponentGraceEndsAt: null };

/** Mirror of the server's session. The server FEN always wins. */
export const useGameStore = create<OnlineGameState>()((set, get) => ({
  ...initial,

  reset: () => set(initial),

  setSession: (session, color) => {
    const me = color ?? get().color;
    const opp = me === 'w' ? session.players.b : session.players.w;
    set({
      session,
      ...(color ? { color } : {}),
      opponentGraceEndsAt: opp && !opp.connected && session.mode === 'pvp' ? (session.graceEndsAt ?? get().opponentGraceEndsAt) : null,
    });
  },

  applyTurnResult: (r) => {
    const s = get().session;
    if (!s || r.turnNumber < s.turnNumber) return 'duplicate';
    if (r.turnNumber > s.turnNumber) return 'gap';
    set({
      session: {
        ...s,
        fen: r.fenAfter,
        turn: s.turn === 'w' ? 'b' : 'w',
        turnNumber: s.turnNumber + 1,
        history: [...s.history, r],
        status: r.status,
        ...(r.outcome ? { outcome: r.outcome } : {}),
      },
      submitting: false,
    });
    return 'applied';
  },

  applyTurnStarted: (p) => {
    const s = get().session;
    if (s && p.turnNumber === s.turnNumber) set({ session: { ...s, status: p.status } });
  },

  applyGameOver: (outcome) => {
    const s = get().session;
    if (s) set({ session: { ...s, status: 'finished', outcome }, opponentGraceEndsAt: null, submitting: false });
  },

  setOpponentPresence: (color, graceEndsAt) => {
    const { session: s, color: me } = get();
    if (!s || color === me) return;
    const slot = s.players[color];
    set({
      opponentGraceEndsAt: graceEndsAt,
      session: {
        ...s,
        players: { ...s.players, [color]: slot ? { ...slot, connected: graceEndsAt === null } : slot },
        status: graceEndsAt === null && s.status === 'paused_disconnect' ? 'awaiting_submission' : s.status,
      },
    });
  },

  set: (partial) => set(partial),
}));
