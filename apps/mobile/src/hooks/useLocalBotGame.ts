import { useCallback, useEffect, useState } from 'react';
import { mathRng, pickBotPair, resolveTurn, rngTosser } from '@risky-chess/engine';
import { BOT_THINK_MS, START_FEN, type Color, type GameOutcome, type MoveInput, type TurnResult } from '@risky-chess/shared';
import { other, turnOf } from '../lib/chess';

const tosser = rngTosser(mathRng, 'local');
/** Wait for the previous coin animation before the bot "thinks". */
const BOT_DELAY_MS = 2200 + BOT_THINK_MS.min;

interface LocalState {
  fen: string;
  history: TurnResult[];
  outcome?: GameOutcome;
}

/** Offline game against the engine bot; the same rules package the server uses. */
export function useLocalBotGame(humanColor: Color) {
  const [state, setState] = useState<LocalState>({ fen: START_FEN, history: [] });
  const [error, setError] = useState<string | null>(null);

  const play = useCallback(
    (moveA: MoveInput, moveB: MoveInput | null) => {
      if (state.outcome) return;
      const r = resolveTurn(
        {
          gameId: 'local',
          turnNumber: state.history.length + 1,
          fen: state.fen,
          previousFens: state.history.map((h) => h.fenBefore),
          moveA,
          moveB,
        },
        tosser,
      );
      if (!r.ok) {
        setError(r.message);
        return;
      }
      setError(null);
      setState({
        fen: r.result.fenAfter,
        history: [...state.history, r.result],
        ...(r.result.outcome ? { outcome: r.result.outcome } : {}),
      });
    },
    [state],
  );

  const botColor = other(humanColor);
  const botToMove = turnOf(state.fen) === botColor && !state.outcome;
  useEffect(() => {
    if (!botToMove) return;
    const delay = state.history.length === 0 ? BOT_THINK_MS.min : BOT_DELAY_MS;
    const t = setTimeout(() => {
      const pair = pickBotPair(state.fen, mathRng, 'greedy');
      play(pair.moveA, pair.moveB);
    }, delay);
    return () => clearTimeout(t);
  }, [botToMove, state.fen, state.history.length, play]);

  const resign = useCallback(() => setState((s) => ({ ...s, outcome: { kind: 'resign', winner: botColor } })), [botColor]);
  const restart = useCallback(() => setState({ fen: START_FEN, history: [] }), []);

  return {
    ...state,
    myTurn: turnOf(state.fen) === humanColor && !state.outcome,
    error,
    play,
    resign,
    restart,
  };
}
