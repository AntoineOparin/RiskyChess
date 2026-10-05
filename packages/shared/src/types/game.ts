import type { Color, CoinToss, ResolvedMove } from './moves';
import type { GameRules, ModeState, Odds, TurnEffect, Wallet } from './modes';

export type GameMode = 'pvp' | 'bot';

export type GameStatus =
  | 'waiting_for_opponent'
  | 'awaiting_submission'
  | 'paused_disconnect'
  | 'finished';

export type DrawReason = 'threefold' | 'fifty_move' | 'insufficient_material' | 'agreement';

export type GameOutcome =
  | { kind: 'checkmate'; winner: Color }
  | { kind: 'stalemate' }
  | { kind: 'draw'; reason: DrawReason }
  | { kind: 'resign'; winner: Color }
  | { kind: 'abandon'; winner: Color }
  | { kind: 'timeout'; winner: Color };

export interface TurnResult {
  gameId: string;
  turnNumber: number;
  mover: Color;
  fenBefore: string;
  moveA: ResolvedMove;
  /** null on forced turns. */
  moveB: ResolvedMove | null;
  /** true → only one legal move existed, no toss happened. */
  forced: boolean;
  coin: CoinToss | null;
  /** The odds the coin was tossed at (5000 = fair; also 5000 on forced turns). */
  odds: Odds;
  /**
   * The move that was played. On a lost All-In nothing is played: this is the
   * declared capture, and the `all_in` effect (won: false) says it was voided.
   */
  executed: ResolvedMove;
  fenAfter: string;
  /** Whether the side to move in fenAfter is in check. */
  inCheck: boolean;
  /** Evaluated after the executed move is applied. */
  status: GameStatus;
  outcome?: GameOutcome;
  /** Chips, odds breakdowns, All-In results and bet settlements, in the order they happened. */
  effects: TurnEffect[];
  /** Both wallets after this turn's effects; only when a chip mode is on. */
  walletAfter?: Wallet;
  resolvedAt: number;
}

export interface PlayerSlot {
  playerId: string;
  displayName: string;
  isBot: boolean;
  connected: boolean;
  disconnectedAt?: number;
}

export interface GameSession {
  id: string;
  mode: GameMode;
  status: GameStatus;
  players: { w: PlayerSlot | null; b: PlayerSlot | null };
  startFen: string;
  /** Authoritative current position. */
  fen: string;
  /**
   * Side to move. Always derived from `fen` (never flipped), so an All-In bonus
   * ply gives the same seat two turns in a row.
   */
  turn: Color;
  /** Increments per resolved turn (ply), starts at 1. */
  turnNumber: number;
  turnDeadline?: number;
  /** Set while paused_disconnect: when the absent player forfeits. */
  graceEndsAt?: number;
  history: TurnResult[];
  outcome?: GameOutcome;
  rules: GameRules;
  /** Present when any chip mode is on. */
  wallet?: Wallet;
  modeState: ModeState;
  /** Provably Fair: sha256 of the current turn's server seed, for rejoining clients. */
  pendingCommitment?: string;
  createdAt: number;
  updatedAt: number;
}
