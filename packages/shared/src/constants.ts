import type { GameRules, ModeId } from './types/modes';
import type { PieceSymbol } from './types/moves';

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** How long a disconnected player's seat is held before they forfeit. */
export const DISCONNECT_GRACE_MS = 60_000;
/** Optional per-turn clock; null disables it (MVP default). */
export const TURN_TIMEOUT_MS: number | null = null;
/** Finished/abandoned games are swept from memory after this long. */
export const GAME_TTL_MS = 24 * 60 * 60 * 1000;
export const BOT_THINK_MS = { min: 500, max: 1200 } as const;

export const PIECE_VALUES: Record<PieceSymbol, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
};

export const MODE_IDS: readonly ModeId[] = ['loaded_dice', 'odds_market', 'all_in', 'side_bets'];

export const CLASSIC_RULES: GameRules = { modes: [] };

export interface ModePreset {
  id: 'classic' | ModeId | 'high_roller';
  name: string;
  modes: ModeId[];
}

export const MODE_PRESETS: readonly ModePreset[] = [
  { id: 'classic', name: 'Classic', modes: [] },
  { id: 'loaded_dice', name: 'Loaded Dice', modes: ['loaded_dice'] },
  { id: 'odds_market', name: 'Odds Market', modes: ['odds_market'] },
  { id: 'all_in', name: 'All-In', modes: ['all_in'] },
  { id: 'side_bets', name: 'Side Bets', modes: ['side_bets'] },
  { id: 'high_roller', name: 'High Roller', modes: ['loaded_dice', 'odds_market', 'all_in', 'side_bets'] },
];

/**
 * Which modes may be combined. All four compose; the engine fixes the order
 * (Odds Market sets the line, Loaded Dice stakes move it, then the clamp).
 */
export const MODE_COMPAT: Record<ModeId, readonly ModeId[]> = {
  loaded_dice: ['odds_market', 'all_in', 'side_bets'],
  odds_market: ['loaded_dice', 'all_in', 'side_bets'],
  all_in: ['loaded_dice', 'odds_market', 'side_bets'],
  side_bets: ['loaded_dice', 'odds_market', 'all_in'],
};

/** Modes that use the chip wallet. With any of them on, both seats start with START_CHIPS. */
export const CHIP_MODES: readonly ModeId[] = ['loaded_dice', 'odds_market', 'all_in', 'side_bets'];

export const ECONOMY = {
  START_CHIPS: 100,
  /** Chips earned for a capture: the captured piece's value. */
  CAPTURE_INCOME: PIECE_VALUES,
} as const;

/** Odds bounds in basis points: no mode combination can make a slot certain. */
export const ODDS = { BASE: 5000, MIN: 1000, MAX: 9000 } as const;

// ---------- platform ----------

/** Table buy-ins in cents; 0 is a free table (no settlement). Bot games are always free. */
export const BUY_IN_TIERS_CENTS: readonly number[] = [0, 1_000, 5_000, 25_000, 100_000];
/** Share of a decisive pot the house keeps, in basis points. */
export const RAKE_BPS = 500;
/** Credited once when an account is created. */
export const SIGNUP_BONUS_CENTS = 100_000;
/** Mock top-up amounts; there is no real payment flow. */
export const DEPOSIT_PRESETS_CENTS: readonly number[] = [1_000, 5_000, 10_000, 50_000];
/** A public table nobody joins is cancelled (and refunded) after this long. */
export const OPEN_TABLE_TTL_MS = 10 * 60 * 1000;
export const USERNAME = { MIN: 3, MAX: 16, PATTERN: /^[a-zA-Z0-9_]+$/ } as const;

export const SPORTSBOOK = {
  /** Overround: the three prices sum to 1 + MARGIN. */
  MARGIN: 0.06,
  MIN_STAKE_CENTS: 100,
  MAX_STAKE_CENTS: 50_000,
  /** Open stake one account may hold on one game. */
  MAX_EXPOSURE_CENTS: 100_000,
  /** How far the line may move (×100) between the client's view and the server before a bet is refused. */
  ODDS_TOLERANCE_X100: 5,
  MIN_ODDS_X100: 101,
  MAX_ODDS_X100: 5_000,
} as const;

export const ORIGINALS = {
  MIN_STAKE_CENTS: 100,
  MAX_STAKE_CENTS: 50_000,
  COIN_DUEL: {
    /** House edge on the fair price. */
    EDGE: 0.03,
    /** Random plies played from the start position to deal a middlegame. */
    DEAL_PLIES: { min: 8, max: 20 },
    /** A dealt round must be bet within this long. */
    DEAL_TTL_MS: 60_000,
  },
  PUZZLE_TIERS: {
    mate1: { seconds: 15, payoutX100: 150 },
    mate2: { seconds: 30, payoutX100: 300 },
  },
} as const;

export const usesChips = (rules: GameRules): boolean => rules.modes.some((m) => CHIP_MODES.includes(m));
export const hasMode = (rules: GameRules | undefined, mode: ModeId): boolean => !!rules?.modes.includes(mode);
export const isClassic = (rules: GameRules | undefined): boolean => !rules || rules.modes.length === 0;
