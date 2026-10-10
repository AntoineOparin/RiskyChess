import type { ErrorCode, MoveInput, ResolvedMove } from '@risky-chess/shared';
import { legalMoves, lanOf, toResolved } from './legal';

export type ValidationResult =
  | { ok: true; moveA: ResolvedMove; moveB: ResolvedMove | null; forced: boolean }
  | { ok: false; error: Extract<ErrorCode, 'ILLEGAL_MOVE' | 'DUPLICATE_MOVES' | 'PAIR_REQUIRED' | 'ALL_IN_INVALID'>; message: string };

export interface ValidateOptions {
  /** A single declared move (All-In): Move B must be null even when the turn isn't forced. */
  single?: boolean;
}

/**
 * Both moves are validated against the same start-of-turn position: they are
 * alternatives, not a sequence, so Move A's effects never bear on Move B.
 */
export function validateSubmission(fen: string, moveA: MoveInput, moveB: MoveInput | null, opts: ValidateOptions = {}): ValidationResult {
  const legal = legalMoves(fen);
  const byLan = new Map(legal.map((m) => [m.lan, m]));

  const a = byLan.get(lanOf(moveA));
  if (!a) return { ok: false, error: 'ILLEGAL_MOVE', message: `Move A (${lanOf(moveA)}) is not legal` };

  if (opts.single) {
    if (moveB !== null) return { ok: false, error: 'ALL_IN_INVALID', message: 'All-In declares a single move: Move B must be empty' };
    return { ok: true, moveA: toResolved(a), moveB: null, forced: legal.length === 1 };
  }

  if (moveB === null) {
    if (legal.length === 1) return { ok: true, moveA: toResolved(a), moveB: null, forced: true };
    return { ok: false, error: 'PAIR_REQUIRED', message: 'Two distinct moves are required when more than one legal move exists' };
  }

  const b = byLan.get(lanOf(moveB));
  if (!b) return { ok: false, error: 'ILLEGAL_MOVE', message: `Move B (${lanOf(moveB)}) is not legal` };
  if (a.lan === b.lan) return { ok: false, error: 'DUPLICATE_MOVES', message: 'Move A and Move B must be different' };

  return { ok: true, moveA: toResolved(a), moveB: toResolved(b), forced: false };
}
