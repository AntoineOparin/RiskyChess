import type { Color, CoinToss, ResolvedMove } from './moves';

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
  executed: ResolvedMove;
  fenAfter: string;
  /** Whether the side to move in fenAfter is in check. */
  inCheck: boolean;
  /** Evaluated after the executed move is applied. */
  status: GameStatus;
  outcome?: GameOutcome;
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
  turn: Color;
  /** Increments per resolved turn (ply), starts at 1. */
  turnNumber: number;
  turnDeadline?: number;
  /** Set while paused_disconnect: when the absent player forfeits. */
  graceEndsAt?: number;
  history: TurnResult[];
  outcome?: GameOutcome;
  createdAt: number;
  updatedAt: number;
}
