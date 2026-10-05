import type { Color } from './moves';
import type { GameMode, GameOutcome, GameSession, GameStatus, TurnResult } from './game';
import type { MoveSubmission } from './moves';

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
  | 'UNAUTHORIZED';

export type Ack<T> = { ok: true; data: T } | { ok: false; error: ErrorCode; message: string };
export type AckFn<T> = (res: Ack<T>) => void;

export interface CreateGamePayload {
  mode: GameMode;
  displayName: string;
  color?: Color | 'random';
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
  game_over: (p: { gameId: string; outcome: GameOutcome; finalFen: string }) => void;
  opponent_disconnected: (p: { gameId: string; color: Color; graceEndsAt: number }) => void;
  opponent_reconnected: (p: { gameId: string; color: Color }) => void;
  error: (p: { code: ErrorCode; message: string }) => void;
}
