import { useCallback, useEffect, useState } from 'react';
import { applyModeEffects, mathRng, pickBotSubmission, resolveTurn } from '@risky-chess/engine';
import { BOT_THINK_MS, CLASSIC_RULES, START_FEN, type Color, type GameOutcome, type GameRules, type ModeState, type MoveInput, type TurnExtras, type TurnResult } from '@risky-chess/shared';
import { other, turnOf } from '../lib/chess';
import { errorFields, logger } from '../lib/log';
import { revealDurationMs } from '../lib/motion';

const log = logger('offline');

export interface LocalState {
  fen: string;
  history: TurnResult[];
  outcome?: GameOutcome;
  modeState: ModeState;
}

const fresh = (): LocalState => ({ fen: START_FEN, history: [], modeState: {} });

/** Offline game against the engine bot; the same rules pipeline the server runs, with a local coin. */
export function useLocalBotGame(humanColor: Color, rules: GameRules = CLASSIC_RULES) {
  const [state, setState] = useState<LocalState>(fresh);
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
            modeState: state.modeState,
            ...(extras ? { extras } : {}),
            history: state.history,
          },
          { rng: mathRng, method: 'local' },
        );
      } catch (e) {
        // An engine invariant broke (e.g. an impossible position): never silently.
        log.error('resolveTurn threw', { ...errorFields(e), turnNumber, fen: state.fen, moveA, moveB, extras, rules: rules.modes });
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
        roll: r.result.coin?.roll,
        effects: r.result.effects.map((e) => e.kind),
      });
      setError(null);
      const { result } = r;
      setState({
        fen: result.fenAfter,
        history: [...state.history, result],
        modeState: applyModeEffects(state.modeState, result.effects),
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

  const resign = useCallback(() => setState((s) => (s.outcome ? s : { ...s, outcome: { kind: 'resign', winner: botColor } })), [botColor]);
  const restart = useCallback(() => setState(fresh()), []);

  return {
    ...state,
    rules,
    myTurn: turnOf(state.fen) === humanColor && !state.outcome,
    error,
    play,
    resign,
    restart,
  };
}
