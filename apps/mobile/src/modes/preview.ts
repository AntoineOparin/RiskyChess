import { previewOdds } from '@risky-chess/engine';
import type { Odds, TurnExtras } from '@risky-chess/shared';
import type { TableCtx } from './types';

/**
 * The odds the current slots would be tossed at with these extras, through
 * the engine's own pipeline (so every active mode composes exactly as on the
 * server). null when the pair is incomplete or the extras are invalid.
 */
export function previewWith(ctx: TableCtx, extras: TurnExtras): Odds | null {
  const { A, B } = ctx.slots;
  if (!A || (!B && !extras.allIn)) return null;
  const p = previewOdds({
    gameId: 'preview',
    turnNumber: ctx.turnNumber,
    fen: ctx.fen,
    previousFens: [],
    moveA: A,
    moveB: extras.allIn ? null : B,
    rules: ctx.rules,
    ...(ctx.wallet ? { wallet: ctx.wallet } : {}),
    modeState: ctx.modeState,
    extras,
    history: ctx.history,
  });
  return p.ok ? p.odds : null;
}
