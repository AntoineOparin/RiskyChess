import { Chess, type Move } from 'chess.js';
import type { MoveInput, ResolvedMove } from '@gamble/shared';

export function legalMoves(fen: string): Move[] {
  return new Chess(fen).moves({ verbose: true });
}

/** Exactly one legal move: the player submits it alone and no coin is tossed. */
export function isForcedTurn(fen: string): boolean {
  return legalMoves(fen).length === 1;
}

export function lanOf(m: MoveInput): string {
  return `${m.from}${m.to}${m.promotion ?? ''}`;
}

export function toResolved(m: Move): ResolvedMove {
  const resolved: ResolvedMove = {
    from: m.from,
    to: m.to,
    san: m.san,
    lan: m.lan,
    piece: m.piece,
    flags: m.flags,
  };
  if (m.promotion && m.promotion !== 'p' && m.promotion !== 'k') resolved.promotion = m.promotion;
  if (m.captured && m.captured !== 'k') resolved.captured = m.captured;
  return resolved;
}

/** Finds the legal move matching the input exactly (including promotion piece). */
export function findLegal(fen: string, input: MoveInput): ResolvedMove | null {
  const lan = lanOf(input);
  const match = legalMoves(fen).find((m) => m.lan === lan);
  return match ? toResolved(match) : null;
}
