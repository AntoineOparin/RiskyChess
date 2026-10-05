import type { CoinToss, MoveSlot, ResolvedMove } from '@gamble/shared';

/** Source of uniform integers in [0, maxExclusive). Injected so tests can be deterministic. */
export interface Rng {
  int(maxExclusive: number): number;
}

/** Non-cryptographic rng for offline play and bot variety. Never used for server tosses. */
export const mathRng: Rng = {
  int: (maxExclusive) => Math.floor(Math.random() * maxExclusive),
};

/** Deterministic mulberry32 rng for tests. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return {
    int(maxExclusive) {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      return Math.floor(r * maxExclusive);
    },
  };
}

/** Decides which of two validated moves executes. */
export type Tosser = (moveA: ResolvedMove, moveB: ResolvedMove) => CoinToss;

export function rngTosser(rng: Rng, method: CoinToss['method']): Tosser {
  return () => {
    const chosen: MoveSlot = rng.int(2) === 0 ? 'A' : 'B';
    return { chosen, method };
  };
}
