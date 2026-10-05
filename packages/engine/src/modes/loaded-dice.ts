import { Chess } from 'chess.js';
import type { MoveSlot } from '@risky-chess/shared';
import { scoreMove } from '../score';
import { lanOf } from '../legal';
import type { ModeModule } from './types';

/**
 * Loaded Dice: the mover may favor slot A or B and pay a stake tier to shift
 * the coin toward it. The stake is paid whatever the coin does, and the
 * pipeline's clamp means no purchase can make a slot certain.
 */
export const LOADED_DICE_TIERS = [
  { stake: 0, shift: 0 },
  { stake: 4, shift: 1000 },
  { stake: 10, shift: 2000 },
  { stake: 20, shift: 3000 },
] as const;

export const shiftFor = (stake: number) => LOADED_DICE_TIERS.find((t) => t.stake === stake)?.shift;

/**
 * The bot stakes only on a clear quality gap between its two moves, and only
 * from a healthy stack. minGap 2.5 (not 3) puts self-play spending at ~41% of
 * the starting stack, inside the 40–70% design band (scripts/loaded-dice-sim.ts).
 */
export const BOT_STAKE = { minGap: 2.5, minWallet: 30, maxTier: 10 } as const;

export const loadedDice: ModeModule = {
  id: 'loaded_dice',

  validate(ctx) {
    const stake = ctx.extras.stake ?? 0;
    if (stake === 0) return null;
    if (shiftFor(stake) === undefined) {
      return { error: 'INVALID_STAKE', message: `Stake must be one of ${LOADED_DICE_TIERS.map((t) => t.stake).join(', ')}` };
    }
    if (ctx.forced) return { error: 'INVALID_STAKE', message: 'No stake on a forced move' };
    if (ctx.extras.allIn || !ctx.moveB) return { error: 'INVALID_STAKE', message: 'No stake on an All-In' };
    if (!ctx.extras.favor) return { error: 'INVALID_STAKE', message: 'Pick the slot your stake favors' };
    if (stake > (ctx.wallet?.[ctx.mover] ?? 0)) return { error: 'INSUFFICIENT_CHIPS', message: `You have ${ctx.wallet?.[ctx.mover] ?? 0} chips` };
    return null;
  },

  adjustOdds(ctx, odds) {
    const shift = shiftFor(ctx.extras.stake ?? 0) ?? 0;
    if (!shift || !ctx.extras.favor) return odds;
    return { A: ctx.extras.favor === 'A' ? odds.A + shift : odds.A - shift };
  },

  effects(ctx) {
    const stake = ctx.extras.stake ?? 0;
    return stake > 0 ? [{ kind: 'chips', color: ctx.mover, delta: -stake, reason: 'stake' }] : [];
  },

  botExtras(fen, pair, state) {
    if (!pair.moveB) return {};
    const mover = new Chess(fen).turn();
    const chips = state.wallet?.[mover] ?? 0;
    if (chips <= BOT_STAKE.minWallet) return {};
    const legal = new Chess(fen).moves({ verbose: true });
    const find = (lan: string) => legal.find((m) => m.lan === lan);
    const a = find(lanOf(pair.moveA));
    const b = find(lanOf(pair.moveB));
    if (!a || !b) return {};
    const gap = scoreMove(fen, a) - scoreMove(fen, b);
    if (Math.abs(gap) < BOT_STAKE.minGap) return {};
    const tier = [...LOADED_DICE_TIERS].reverse().find((t) => t.stake > 0 && t.stake <= BOT_STAKE.maxTier && t.stake <= chips);
    if (!tier) return {};
    const favor: MoveSlot = gap > 0 ? 'A' : 'B';
    return { favor, stake: tier.stake };
  },
};
