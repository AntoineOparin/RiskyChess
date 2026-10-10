import type { ModeId } from '@risky-chess/shared';
import { allInUi } from './all-in';
import type { ModeUi } from './types';

export const registry: Record<ModeId, ModeUi> = {
  all_in: allInUi,
};

/** Display order for pickers, rules sheets and the panel zone. */
export const UI_ORDER: readonly ModeId[] = ['all_in'];

export const activeUi = (modes: readonly ModeId[]): [ModeId, ModeUi][] =>
  UI_ORDER.filter((id) => modes.includes(id)).map((id) => [id, registry[id]]);
