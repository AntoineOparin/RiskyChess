import { create } from 'zustand';
import type { TurnExtras } from '@risky-chess/shared';

interface ModeExtrasState {
  /** What the mode panels have set for the next submission. Reset every turn. */
  extras: TurnExtras;
  set(patch: Partial<TurnExtras>): void;
  reset(): void;
}

export const useModeExtras = create<ModeExtrasState>()((set) => ({
  extras: {},
  set: (patch) =>
    set((s) => {
      const next: TurnExtras = { ...s.extras, ...patch };
      for (const k of Object.keys(next) as (keyof TurnExtras)[]) if (next[k] === undefined) delete next[k];
      return { extras: next };
    }),
  reset: () => set({ extras: {} }),
}));

/** Drops empty fields so a classic submission carries no extras at all. */
export function cleanExtras(e: TurnExtras): TurnExtras | undefined {
  const out: TurnExtras = {};
  if (e.allIn) out.allIn = true;
  if (e.clientSeed) out.clientSeed = e.clientSeed;
  return Object.keys(out).length ? out : undefined;
}
