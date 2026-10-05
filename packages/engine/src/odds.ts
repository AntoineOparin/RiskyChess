import { ODDS, type ModeId, type Odds } from '@risky-chess/shared';
import { activeModules, ODDS_ORDER, type TurnCtx } from './modes';

export const FAIR_ODDS: Odds = { A: ODDS.BASE };

export const clampOdds = (o: Odds): Odds => ({ A: Math.min(ODDS.MAX, Math.max(ODDS.MIN, Math.round(o.A))) });

export interface OddsLine {
  odds: Odds;
  /** One step per module that moved the line, after `base`. Empty when nothing did. */
  steps: { source: ModeId | 'base'; A: number }[];
}

/**
 * Base 5000 → each active module in ODDS_ORDER → clamp to [1000, 9000].
 * Only paired tosses have a line: forced and single-move turns stay fair.
 */
export function computeOdds(ctx: TurnCtx): OddsLine {
  if (!ctx.moveB) return { odds: FAIR_ODDS, steps: [] };
  let odds = FAIR_ODDS;
  const steps: OddsLine['steps'] = [];
  for (const m of activeModules(ctx.rules, ODDS_ORDER)) {
    if (!m.adjustOdds) continue;
    const next = m.adjustOdds(ctx, odds);
    if (next.A !== odds.A) steps.push({ source: m.id, A: next.A });
    odds = next;
  }
  const clamped = clampOdds(odds);
  return { odds: clamped, steps: steps.length ? [{ source: 'base', A: ODDS.BASE }, ...steps] : [] };
}
