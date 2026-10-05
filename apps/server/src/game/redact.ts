import { isSealed, type Color, type GameSession } from '@risky-chess/shared';

/**
 * The session as one seat may see it: a deep copy with the opponent's bets
 * sealed (count only) until the game is over. Every session-bearing payload
 * sent to a client goes through here.
 */
export function viewFor(session: GameSession, color: Color): GameSession {
  const view = structuredClone(session);
  const bets = view.modeState.bets;
  if (!bets || session.status === 'finished') return view;
  const opp: Color = color === 'w' ? 'b' : 'w';
  const theirs = bets[opp];
  if (theirs && !isSealed(theirs)) bets[opp] = { count: theirs.length };
  return view;
}
