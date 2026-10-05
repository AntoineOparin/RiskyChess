import { useCallback, useEffect, useState } from 'react';
import {
  applyEffects,
  applyModeEffects,
  botBets,
  gameOverEffects,
  mathRng,
  pickBotSubmission,
  placeBet as placeBetIn,
  resolveTurn,
  startingWallet,
  validateBet,
} from '@risky-chess/engine';
import {
  BOT_THINK_MS,
  CLASSIC_RULES,
  hasMode,
  START_FEN,
  type Color,
  type GameOutcome,
  type GameRules,
  type ModeState,
  type MoveInput,
  type TurnExtras,
  type TurnResult,
  type Wallet,
} from '@risky-chess/shared';
import { newSubmissionId, other, turnOf } from '../lib/chess';
import type { BetOutcome, BetRequest } from '../modes/types';
import { errorFields, logger } from '../lib/log';
import { revealDurationMs } from '../lib/motion';

const log = logger('offline');

export interface LocalState {
  fen: string;
  history: TurnResult[];
  outcome?: GameOutcome;
  wallet?: Wallet;
  modeState: ModeState;
}

/** A new game; with Side Bets on, the bot places its sealed bets up front. */
const fresh = (rules: GameRules, botColor: Color): LocalState => {
  const wallet = startingWallet(rules);
  let state: LocalState = { fen: START_FEN, history: [], modeState: {}, ...(wallet ? { wallet } : {}) };
  if (hasMode(rules, 'side_bets')) {
    for (const req of botBets({ ...state, rules, turnNumber: 1 }, botColor, mathRng)) state = withBet(state, rules, botColor, req) ?? state;
  }
  return state;
};

/** The state with a bet placed, or null if the engine rejects it. */
function withBet(state: LocalState, rules: GameRules, color: Color, req: BetRequest): LocalState | null {
  const session = { ...state, rules, turnNumber: state.history.length + 1 };
  if (validateBet(session, color, req, !!state.outcome)) return null;
  const placed = placeBetIn(session, color, req, newSubmissionId());
  return { ...state, modeState: placed.modeState, ...(state.wallet ? { wallet: applyEffects(state.wallet, placed.effects) } : {}) };
}

/** Offline game against the engine bot; the same rules pipeline the server runs, with a local coin. */
export function useLocalBotGame(humanColor: Color, rules: GameRules = CLASSIC_RULES) {
  const [state, setState] = useState<LocalState>(() => fresh(rules, other(humanColor)));
  const [error, setError] = useState<string | null>(null);

  const play = useCallback(
    (moveA: MoveInput, moveB: MoveInput | null, extras?: TurnExtras) => {
      if (state.outcome) return;
      const turnNumber = state.history.length + 1;
      let r: ReturnType<typeof resolveTurn>;
      try {
        r = resolveTurn(
          {
            gameId: 'local',
            turnNumber,
            fen: state.fen,
            previousFens: state.history.map((h) => h.fenBefore),
            moveA,
            moveB,
            rules,
            ...(state.wallet ? { wallet: state.wallet } : {}),
            modeState: state.modeState,
            ...(extras ? { extras } : {}),
            history: state.history,
          },
          { rng: mathRng, method: 'local' },
        );
      } catch (e) {
        // An engine invariant broke (e.g. an impossible position): never silently.
        log.error('resolveTurn threw', { ...errorFields(e), turnNumber, fen: state.fen, moveA, moveB, extras, rules: rules.modes, wallet: state.wallet });
        setError('Something went wrong resolving that turn.');
        return;
      }
      if (!r.ok) {
        log.warn('turn rejected', { error: r.error, message: r.message, turnNumber, fen: state.fen, moveA, moveB, extras });
        setError(r.message);
        return;
      }
      log.debug('turn resolved', {
        turnNumber,
        mover: r.result.mover,
        executed: r.result.executed.lan,
        odds: r.result.odds.A,
        roll: r.result.coin?.roll,
        effects: r.result.effects.map((e) => e.kind + ('reason' in e ? `:${e.reason}` : '')),
        walletAfter: r.result.walletAfter,
      });
      setError(null);
      const { result } = r;
      setState({
        fen: result.fenAfter,
        history: [...state.history, result],
        modeState: applyModeEffects(state.modeState, result.effects),
        ...(result.walletAfter ? { wallet: result.walletAfter } : {}),
        ...(result.outcome ? { outcome: result.outcome } : {}),
      });
    },
    [state, rules],
  );

  const botColor = other(humanColor);
  const botToMove = turnOf(state.fen) === botColor && !state.outcome;
  useEffect(() => {
    if (!botToMove) return;
    // Let the player's reveal finish before the bot "thinks".
    const last = state.history.at(-1);
    const delay = BOT_THINK_MS.min + (last ? revealDurationMs(last, true) : 0);
    const t = setTimeout(() => {
      const pick = pickBotSubmission(state.fen, { ...state, rules, turnNumber: state.history.length + 1 }, mathRng, 'greedy');
      log.debug('bot picks', { moveA: pick.moveA, moveB: pick.moveB, extras: pick.extras });
      play(pick.moveA, pick.moveB, pick.extras);
    }, delay);
    return () => clearTimeout(t);
    // Re-arm only when the position or history changes, not on every state object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botToMove, state.fen, state.history.length, play]);

  /** Ends the game off the board, settling anything modes still hold open. */
  const end = useCallback(
    (outcome: GameOutcome) =>
      setState((s) => {
        if (s.outcome) return s;
        const effects = gameOverEffects({ ...s, rules, turnNumber: s.history.length + 1 }, outcome);
        return {
          ...s,
          outcome,
          modeState: applyModeEffects(s.modeState, effects),
          ...(s.wallet ? { wallet: applyEffects(s.wallet, effects) } : {}),
        };
      }),
    [rules],
  );
  const resign = useCallback(() => end({ kind: 'resign', winner: botColor }), [end, botColor]);
  const restart = useCallback(() => setState(fresh(rules, botColor)), [rules, botColor]);

  /** Same rules as online, against the local engine. */
  const placeBet = useCallback(
    async (req: BetRequest): Promise<BetOutcome> => {
      const session = { ...state, rules, turnNumber: state.history.length + 1 };
      const bad = validateBet(session, humanColor, req, !!state.outcome);
      if (bad) {
        log.warn('bet rejected', { ...req, error: bad.error, message: bad.message, turnNumber: session.turnNumber });
        return { ok: false, message: bad.message };
      }
      setState((s) => withBet(s, rules, humanColor, req) ?? s);
      return { ok: true };
    },
    [state, rules, humanColor],
  );

  return {
    ...state,
    rules,
    myTurn: turnOf(state.fen) === humanColor && !state.outcome,
    error,
    play,
    resign,
    restart,
    placeBet,
  };
}
