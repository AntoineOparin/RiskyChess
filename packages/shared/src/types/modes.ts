import type { Color, PieceSymbol, Square } from './moves';

/**
 * Optional rule modules layered on top of classic Risky Chess. Provably Fair
 * tosses are not a mode: they are always on for online games.
 */
export type ModeId = 'all_in';

export interface GameRules {
  /** Active modes; empty means classic. */
  modes: ModeId[];
}

/** Probability, in basis points (0–10000), that slot A executes. Always 5000 today: every coin is fair. */
export interface Odds {
  A: number;
}

/** Per-turn mode inputs sent alongside a submission. Every field is optional so old clients still validate. */
export interface TurnExtras {
  /** All-In: Move A is a single capture declared double-or-nothing; Move B must be null. */
  allIn?: boolean;
  /** Provably Fair: client entropy mixed into the committed server seed. */
  clientSeed?: string;
}

/** Everything a turn did beyond moving a piece. Mode state is derived from these. */
export type TurnEffect = { kind: 'all_in'; color: Color; won: boolean; piece: PieceSymbol; square: Square; bonusPly: boolean };

export interface ModeState {
  /** All-In: piece types each player has already declared with. */
  allInsUsed?: Record<Color, PieceSymbol[]>;
}
