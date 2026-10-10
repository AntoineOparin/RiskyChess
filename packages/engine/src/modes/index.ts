import type { GameRules, ModeId } from '@risky-chess/shared';
import { allIn } from './all-in';
import type { ModeModule } from './types';

export * from './types';
export { allInProblem, allInsLeft, assertLegalPosition, bonusFen, bustFen } from './all-in';

export const MODE_REGISTRY: Record<ModeId, ModeModule> = {
  all_in: allIn,
};

/** Modules that move the line, in order. Nothing does today: every coin is fair. */
export const ODDS_ORDER: readonly ModeId[] = [];
/** Every other hook runs in this order. */
export const MODE_ORDER: readonly ModeId[] = ['all_in'];

/** The active modules for these rules, in MODE_ORDER (or the given order). */
export function activeModules(rules: GameRules | undefined, order: readonly ModeId[] = MODE_ORDER): ModeModule[] {
  const on = new Set(rules?.modes ?? []);
  return order.filter((id) => on.has(id)).map((id) => MODE_REGISTRY[id]);
}
