import type { Color, GameOutcome, Square } from '@risky-chess/shared';

export const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;

export const turnOf = (fen: string): Color => (fen.split(' ')[1] === 'b' ? 'b' : 'w');
export const other = (c: Color): Color => (c === 'w' ? 'b' : 'w');

/** Rows of squares top-to-bottom as seen by `orientation`. */
export function boardSquares(orientation: Color): Square[][] {
  const ranks = orientation === 'w' ? [8, 7, 6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6, 7, 8];
  const files = orientation === 'w' ? FILES : [...FILES].reverse();
  return ranks.map((r) => files.map((f) => `${f}${r}` as Square));
}

export const isLightSquare = (sq: Square) => (sq.charCodeAt(0) - 97 + Number(sq[1])) % 2 === 1;

export function describeOutcome(outcome: GameOutcome, me: Color | null): string {
  const youWon = 'winner' in outcome && me !== null ? outcome.winner === me : null;
  const verdict = youWon === null ? '' : youWon ? 'You win' : 'You lose';
  switch (outcome.kind) {
    case 'checkmate':
      return `Checkmate: ${verdict || (outcome.winner === 'w' ? 'White wins' : 'Black wins')}`;
    case 'resign':
      return `${verdict || 'Game over'} by resignation`;
    case 'abandon':
      return youWon === false ? 'You lose: disconnected too long' : `${verdict || 'Game over'}: opponent abandoned`;
    case 'timeout':
      return `${verdict || 'Game over'} on time`;
    case 'stalemate':
      return 'Draw by stalemate';
    case 'draw':
      return `Draw: ${outcome.reason.replace('_', ' ')}`;
  }
}

export const newSubmissionId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
