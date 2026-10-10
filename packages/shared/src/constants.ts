import type { GameRules, ModeId } from './types/modes';
import type { PieceSymbol } from './types/moves';

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** How long a disconnected player's seat is held before they forfeit. */
export const DISCONNECT_GRACE_MS = 60_000;
/** Optional per-turn clock; null disables it. */
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

export const MODE_IDS: readonly ModeId[] = ['all_in'];

export const CLASSIC_RULES: GameRules = { modes: [] };
export const ALL_IN_RULES: GameRules = { modes: ['all_in'] };

/** Every coin is fair; the bounds stay so a future mode can never make a slot certain. */
export const ODDS = { BASE: 5000, MIN: 1000, MAX: 9000 } as const;

export const hasMode = (rules: GameRules | undefined, mode: ModeId): boolean => !!rules?.modes.includes(mode);
export const isClassic = (rules: GameRules | undefined): boolean => !rules || rules.modes.length === 0;
