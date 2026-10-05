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

export const usesChips = (rules: GameRules): boolean => rules.modes.some((m) => CHIP_MODES.includes(m));
export const hasMode = (rules: GameRules | undefined, mode: ModeId): boolean => !!rules?.modes.includes(mode);
export const isClassic = (rules: GameRules | undefined): boolean => !rules || rules.modes.length === 0;
