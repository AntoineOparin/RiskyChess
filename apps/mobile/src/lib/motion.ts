import type { TurnResult } from '@risky-chess/shared';

// Every reveal timing lives here so the offline bot delay can be derived from it.

/** The coin's time in the air. Long enough to build anticipation, short enough not to drag. */
const COIN_SPIN_MS = 1700;
/** The opponent's toss runs a bit quicker; it is less personal. */
const OPPONENT_SPIN_SCALE = 0.75;
/**
 * Full turns before landing; the B face adds half a turn. Kept low so the
 * opening frames turn under ~30° each: faster than that reads as strobing.
 */
export const COIN_TURNS = 3;
/** Beat on the landed coin and winning arrow before the piece moves. */
export const LAND_HOLD_MS = 450;
export const SLIDE_MS = 220;
/** A forced move shows its chip this long before sliding. */
export const FORCED_HOLD_MS = 250;
/** With Reduce Motion on: no spin, no slide, just this pause on the result. */
export const REDUCED_HOLD_MS = 300;

export function coinSpinMs(mine: boolean): number {
  return Math.round(mine ? COIN_SPIN_MS : COIN_SPIN_MS * OPPONENT_SPIN_SCALE);
}

/** How long a turn's reveal takes when nobody skips it. */
export function revealDurationMs(result: TurnResult, mine: boolean, reduceMotion = false): number {
  if (reduceMotion) return REDUCED_HOLD_MS;
  if (result.forced) return FORCED_HOLD_MS + SLIDE_MS;
  return coinSpinMs(mine) + LAND_HOLD_MS + SLIDE_MS;
}

/** A chip counter's brief pulse when its value changes. */
export const CHIP_PULSE_MS = 180;
/** How long an effect toast stays up after a reveal settles. */
export const EFFECT_TOAST_MS = 2500;
