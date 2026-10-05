import { useCallback, useEffect, useState } from 'react';
import { applyEffects, applyModeEffects, gameOverEffects, mathRng, pickBotSubmission, resolveTurn, startingWallet } from '@risky-chess/engine';
import {
  BOT_THINK_MS,
  CLASSIC_RULES,
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
import { other, turnOf } from '../lib/chess';
import { revealDurationMs } from '../lib/motion';

export interface LocalState {
  fen: string;
  history: TurnResult[];
  outcome?: GameOutcome;
  wallet?: Wallet;
  modeState: ModeState;
}

const fresh = (rules: GameRules): LocalState => {
  const wallet = startingWallet(rules);
  return { fen: START_FEN, history: [], modeState: {}, ...(wallet ? { wallet } : {}) };
};

/** Offline game against the engine bot; the same rules pipeline the server runs, with a local coin. */
export function useLocalBotGame(humanColor: Color, rules: GameRules = CLASSIC_RULES) {
  const [state, setState] = useState<LocalState>(() => fresh(rules));
  const [error, setError] = useState<string | null>(null);

  const play = useCallback(
    (moveA: MoveInput, moveB: MoveInput | null, extras?: TurnExtras) => {
      if (state.outcome) return;
      const r = resolveTurn(
        {
          gameId: 'local',
          turnNumber: state.history.length + 1,
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
      if (!r.ok) {
        setError(r.message);
        return;
      }
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
  const restart = useCallback(() => setState(fresh(rules)), [rules]);

  return {
    ...state,
    rules,
    myTurn: turnOf(state.fen) === humanColor && !state.outcome,
    error,
    play,
    resign,
    restart,
    setState,
  };
}
