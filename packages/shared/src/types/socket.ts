import type { Color } from './moves';
import type { GameMode, GameOutcome, GameSession, GameStatus, TurnResult } from './game';
import type { MoveSubmission } from './moves';
import type { GameRules, PlaceBetPayload, PropBet, TurnEffect, Wallet } from './modes';
import type { LobbySnapshot, Visibility } from './lobby';
import type { MatchBet, MatchLine, PlaceMatchBetPayload } from './sportsbook';
import type { CoinDuelBetPayload, CoinDuelDeal, CoinDuelResult, PuzzleAnswerPayload, PuzzleResult, PuzzleRound, PuzzleStartPayload } from './originals';
import type { Settlement } from './wallet';

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
  | 'BET_INVALID'
  // platform
  | 'AUTH_REQUIRED'
  | 'USERNAME_TAKEN'
  | 'USERNAME_INVALID'
  | 'INSUFFICIENT_FUNDS'
  | 'INVALID_BUY_IN'
  | 'OWN_GAME'
  | 'NOT_HOST'
  | 'ODDS_CHANGED'
  | 'EXPOSURE_LIMIT'
  | 'ROUND_NOT_FOUND'
  | 'ROUND_EXPIRED'
  | 'INTERNAL';

/** `details` carries structured context on some refusals (e.g. the fresh line on ODDS_CHANGED). */
export type Ack<T> = { ok: true; data: T } | { ok: false; error: ErrorCode; message: string; details?: unknown };
export type AckFn<T> = (res: Ack<T>) => void;

export interface CreateGamePayload {
  mode: GameMode;
  /** Kept for old clients; the seat shows the account's username. */
  displayName?: string;
  color?: Color | 'random';
  /** Defaults to classic. */
  rules?: GameRules;
  /** One of BUY_IN_TIERS_CENTS; defaults to 0 and is forced to 0 for bot games. */
  buyInCents?: number;
  /** Defaults to public for pvp tables. */
  visibility?: Visibility;
}
/** A seat, bound to the caller's account; rejoin is by account, not by token. */
export interface SeatGrant {
  gameId: string;
  playerId: string;
  color: Color;
}
export interface JoinGamePayload {
  gameId: string;
  displayName?: string;
}
export interface GameRefPayload {
  gameId: string;
}

export interface ClientToServerEvents {
  create_game: (p: CreateGamePayload, ack: AckFn<SeatGrant>) => void;
  join_game: (p: JoinGamePayload, ack: AckFn<SeatGrant>) => void;
  rejoin_game: (p: GameRefPayload, ack: AckFn<{ session: GameSession; color: Color }>) => void;
  submit_moves: (p: MoveSubmission, ack: AckFn<{ accepted: true }>) => void;
  resign: (p: GameRefPayload, ack: AckFn<Record<string, never>>) => void;
  request_state: (p: GameRefPayload, ack: AckFn<{ session: GameSession }>) => void;
  place_bet: (p: PlaceBetPayload, ack: AckFn<{ bet: PropBet }>) => void;
  /** Host withdraws a table nobody has joined; the buy-in is refunded. */
  cancel_table: (p: GameRefPayload, ack: AckFn<Record<string, never>>) => void;
  // lobby & spectating
  join_lobby: (p: Record<string, never>, ack: AckFn<LobbySnapshot>) => void;
  leave_lobby: (p: Record<string, never>, ack: AckFn<Record<string, never>>) => void;
  /** Read-only seat in a public game's room: the spectator's view plus the current line. */
  watch_game: (p: GameRefPayload, ack: AckFn<{ session: GameSession; line: MatchLine | null; myBets: MatchBet[] }>) => void;
  leave_game: (p: GameRefPayload, ack: AckFn<Record<string, never>>) => void;
  place_match_bet: (p: PlaceMatchBetPayload, ack: AckFn<{ bet: MatchBet; balanceCents: number }>) => void;
  // originals
  coin_duel_deal: (p: Record<string, never>, ack: AckFn<CoinDuelDeal>) => void;
  coin_duel_bet: (p: CoinDuelBetPayload, ack: AckFn<CoinDuelResult>) => void;
  puzzle_start: (p: PuzzleStartPayload, ack: AckFn<PuzzleRound>) => void;
  puzzle_answer: (p: PuzzleAnswerPayload, ack: AckFn<PuzzleResult>) => void;
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

export interface GameOverPayload {
  gameId: string;
  outcome: GameOutcome;
  finalFen: string;
  /** Settle anything still open when the game ended off the board. */
  effects?: TurnEffect[];
  walletAfter?: Wallet;
  /** How the pot was paid (paid tables only). */
  settlement?: Settlement;
}

export interface ServerToClientEvents {
  game_started: (s: GameSession) => void;
  state_sync: (s: GameSession) => void;
  turn_started: (p: TurnStartedPayload) => void;
  turn_resolved: (r: TurnResult) => void;
  game_over: (p: GameOverPayload) => void;
  opponent_disconnected: (p: { gameId: string; color: Color; graceEndsAt: number }) => void;
  opponent_reconnected: (p: { gameId: string; color: Color }) => void;
  error: (p: { code: ErrorCode; message: string }) => void;
  /** To the placing seat only. */
  bet_placed: (p: { gameId: string; bet: PropBet }) => void;
  /** To the room at game over: every bet, unsealed. */
  bets_revealed: (p: { gameId: string; bets: Partial<Record<Color, PropBet[]>> }) => void;
  // platform (to the account's private channel)
  balance_updated: (p: { balanceCents: number }) => void;
  match_bet_settled: (p: { bet: MatchBet; balanceCents: number }) => void;
  /** A puzzle round the clock ended. */
  original_settled: (p: { roundId: string; payoutCents: number; balanceCents: number }) => void;
  // lobby room
  lobby_update: (p: LobbySnapshot) => void;
  /** To a game's room whenever its sportsbook line moves. */
  market_update: (p: { gameId: string; line: MatchLine; handleCents: number }) => void;
}
