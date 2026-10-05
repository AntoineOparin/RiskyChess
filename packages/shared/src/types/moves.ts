import type { TurnExtras } from './modes';

export type Color = 'w' | 'b';
export type File = 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g' | 'h';
export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export type Square = `${File}${Rank}`;
export type PieceSymbol = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
export type PromotionPiece = 'q' | 'r' | 'b' | 'n';
export type MoveSlot = 'A' | 'B';

export interface MoveInput {
  from: Square;
  to: Square;
  /** Required iff the move is a pawn promotion. */
  promotion?: PromotionPiece;
}

/** A move after the engine has validated it against fenBefore. */
export interface ResolvedMove extends MoveInput {
  san: string;
  /** Canonical identity used for distinctness, e.g. "e7e8q". */
  lan: string;
  piece: PieceSymbol;
  captured?: Exclude<PieceSymbol, 'k'>;
  /** chess.js flags: n, b, e, c, p, k, q. */
  flags: string;
}

export interface MoveSubmission {
  gameId: string;
  /** Must equal session.turnNumber; guards against stale or replayed submissions. */
  turnNumber: number;
  /** Idempotency key so a retried emit never resolves a turn twice. */
  clientSubmissionId: string;
  moveA: MoveInput;
  /** null only on a forced turn, or when `extras.allIn` declares a single capture. */
  moveB: MoveInput | null;
  extras?: TurnExtras;
}

export interface CoinToss {
  chosen: MoveSlot;
  method: 'crypto.randomInt' | 'hmac-commit-reveal' | 'local';
  /** sha256(serverSeed), published at turn start when provable fairness is on. */
  commitment?: string;
  /** Revealed after resolution so clients can verify the toss. */
  serverSeed?: string;
  /** The submitter's entropy mixed into the roll (commit-reveal only). */
  clientSeed?: string;
  /** The 0–9999 draw; slot A executes when roll < odds.A. Absent when a test seam forced the slot. */
  roll?: number;
}
