import type { GameRules, ModeId } from '@risky-chess/shared';
import { allIn } from './all-in';
import { loadedDice } from './loaded-dice';
import { oddsMarket } from './odds-market';
import { sideBets } from './side-bets';
import type { ModeModule } from './types';

export * from './types';
export { LOADED_DICE_TIERS, BOT_STAKE, shiftFor } from './loaded-dice';
export { allInProblem, allInsLeft, assertLegalPosition, bonusFen, bustFen } from './all-in';
export { MARKET, edgeForGap, marketLine, preferBalancedPair, type MarketLine } from './odds-market';

export const MODE_REGISTRY: Record<ModeId, ModeModule> = {
  loaded_dice: loadedDice,
  odds_market: oddsMarket,
  all_in: allIn,
  side_bets: sideBets,
};

/** Odds composition: the market sets the line, then stakes move it, then the clamp. */
export const ODDS_ORDER: readonly ModeId[] = ['odds_market', 'loaded_dice'];
/** Every other hook runs in this order. */
export const MODE_ORDER: readonly ModeId[] = ['all_in', 'odds_market', 'loaded_dice', 'side_bets'];

/** The active modules for these rules, in MODE_ORDER (or the given order). */
export function activeModules(rules: GameRules | undefined, order: readonly ModeId[] = MODE_ORDER): ModeModule[] {
  const on = new Set(rules?.modes ?? []);
  return order.filter((id) => on.has(id)).map((id) => MODE_REGISTRY[id]);
}
