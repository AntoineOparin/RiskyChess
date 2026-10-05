import { Chess, type Move } from 'chess.js';
import type { MoveInput, TurnExtras } from '@risky-chess/shared';
import { activeModules, type RankedMove, type SessionLike } from './modes';
import type { Rng } from './rng';
import { scoreMove } from './score';
import { toInput } from './legal';

export { scoreMove, toInput };

export type BotDifficulty = 'random' | 'greedy';

export interface BotPair {
  moveA: MoveInput;
  moveB: MoveInput | null;
}

function shuffle<T>(items: T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * The bot controls the pair, not which move plays, so it offers its two best
 * candidates rather than gambling one great move against a throwaway.
 */
export function pickBotPair(fen: string, rng: Rng, difficulty: BotDifficulty = 'greedy'): BotPair {
  return topPair(rankBotMoves(fen, rng, difficulty));
}

/** Legal moves, best first for the bot (shuffled on 'random'), with a little noise for variety. */
export function rankBotMoves(fen: string, rng: Rng, difficulty: BotDifficulty = 'greedy'): RankedMove[] {
  const legal = new Chess(fen).moves({ verbose: true });
  if (legal.length === 0) throw new Error('pickBotPair called on a position with no legal moves');
  if (legal.length === 1) return [{ move: legal[0]!, score: 0 }];
  return difficulty === 'random'
    ? shuffle(legal, rng).map((move) => ({ move, score: 0 }))
    : legal.map((move) => ({ move, score: scoreMove(fen, move) + rng.int(1000) / 2000 })).sort((x, y) => y.score - x.score);
}

const topPair = (ranked: readonly RankedMove[]): BotPair =>
  ranked.length === 1
    ? { moveA: toInput(ranked[0]!.move), moveB: null }
    : { moveA: toInput(ranked[0]!.move), moveB: toInput(ranked[1]!.move) };

export interface BotSubmission extends BotPair {
  extras?: TurnExtras;
}

/**
 * The bot's whole turn under the game's rules: its pair (which a mode may
 * re-pick), plus each active mode's extras. An All-In declaration drops
 * Move B and any stake.
 */
export function pickBotSubmission(fen: string, state: SessionLike, rng: Rng, difficulty: BotDifficulty = 'greedy'): BotSubmission {
  const ranked = rankBotMoves(fen, rng, difficulty);
  let pair = topPair(ranked);
  if (!pair.moveB) return pair;

  const modules = activeModules(state.rules);
  for (const m of modules) pair = m.pairPolicy?.(fen, ranked, state, rng) ?? pair;
  const extras: TurnExtras = {};
  for (const m of modules) Object.assign(extras, m.botExtras?.(fen, pair, state, rng));
  if (extras.allIn) {
    delete extras.stake;
    delete extras.favor;
    pair = { moveA: pair.moveA, moveB: null };
  }
  return Object.keys(extras).length ? { ...pair, extras } : pair;
}
