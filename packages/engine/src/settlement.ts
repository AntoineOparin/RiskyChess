import { RAKE_BPS, type Color, type GameOutcome, type Settlement, type Wallet } from '@risky-chess/shared';

export interface SettleInput {
  buyInCents: number;
  outcome: GameOutcome;
  /** Final table stacks; absent on classic tables, which count 100/100. */
  wallet?: Wallet | undefined;
}

/** The outcome's winner, or null on a draw. */
export const winnerOf = (outcome: GameOutcome): Color | null => ('winner' in outcome ? outcome.winner : null);

/**
 * How a paid table's pot is returned. Decisive results pay the winner the pot
 * minus the rake. Draws split the pot pro-rata by final stacks, because chip
 * modes mint and burn chips (capture income, market payouts, stakes), so the
 * stacks never map one-to-one onto the money that was actually posted.
 * Rounding remainders go to the house. Free tables (buy-in 0) return null.
 */
export function settleTable({ buyInCents, outcome, wallet }: SettleInput): Settlement | null {
  if (buyInCents <= 0) return null;
  const potCents = buyInCents * 2;
  const winner = winnerOf(outcome);
  if (winner) {
    const rakeCents = Math.floor((potCents * RAKE_BPS) / 10_000);
    const payouts: Record<Color, number> = { w: 0, b: 0 };
    payouts[winner] = potCents - rakeCents;
    return { buyInCents, potCents, rakeCents, payouts };
  }
  const stacks = wallet ?? { w: 100, b: 100 };
  const total = stacks.w + stacks.b;
  const w = total > 0 ? Math.floor((potCents * stacks.w) / total) : buyInCents;
  const b = total > 0 ? Math.floor((potCents * stacks.b) / total) : buyInCents;
  return { buyInCents, potCents, rakeCents: potCents - w - b, payouts: { w, b } };
}
