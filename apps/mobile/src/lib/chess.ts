import type { Color, GameOutcome, PieceSymbol, Square } from '@risky-chess/shared';

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

/** Top-left corner of `sq` in board pixels, as seen by `orientation`. */
export function squareOrigin(sq: Square, orientation: Color, cell: number): { x: number; y: number } {
  const file = sq.charCodeAt(0) - 97;
  const rank = Number(sq[1]);
  const col = orientation === 'w' ? file : 7 - file;
  const row = orientation === 'w' ? 8 - rank : rank - 1;
  return { x: col * cell, y: row * cell };
}

const PIECE_VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 } as const;
const START_COUNT = { p: 8, n: 2, b: 2, r: 2, q: 1 } as const;
const CAPTURABLE = ['q', 'r', 'b', 'n', 'p'] as const;

export interface MaterialSide {
  /** Opponent pieces this side has taken, most valuable first. */
  captured: Exclude<PieceSymbol, 'k'>[];
  /** Material on the board relative to the opponent: positive when ahead. */
  score: number;
}

/**
 * Captures and material balance from a FEN's board field alone (no move parsing).
 * Captured = the opponent's pieces missing from their starting set; the score
 * counts what is on the board, so promotions are reflected correctly.
 */
export function materialSummary(fen: string): Record<Color, MaterialSide> {
  const count = { w: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 }, b: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 } };
  const total = { w: 0, b: 0 };
  for (const ch of fen.split(' ')[0] ?? '') {
    const lower = ch.toLowerCase();
    if (!(lower in PIECE_VALUE)) continue;
    const side = ch === lower ? 'b' : 'w';
    const type = lower as PieceSymbol;
    count[side][type]++;
    total[side] += PIECE_VALUE[type];
  }
  const taken = (victim: Color) =>
    CAPTURABLE.flatMap((t) => Array<Exclude<PieceSymbol, 'k'>>(Math.max(0, START_COUNT[t] - count[victim][t])).fill(t));
  return {
    w: { captured: taken('b'), score: total.w - total.b },
    b: { captured: taken('w'), score: total.b - total.w },
  };
}
