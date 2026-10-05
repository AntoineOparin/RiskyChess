import type { Color, GameRules, TurnEffect } from '@risky-chess/shared';
import { activeUi } from '../modes/registry';
import type { EffectLine } from '../modes/types';
import { CHIP } from './theme';

const REASON: Record<string, string> = {
  capture: 'capture',
  stake: 'stake',
  market_payout: 'beat the line',
  bet_stake: 'bet placed',
  bet_payout: 'bet won',
  bet_refund: 'bet refunded',
};

export const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');

/** Fallback text for effects no mode describes (capture income, plain chip moves). */
function generic(e: TurnEffect, me: Color): EffectLine | null {
  if (e.kind !== 'chips') return null;
  const who = e.color === me ? '' : 'Opponent ';
  return { text: `${who}${signed(e.delta)} ${CHIP} ${REASON[e.reason] ?? e.reason}`, tone: e.color === me ? (e.delta >= 0 ? 'good' : 'bad') : 'neutral' };
}

/** Toast lines for a turn's effects: the first active mode that claims an effect wins, else the generic text. */
export function describeEffects(effects: readonly TurnEffect[], rules: GameRules, me: Color): EffectLine[] {
  const modes = activeUi(rules.modes);
  const out: EffectLine[] = [];
  for (const e of effects) {
    let line: EffectLine | null = null;
    for (const [, ui] of modes) {
      line = ui.describeEffect?.(e, me) ?? null;
      if (line) break;
    }
    line ??= generic(e, me);
    if (line) out.push(line);
  }
  return out;
}
