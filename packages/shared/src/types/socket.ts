import type { Color } from './moves';
import type { GameMode, GameOutcome, GameSession, GameStatus, TurnResult } from './game';
import type { MoveSubmission } from './moves';
import type { GameRules, PlaceBetPayload, PropBet, TurnEffect, Wallet } from './modes';

export type ErrorCode =
  | 'INVALID_PAYLOAD'
  | 'NOT_YOUR_TURN'
  | 'STALE_TURN'
  | 'ILLEGAL_MOVE'
  | 'DUPLICATE_MOVES'
  | 'PAIR_REQUIRED'
  | 'GAME_NOT_FOUND'
  | 'GAME_FULL'
  | 'GAME_OVER'
  | 'GAME_NOT_ACTIVE'
  | 'UNAUTHORIZED'
  | 'INSUFFICIENT_CHIPS'
  | 'INVALID_STAKE'
  | 'MODE_DISABLED'
  | 'ALL_IN_USED'
  | 'ALL_IN_INVALID'
  | 'BETTING_CLOSED'
  | 'BET_LIMIT'
  | 'BET_INVALID';

export type Ack<T> = { ok: true; data: T } | { ok: false; error: ErrorCode; message: string };
export type AckFn<T> = (res: Ack<T>) => void;

export interface CreateGamePayload {
  mode: GameMode;
  displayName: string;
  color?: Color | 'random';
  /** Defaults to classic. */
  rules?: GameRules;
}
export interface SeatGrant {
  gameId: string;
  playerId: string;
  playerToken: string;
  color: Color;
}
export interface JoinGamePayload {
  gameId: string;
  displayName: string;
}
export interface RejoinGamePayload {
  gameId: string;
  playerToken: string;
}
export interface GameRefPayload {
  gameId: string;
}

export interface ClientToServerEvents {
  create_game: (p: CreateGamePayload, ack: AckFn<SeatGrant>) => void;
  join_game: (p: JoinGamePayload, ack: AckFn<SeatGrant>) => void;
  rejoin_game: (p: RejoinGamePayload, ack: AckFn<{ session: GameSession; color: Color }>) => void;
  submit_moves: (p: MoveSubmission, ack: AckFn<{ accepted: true }>) => void;
  resign: (p: GameRefPayload, ack: AckFn<Record<string, never>>) => void;
  request_state: (p: GameRefPayload, ack: AckFn<{ session: GameSession }>) => void;
  place_bet: (p: PlaceBetPayload, ack: AckFn<{ bet: PropBet }>) => void;
}

export interface TurnStartedPayload {
  gameId: string;
  turnNumber: number;
  turn: Color;
  /** awaiting_submission, or paused_disconnect if the mover is away. */
  status: GameStatus;
  deadline?: number;
  graceEndsAt?: number;
  commitment?: string;
}

export interface ServerToClientEvents {
  game_started: (s: GameSession) => void;
  state_sync: (s: GameSession) => void;
  turn_started: (p: TurnStartedPayload) => void;
  turn_resolved: (r: TurnResult) => void;
  /** `effects` settle anything still open when the game ended off the board. */
  game_over: (p: { gameId: string; outcome: GameOutcome; finalFen: string; effects?: TurnEffect[]; walletAfter?: Wallet }) => void;
  opponent_disconnected: (p: { gameId: string; color: Color; graceEndsAt: number }) => void;
  opponent_reconnected: (p: { gameId: string; color: Color }) => void;
  error: (p: { code: ErrorCode; message: string }) => void;
  /** To the placing seat only. */
  bet_placed: (p: { gameId: string; bet: PropBet }) => void;
  /** To the room at game over: every bet, unsealed. */
  bets_revealed: (p: { gameId: string; bets: Partial<Record<Color, PropBet[]>> }) => void;
}
