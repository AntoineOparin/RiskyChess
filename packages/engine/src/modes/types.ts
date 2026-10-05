import type { Move } from 'chess.js';
import type {
  Color,
  ErrorCode,
  GameOutcome,
  GameRules,
  ModeId,
  ModeState,
  MoveSlot,
  Odds,
  PieceSymbol,
  ResolvedMove,
  TurnEffect,
  TurnExtras,
  TurnResult,
  Wallet,
} from '@risky-chess/shared';
import type { BotPair } from '../bot';
import type { Rng } from '../rng';

/** The slice of a game session the mode hooks read. Server sessions and offline games both satisfy it. */
export interface SessionLike {
  rules: GameRules;
  wallet?: Wallet;
  modeState: ModeState;
  /** Resolved turns, oldest first. */
  history: readonly TurnResult[];
  /** Current position. */
  fen: string;
  turnNumber: number;
}

/** Everything a hook may look at while a turn resolves. Read-only. */
export interface TurnCtx {
  gameId: string;
  turnNumber: number;
  fen: string;
  mover: Color;
  rules: GameRules;
  wallet?: Wallet;
  modeState: ModeState;
  extras: TurnExtras;
  moveA: ResolvedMove;
  /** null on a forced turn or a single-move (All-In) declaration. */
  moveB: ResolvedMove | null;
  forced: boolean;
  history: readonly TurnResult[];
}

export interface ValidationFailure {
  error: ErrorCode;
  message: string;
}

/** The coin, after the odds were set. `roll` is null when a test seam forced the slot. */
export interface TossRoll {
  odds: Odds;
  roll: number | null;
  chosen: MoveSlot;
}

/** A module's replacement for the default board application. */
export interface ApplyResult {
  /** The move reported as played (the declared move when nothing was played). */
  executed: ResolvedMove;
  fenAfter: string;
  /** The piece actually taken off the board by a capture, which drives capture income. */
  captured?: Exclude<PieceSymbol, 'k'>;
}

export interface Applied extends ApplyResult {
  roll: TossRoll | null;
}

/** A bot candidate with its one-ply score, best first. */
export interface RankedMove {
  move: Move;
  score: number;
}

/**
 * One optional rule module. Every hook is optional and pure: hooks return
 * values, never mutate their arguments, and draw randomness only from the
 * rng they are handed.
 */
export interface ModeModule {
  id: ModeId;
  /** Legality of this mode's extras for the turn. */
  validate?(ctx: TurnCtx): ValidationFailure | null;
  /** Moves the line. Runs only on paired tosses, in ODDS_ORDER; the pipeline clamps the result. */
  adjustOdds?(ctx: TurnCtx, odds: Odds): Odds;
  /** Overrides how the toss lands on the board; null leaves it to the default (or the next module). */
  apply?(ctx: TurnCtx, roll: TossRoll | null): ApplyResult | null;
  /** Effects of the resolved turn (chips, All-In results…). */
  effects?(ctx: TurnCtx, applied: Applied): TurnEffect[];
  /** Runs after the turn is applied, against the updated session (`state.history` includes `result`). */
  afterTurn?(state: SessionLike, result: TurnResult): TurnEffect[];
  /** Settles anything still open when a game ends off the board (resign, abandon, timeout). */
  onGameOver?(state: SessionLike, outcome: GameOutcome): TurnEffect[];
  /** Lets the bot replace its pair (e.g. prefer balanced pairs against a market). */
  pairPolicy?(fen: string, ranked: readonly RankedMove[], state: SessionLike, rng: Rng): BotPair | null;
  /** The bot's extras for this mode, given the pair it settled on. */
  botExtras?(fen: string, pair: BotPair, state: SessionLike, rng: Rng): TurnExtras;
}
