import { ECONOMY, usesChips, type GameRules, type ModeState, type TurnEffect, type Wallet } from '@risky-chess/shared';

export function startingWallet(rules: GameRules): Wallet | undefined {
  return usesChips(rules) ? { w: ECONOMY.START_CHIPS, b: ECONOMY.START_CHIPS } : undefined;
}

/** Applies every `chips` effect. Throws if a wallet would go negative: validation must prevent that. */
export function applyEffects(wallet: Wallet, effects: readonly TurnEffect[]): Wallet {
  const next = { ...wallet };
  for (const e of effects) {
    if (e.kind !== 'chips') continue;
    next[e.color] += e.delta;
    if (next[e.color] < 0) throw new Error(`Wallet for ${e.color} would go negative (${next[e.color]})`);
  }
  return next;
}

/** Mode state is derived from effects: All-In declarations are used up, settled bets take their result. */
export function applyModeEffects(state: ModeState, effects: readonly TurnEffect[]): ModeState {
  let next = state;
  for (const e of effects) {
    if (e.kind === 'all_in') {
      const used = next.allInsUsed ?? { w: [], b: [] };
      next = { ...next, allInsUsed: { ...used, [e.color]: [...used[e.color], e.piece] } };
    } else if (e.kind === 'bet_settled') {
      const mine = next.bets?.[e.color];
      if (!Array.isArray(mine)) continue;
      next = {
        ...next,
        bets: { ...next.bets, [e.color]: mine.map((b) => (b.id === e.betId ? { ...b, status: e.result } : b)) },
      };
    }
  }
  return next;
}

/** Net chip change per color in a list of effects. */
export function chipDelta(effects: readonly TurnEffect[]): Wallet {
  const d = { w: 0, b: 0 };
  for (const e of effects) if (e.kind === 'chips') d[e.color] += e.delta;
  return d;
}
