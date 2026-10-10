import { Chess, type Move } from 'chess.js';
import { PIECE_VALUES } from '@risky-chess/shared';

/** Cheap one-ply heuristic: material won, promotions, checks, mates, minus hanging the moved piece. */
export function scoreMove(fen: string, m: Move): number {
  let score = 0;
  if (m.captured) score += PIECE_VALUES[m.captured];
  if (m.promotion) score += PIECE_VALUES[m.promotion] - PIECE_VALUES.p;

  const after = new Chess(fen);
  after.move({ from: m.from, to: m.to, ...(m.promotion ? { promotion: m.promotion } : {}) });
  if (after.isCheckmate()) return 1000;
  if (after.isDraw()) score -= 5;
  if (after.inCheck()) score += 0.5;

  const opponent = after.turn();
  const attackers = after.attackers(m.to, opponent);
  if (attackers.length > 0) {
    const moved = PIECE_VALUES[m.promotion ?? m.piece];
    const defended = after.isAttacked(m.to, m.color);
    const cheapestAttacker = Math.min(
      ...attackers.map((sq) => PIECE_VALUES[after.get(sq)?.type ?? 'k'] || 100),
    );
    score -= defended ? Math.max(0, moved - cheapestAttacker) : moved;
  }
  return score;
}
