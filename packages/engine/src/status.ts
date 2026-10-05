import type { Chess } from 'chess.js';
import type { GameOutcome } from '@gamble/shared';

/** Board, side to move, castling rights and en passant: the FIDE identity of a position. */
export function positionKey(fen: string): string {
  return fen.split(' ').slice(0, 4).join(' ');
}

/**
 * Terminal outcome of the position, or undefined if play continues.
 * `previousFens` are all positions reached before this one; chess.js's own
 * repetition check needs full move history, which we avoid replaying.
 */
export function deriveOutcome(chess: Chess, previousFens: readonly string[]): GameOutcome | undefined {
  if (chess.isCheckmate()) return { kind: 'checkmate', winner: chess.turn() === 'w' ? 'b' : 'w' };
  if (chess.isStalemate()) return { kind: 'stalemate' };
  if (chess.isInsufficientMaterial()) return { kind: 'draw', reason: 'insufficient_material' };
  const key = positionKey(chess.fen());
  const seen = previousFens.reduce((n, f) => (positionKey(f) === key ? n + 1 : n), 1);
  if (seen >= 3) return { kind: 'draw', reason: 'threefold' };
  if (chess.isDrawByFiftyMoves()) return { kind: 'draw', reason: 'fifty_move' };
  return undefined;
}
