import { PIECE_VALUES, SPORTSBOOK, type Color, type MatchLine, type MatchSide, type PieceSymbol } from '@risky-chess/shared';

/** Material on the board from White's side, in pawns, read straight off the FEN placement. */
export function materialBalance(fen: string): number {
  const placement = fen.split(' ')[0] ?? '';
  let m = 0;
  for (const ch of placement) {
    const lower = ch.toLowerCase() as PieceSymbol;
    if (!(lower in PIECE_VALUES)) continue;
    m += ch === lower ? -PIECE_VALUES[lower] : PIECE_VALUES[lower];
  }
  return m;
}

/** Having the move is worth a sliver of a pawn: a coin picks the move, so tempo matters less than in chess. */
const TEMPO = 0.15;
/** One pawn of material shifts the win probability by ~10^(1/4): four pawns up ≈ 91%. */
const SCALE = 4;

export interface MatchProbabilities {
  w: number;
  b: number;
  d: number;
}

/**
 * True (margin-free) outcome probabilities from the position: a logistic on
 * material plus tempo, and a draw share that shrinks as the position becomes
 * lopsided and grows in long games. Coin-decided chess rarely draws.
 */
export function matchProbabilities(fen: string, plies: number): MatchProbabilities {
  const toMove: Color = fen.split(' ')[1] === 'b' ? 'b' : 'w';
  const m = materialBalance(fen) + (toMove === 'w' ? TEMPO : -TEMPO);
  const pw = 1 / (1 + 10 ** (-m / SCALE));
  const d = clamp(0.12 - 0.01 * Math.abs(m) + (plies >= 60 ? 0.05 : 0), 0.03, 0.2);
  return { w: (1 - d) * pw, b: (1 - d) * (1 - pw), d };
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Decimal odds ×100 for a probability, with the book's margin, clamped to the allowed range. */
export const oddsFor = (p: number): number =>
  clamp(Math.floor(100 / (p * (1 + SPORTSBOOK.MARGIN))), SPORTSBOOK.MIN_ODDS_X100, SPORTSBOOK.MAX_ODDS_X100);

/** The sportsbook line for a game in this position. Deterministic, so clients can re-derive it. */
export function priceMatch(fen: string, plies: number, asOfTurn: number): MatchLine {
  const p = matchProbabilities(fen, plies);
  return { w: oddsFor(p.w), b: oddsFor(p.b), d: oddsFor(p.d), asOfTurn };
}

/** Which side a finished game paid: the winner, or 'd'. */
export const sideFor = (winner: Color | null): MatchSide => winner ?? 'd';

/** Total returned on a winning bet. */
export const matchPayout = (stakeCents: number, oddsX100: number): number => Math.floor((stakeCents * oddsX100) / 100);
