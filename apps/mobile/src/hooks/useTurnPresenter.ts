import { useCallback, useState } from 'react';
import type { GameOutcome, TurnResult } from '@risky-chess/shared';

/** After a reconnect, only the last few missed turns are worth replaying. */
const MAX_BACKLOG = 2;

/**
 * Plays new turn results one at a time. `current` is the turn being revealed;
 * `settledOutcome` stays hidden until the last reveal finishes, so the result
 * never spoils the final toss. Derived during render, so a new result and its
 * outcome are never visible for a frame before the reveal starts.
 */
export function useTurnPresenter(history: readonly TurnResult[], outcome: GameOutcome | undefined) {
  // Turns already revealed. Starts at the current length: existing history is not replayed.
  const [shown, setShown] = useState(history.length);

  let effective = shown;
  // History shrank (restart, or a resync replaced it): nothing stale may stay queued.
  if (history.length < shown) effective = history.length;
  if (history.length - effective > MAX_BACKLOG) effective = history.length - MAX_BACKLOG;
  if (effective !== shown) setShown(effective);

  const current = effective < history.length ? history[effective] : undefined;
  const done = useCallback(() => setShown((n) => n + 1), []);

  return {
    current,
    done,
    settledOutcome: current ? undefined : outcome,
    /** The latest turn whose reveal has finished. */
    lastShown: current ? history[effective - 1] : history.at(-1),
  };
}
