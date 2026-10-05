import { useCallback, useEffect, useMemo, useState } from 'react';
import { legalMoves, toResolved } from '@risky-chess/engine';
import type { MoveInput, MoveSlot, PromotionPiece, ResolvedMove, Square } from '@risky-chess/shared';
import { haptics } from '../lib/haptics';
import { playSfx } from '../lib/sfx';

type Slots = Record<MoveSlot, ResolvedMove | null>;
const EMPTY: Slots = { A: null, B: null };

/** Bumped on every event so chips can replay their animation for repeats. */
export interface SlotEvent {
  slot: MoveSlot;
  n: number;
}

/**
 * Two-slot move picker: tap piece → tap target fills the armed slot (A, then B).
 * Tapping a chip arms it so the next pick replaces it. Both candidates come
 * from the same position; nothing is played until the toss.
 */
export function useMoveSelection(fen: string, enabled: boolean, single = false) {
  const legal = useMemo(() => legalMoves(fen), [fen]);
  const forced = legal.length === 1;
  const [from, setFrom] = useState<Square | null>(null);
  const [slots, setSlots] = useState<Slots>(EMPTY);
  /** Slot the player explicitly chose to (re)fill; otherwise the first empty one. */
  const [armedOverride, setArmedOverride] = useState<MoveSlot | null>(null);
  const [filled, setFilled] = useState<SlotEvent | null>(null);
  const [rejected, setRejected] = useState<SlotEvent | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<{ from: Square; to: Square } | null>(null);

  useEffect(() => {
    setFrom(null);
    setPendingPromotion(null);
    setArmedOverride(null);
    const only = legal.length === 1 ? legal[0] : undefined;
    setSlots(only ? { A: toResolved(only), B: null } : EMPTY);
  }, [legal]);

  /** Where the next pick goes. null only when both slots are full and none is armed. A single declaration only uses A. */
  const armed: MoveSlot | null = single ? 'A' : (armedOverride ?? (!slots.A ? 'A' : !slots.B ? 'B' : null));

  const assign = useCallback(
    (m: ResolvedMove) => {
      // With both slots full and nothing armed, a pick replaces B (and B visibly pops).
      const slot = armed ?? 'B';
      const other = slot === 'A' ? slots.B : slots.A;
      if (!single && other?.lan === m.lan) {
        setRejected((r) => ({ slot: slot === 'A' ? 'B' : 'A', n: (r?.n ?? 0) + 1 }));
        haptics.warning();
        return;
      }
      setSlots((s) => ({ ...s, [slot]: m }));
      setArmedOverride(null);
      setFilled((f) => ({ slot, n: (f?.n ?? 0) + 1 }));
      playSfx(slot === 'A' ? 'pick_a' : 'pick_b');
      haptics.selection();
    },
    [armed, slots, single],
  );

  const onSquarePress = useCallback(
    (sq: Square) => {
      if (!enabled || forced) return;
      if (from) {
        const candidates = legal.filter((m) => m.from === from && m.to === sq);
        const first = candidates[0];
        if (first) {
          if (candidates.length > 1) setPendingPromotion({ from, to: sq });
          else assign(toResolved(first));
          setFrom(null);
          return;
        }
      }
      setFrom(sq !== from && legal.some((m) => m.from === sq) ? sq : null);
    },
    [enabled, forced, from, legal, assign],
  );

  const choosePromotion = useCallback(
    (piece: PromotionPiece | null) => {
      if (piece && pendingPromotion) {
        const m = legal.find((x) => x.from === pendingPromotion.from && x.to === pendingPromotion.to && x.promotion === piece);
        if (m) assign(toResolved(m));
      }
      setPendingPromotion(null);
    },
    [legal, pendingPromotion, assign],
  );

  /** Tap a chip: arm it so the next pick fills it; tap again to disarm. */
  const arm = useCallback((slot: MoveSlot) => setArmedOverride((a) => (a === slot ? null : slot)), []);
  const clear = useCallback((slot: MoveSlot) => {
    setSlots((s) => ({ ...s, [slot]: null }));
    setArmedOverride(null);
  }, []);
  const reset = useCallback(() => {
    setFrom(null);
    setSlots(EMPTY);
    setArmedOverride(null);
  }, []);

  const fromMoves = useMemo(() => (from ? legal.filter((m) => m.from === from) : []), [from, legal]);
  const targets = useMemo(() => [...new Set(fromMoves.map((m) => m.to as Square))], [fromMoves]);
  // A target is "taken" when its only move from here already sits in the slot that isn't armed.
  const takenTargets = useMemo(() => {
    const kept = armed === 'A' ? slots.B : armed === 'B' ? slots.A : slots.A;
    return targets.filter((to) => {
      const moves = fromMoves.filter((m) => m.to === to);
      return moves.length === 1 && kept?.from === from && kept?.to === to;
    });
  }, [armed, slots, targets, fromMoves, from]);

  const strip = (m: ResolvedMove): MoveInput => ({ from: m.from, to: m.to, ...(m.promotion ? { promotion: m.promotion } : {}) });
  // A single declaration (All-In) sends Move A alone; otherwise a pair, or the forced move.
  const submission = !slots.A
    ? null
    : single
      ? { moveA: strip(slots.A), moveB: null }
      : forced || slots.B
        ? { moveA: strip(slots.A), moveB: slots.B ? strip(slots.B) : null }
        : null;

  return {
    from,
    slots,
    armed,
    filled,
    rejected,
    targets,
    takenTargets,
    forced,
    pendingPromotion,
    onSquarePress,
    choosePromotion,
    arm,
    clear,
    reset,
    submission,
  };
}
