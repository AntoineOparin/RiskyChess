import type { Color, MoveSlot, PieceSymbol, Square } from './moves';

/**
 * Optional rule modules layered on top of classic Risky Chess. Provably Fair
 * tosses are not a mode: they are always on for online games.
 */
export type ModeId = 'loaded_dice' | 'odds_market' | 'all_in' | 'side_bets';

export interface GameRules {
  /** Active modes; empty means classic. Order is irrelevant: the engine composes them in a fixed order. */
  modes: ModeId[];
}

/** Chips (◎) per seat. Play money only. */
export type Wallet = Record<Color, number>;

/** Probability, in basis points (0–10000), that slot A executes. */
export interface Odds {
  A: number;
}

/** Per-turn mode inputs sent alongside a submission. Every field is optional so old clients still validate. */
export interface TurnExtras {
  /** Loaded Dice: the slot the stake tilts toward. */
  favor?: MoveSlot;
  /** Loaded Dice: chips paid this turn to tilt the coin. */
  stake?: number;
  /** All-In: Move A is a single capture declared double-or-nothing; Move B must be null. */
  allIn?: boolean;
  /** Provably Fair: client entropy mixed into the committed server seed. */
  clientSeed?: string;
}

export type ChipReason = 'capture' | 'stake' | 'market_payout' | 'bet_stake' | 'bet_payout' | 'bet_refund';

/** Everything a turn (or a bet) did beyond moving a piece. Wallet and mode state are derived from these. */
export type TurnEffect =
  | { kind: 'chips'; color: Color; delta: number; reason: ChipReason }
  | { kind: 'odds_breakdown'; steps: { source: ModeId | 'base'; A: number }[] }
  | { kind: 'all_in'; color: Color; won: boolean; piece: PieceSymbol; square: Square; bonusPly: boolean }
  | { kind: 'bet_settled'; color: Color; betId: string; result: 'won' | 'lost' | 'void'; payout: number };

export type PropBetKind =
  | 'opp_castles_by'
  | 'opp_promotes'
  | 'opp_toss_upset'
  | 'opp_all_in_bust'
  | 'game_length_under'
  | 'game_length_over';

export type PropBetStatus = 'open' | 'won' | 'lost' | 'void';

export interface PropBet {
  id: string;
  kind: PropBetKind;
  params: Record<string, number>;
  stake: number;
  /** Total returned on a win, ×100 (340 → 3.4× the stake). */
  payoutX100: number;
  placedAtTurn: number;
  status: PropBetStatus;
}

/** What a player sees of the opponent's bets before game over. */
export interface SealedBets {
  count: number;
}

export interface ModeState {
  /** All-In: piece types each player has already declared with. */
  allInsUsed?: Record<Color, PieceSymbol[]>;
  /** Side Bets: own bets in full; the opponent's are sealed in every client-facing view. */
  bets?: Partial<Record<Color, PropBet[] | SealedBets>>;
}

export const isSealed = (b: PropBet[] | SealedBets | undefined): b is SealedBets => !!b && !Array.isArray(b);

export interface PlaceBetPayload {
  gameId: string;
  /** Idempotency key: a retried placement never debits twice. */
  clientBetId: string;
  kind: PropBetKind;
  params?: Record<string, number>;
  stake: number;
}
