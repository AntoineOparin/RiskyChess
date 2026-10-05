import { Chess, type Move } from 'chess.js';
import { PIECE_VALUES, type MoveInput } from '@gamble/shared';
import type { Rng } from './rng';

export type BotDifficulty = 'random' | 'greedy';

export interface BotPair {
  moveA: MoveInput;
  moveB: MoveInput | null;
}

function toInput(m: Move): MoveInput {
  const input: MoveInput = { from: m.from, to: m.to };
  if (m.promotion === 'q' || m.promotion === 'r' || m.promotion === 'b' || m.promotion === 'n') {
    input.promotion = m.promotion;
  }
  return input;
}

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

function shuffle<T>(items: T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * The bot controls the pair, not which move plays, so it offers its two best
 * candidates rather than gambling one great move against a throwaway.
 */
export function pickBotPair(fen: string, rng: Rng, difficulty: BotDifficulty = 'greedy'): BotPair {
  const legal = new Chess(fen).moves({ verbose: true });
  if (legal.length === 0) throw new Error('pickBotPair called on a position with no legal moves');
  if (legal.length === 1) return { moveA: toInput(legal[0]!), moveB: null };

  const ranked =
    difficulty === 'random'
      ? shuffle(legal, rng)
      : legal
          .map((m) => ({ m, s: scoreMove(fen, m) + rng.int(1000) / 2000 }))
          .sort((x, y) => y.s - x.s)
          .map((x) => x.m);

  return { moveA: toInput(ranked[0]!), moveB: toInput(ranked[1]!) };
}
