import type { GameRules } from './modes';
import type { Color } from './moves';
import type { MatchLine } from './sportsbook';

/** Who can see and join a table. Private tables are reached by code only. */
export type Visibility = 'public' | 'private';

/** A public table waiting for an opponent. */
export interface OpenTable {
  gameId: string;
  host: { userId: string; username: string; color: Color };
  rules: GameRules;
  buyInCents: number;
  createdAt: number;
}

/** A public game in progress, priced for spectators. */
export interface LiveMarket {
  gameId: string;
  players: Record<Color, { userId: string; username: string }>;
  rules: GameRules;
  buyInCents: number;
  turnNumber: number;
  fen: string;
  line: MatchLine;
  /** Total open sportsbook stake on this game, in cents. */
  handleCents: number;
}

/** A recently settled wager, for the live feed. */
export interface FeedItem {
  id: string;
  username: string;
  /** What was wagered on: a table, a match bet or an original. */
  game: 'table' | 'sportsbook' | 'coin_duel' | 'puzzle';
  stakeCents: number;
  payoutCents: number;
  at: number;
}

export interface LobbySnapshot {
  tables: OpenTable[];
  markets: LiveMarket[];
  feed: FeedItem[];
  online: number;
}
