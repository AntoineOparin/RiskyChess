import type { Odds } from './modes';
import type { MoveInput, MoveSlot, ResolvedMove } from './moves';

/*
 * Originals: quick solo games against the house with Stake-style provable
 * fairness. Each account holds a seed pair: a secret server seed (its sha256
 * is public), a client seed the player may change, and a nonce that counts
 * rounds. Round n's roll is rollFromMessage(serverSeed, `${clientSeed}:${n}`).
 * Rotating the pair reveals the old server seed so every past round can be
 * re-derived and checked.
 */

export type OriginalGame = 'coin_duel' | 'puzzle';

export interface SeedPair {
  serverSeedHash: string;
  clientSeed: string;
  /** Rounds played on this pair so far; the next round uses this nonce. */
  nonce: number;
}

/** A retired pair, with its server seed revealed. */
export interface RevealedSeedPair {
  serverSeed: string;
  serverSeedHash: string;
  clientSeed: string;
  /** Nonces 0 … rounds−1 were played on it. */
  rounds: number;
  retiredAt: number;
}

export type RoundStatus = 'open' | 'won' | 'lost' | 'void';

// ---------- Coin Duel ----------

/**
 * The house deals a position and the bot's best pair; the player backs one
 * move and the committed coin decides which one plays. The line leans against
 * the stronger move exactly as Odds Market does, so the better move pays more.
 */
export interface CoinDuelDeal {
  roundId: string;
  /** Which seed pair and nonce the round is bound to. */
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  fen: string;
  moveA: ResolvedMove;
  moveB: ResolvedMove;
  /** Probability (bps) that A plays. */
  odds: Odds;
  /** Total returned per 1 staked, ×100, for backing each slot. */
  payoutX100: Record<MoveSlot, number>;
  expiresAt: number;
}

export interface CoinDuelResult {
  roundId: string;
  nonce: number;
  backed: MoveSlot;
  stakeCents: number;
  roll: number;
  chosen: MoveSlot;
  executed: ResolvedMove;
  fenAfter: string;
  won: boolean;
  payoutCents: number;
  balanceCents: number;
}

export interface CoinDuelBetPayload {
  roundId: string;
  slot: MoveSlot;
  stakeCents: number;
}

// ---------- Blitz Puzzle ----------

export type PuzzleTier = 'mate1' | 'mate2';

export interface Puzzle {
  fen: string;
  tier: PuzzleTier;
}

export interface PuzzleRound {
  roundId: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  tier: PuzzleTier;
  /** Index into the shared puzzle set, derived from the roll. */
  puzzleIndex: number;
  fen: string;
  stakeCents: number;
  payoutX100: number;
  /** Server clock: answers after this are losses. */
  deadline: number;
}

export interface PuzzleResult {
  roundId: string;
  outcome: 'solved' | 'wrong' | 'timeout';
  /** The move the player gave, when there was one. */
  move?: ResolvedMove;
  payoutCents: number;
  balanceCents: number;
}

export interface PuzzleStartPayload {
  tier: PuzzleTier;
  stakeCents: number;
}

export interface PuzzleAnswerPayload {
  roundId: string;
  move: MoveInput;
}

/** One past round, as the history and fairness screens list it. */
export interface OriginalRoundSummary {
  id: string;
  game: OriginalGame;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  stakeCents: number;
  payoutCents: number;
  status: RoundStatus;
  createdAt: number;
}
