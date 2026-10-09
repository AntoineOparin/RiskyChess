import { isSealed, type Color, type GameSession } from '@risky-chess/shared';

/**
 * The session as one seat may see it: a deep copy with the opponent's bets
 * sealed (count only) until the game is over. A spectator (`color` null)
 * sees both seats sealed. Every session-bearing payload sent to a client
 * goes through here.
 */
export function viewFor(session: GameSession, color: Color | null): GameSession {
  const view = structuredClone(session);
  const bets = view.modeState.bets;
  if (!bets || session.status === 'finished') return view;
  for (const c of ['w', 'b'] as const) {
    if (c === color) continue;
    const theirs = bets[c];
    if (theirs && !isSealed(theirs)) bets[c] = { count: theirs.length };
  }
  return view;
}
