import { Chess } from 'chess.js';
import type { MoveInput, TurnResult } from '@risky-chess/shared';
import type { Tosser } from './rng';
import { deriveOutcome } from './status';
import { validateSubmission, type ValidationResult } from './validate';

export interface ResolveInput {
  gameId: string;
  turnNumber: number;
  /** Current authoritative position. */
  fen: string;
  /** Every position reached before `fen` (start position first), for repetition detection. */
  previousFens: readonly string[];
  moveA: MoveInput;
  moveB: MoveInput | null;
  now?: number;
}

export type ResolveOutput = { ok: true; result: TurnResult } | Extract<ValidationResult, { ok: false }>;

/** Validate → toss → apply → evaluate end conditions. Pure apart from the tosser. */
export function resolveTurn(input: ResolveInput, toss: Tosser): ResolveOutput {
  const v = validateSubmission(input.fen, input.moveA, input.moveB);
  if (!v.ok) return v;

  const coin = v.moveB ? toss(v.moveA, v.moveB) : null;
  const executed = coin?.chosen === 'B' && v.moveB ? v.moveB : v.moveA;

  const chess = new Chess(input.fen);
  const mover = chess.turn();
  chess.move({ from: executed.from, to: executed.to, ...(executed.promotion ? { promotion: executed.promotion } : {}) });
  const outcome = deriveOutcome(chess, [...input.previousFens, input.fen]);

  const result: TurnResult = {
    gameId: input.gameId,
    turnNumber: input.turnNumber,
    mover,
    fenBefore: input.fen,
    moveA: v.moveA,
    moveB: v.moveB,
    forced: v.forced,
    coin,
    executed,
    fenAfter: chess.fen(),
    inCheck: chess.inCheck(),
    status: outcome ? 'finished' : 'awaiting_submission',
    resolvedAt: input.now ?? Date.now(),
  };
  if (outcome) result.outcome = outcome;
  return { ok: true, result };
}
