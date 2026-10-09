import { Chess, type Move } from 'chess.js';
import type { MoveInput, PuzzleTier } from '@risky-chess/shared';
import { lanOf, toInput } from '../legal';

/*
 * Blitz Puzzle verification. The puzzle set ships positions only; the
 * server checks an answer by searching, so no solution ever reaches a client.
 */

const apply = (fen: string, m: MoveInput | Move): Chess | null => {
  const chess = new Chess(fen);
  try {
    chess.move({ from: m.from, to: m.to, ...(m.promotion ? { promotion: m.promotion } : {}) });
  } catch {
    return null;
  }
  return chess;
};

/** Every legal move that mates on the spot. */
export function matingMoves(fen: string): Move[] {
  return new Chess(fen).moves({ verbose: true }).filter((m) => apply(fen, m)!.isCheckmate());
}

export function isMateIn1(fen: string, move: MoveInput): boolean {
  return apply(fen, move)?.isCheckmate() ?? false;
}

/**
 * The move forces mate next turn: either it mates now, or every reply leaves
 * a mating move. (A mate-in-2 puzzle's own key is never an immediate mate,
 * but a player who finds a quicker mate has still solved it.)
 */
export function isMateIn2(fen: string, move: MoveInput): boolean {
  const after = apply(fen, move);
  if (!after) return false;
  if (after.isCheckmate()) return true;
  if (after.isGameOver()) return false;
  const replies = after.moves({ verbose: true });
  return replies.every((r) => matingMoves(apply(after.fen(), r)!.fen()).length > 0);
}

/** Keys that force mate in two. `checksOnly` keeps the search cheap for the generator. */
export function mateIn2Keys(fen: string, checksOnly = false): Move[] {
  return new Chess(fen)
    .moves({ verbose: true })
    .filter((m) => !checksOnly || m.san.includes('+'))
    .filter((m) => isMateIn2(fen, toInput(m)) && !isMateIn1(fen, toInput(m)));
}

export function verifyPuzzle(tier: PuzzleTier, fen: string, move: MoveInput): boolean {
  return tier === 'mate1' ? isMateIn1(fen, move) : isMateIn2(fen, move);
}

/** A solution to the puzzle, if the position really is one. Used by tests and the generator. */
export function solvePuzzle(tier: PuzzleTier, fen: string): MoveInput | null {
  const m = tier === 'mate1' ? matingMoves(fen)[0] : mateIn2Keys(fen)[0];
  return m ? toInput(m) : null;
}

export { lanOf };
