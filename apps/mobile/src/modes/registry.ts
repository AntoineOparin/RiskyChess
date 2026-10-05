import type { ModeId } from '@risky-chess/shared';
import { allInUi } from './all-in';
import { loadedDiceUi } from './loaded-dice';
import { oddsMarketUi } from './odds-market';
import { sideBetsUi } from './side-bets';
import type { ModeUi } from './types';

export const registry: Record<ModeId, ModeUi> = {
  loaded_dice: loadedDiceUi,
  odds_market: oddsMarketUi,
  all_in: allInUi,
  side_bets: sideBetsUi,
};

/** Display order for pickers, rules sheets and the panel zone. */
export const UI_ORDER: readonly ModeId[] = ['odds_market', 'loaded_dice', 'all_in', 'side_bets'];

export const activeUi = (modes: readonly ModeId[]): [ModeId, ModeUi][] =>
  UI_ORDER.filter((id) => modes.includes(id)).map((id) => [id, registry[id]]);
