import type { Color, GameRules, ModeState, TurnEffect, TurnResult } from '@risky-chess/shared';
import { activeUi } from '../modes/registry';
import type { EffectLine } from '../modes/types';

/** Toast lines for a turn's effects: the first active mode that claims an effect wins. */
export function describeEffects(effects: readonly TurnEffect[], rules: GameRules, me: Color, turn?: TurnResult, modeState?: ModeState): EffectLine[] {
  const modes = activeUi(rules.modes);
  const out: EffectLine[] = [];
  for (const e of effects) {
    for (const [, ui] of modes) {
      const line = ui.describeEffect?.(e, me, turn, modeState);
      if (line) {
        out.push(line);
        break;
      }
    }
  }
  return out;
}
