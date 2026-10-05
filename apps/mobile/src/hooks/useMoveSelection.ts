import { useCallback, useEffect, useMemo, useState } from 'react';
import { legalMoves, toResolved } from '@risky-chess/engine';
import type { MoveInput, MoveSlot, PromotionPiece, ResolvedMove, Square } from '@risky-chess/shared';

type Slots = Record<MoveSlot, ResolvedMove | null>;
const EMPTY: Slots = { A: null, B: null };

/**
 * Two-slot move picker: tap piece → tap target fills A, then B.
 * Both candidates come from the same position; nothing is played until the toss.
 */
export function useMoveSelection(fen: string, enabled: boolean) {
  const legal = useMemo(() => legalMoves(fen), [fen]);
  const forced = legal.length === 1;
  const [from, setFrom] = useState<Square | null>(null);
  const [slots, setSlots] = useState<Slots>(EMPTY);
  const [pendingPromotion, setPendingPromotion] = useState<{ from: Square; to: Square } | null>(null);

  useEffect(() => {
    setFrom(null);
    setPendingPromotion(null);
    const only = legal.length === 1 ? legal[0] : undefined;
    setSlots(only ? { A: toResolved(only), B: null } : EMPTY);
  }, [legal]);

  const assign = useCallback((m: ResolvedMove) => {
    setSlots((s) => {
      if (s.A?.lan === m.lan || s.B?.lan === m.lan) return s;
      if (!s.A) return { ...s, A: m };
      return { ...s, B: m };
    });
  }, []);

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

  const clear = useCallback((slot: MoveSlot) => setSlots((s) => ({ ...s, [slot]: null })), []);
  const reset = useCallback(() => {
    setFrom(null);
    setSlots(EMPTY);
  }, []);

  const targets = useMemo(
    () => (from ? [...new Set(legal.filter((m) => m.from === from).map((m) => m.to as Square))] : []),
    [from, legal],
  );

  const strip = (m: ResolvedMove): MoveInput => ({ from: m.from, to: m.to, ...(m.promotion ? { promotion: m.promotion } : {}) });
  const submission =
    slots.A && (forced || slots.B) ? { moveA: strip(slots.A), moveB: slots.B ? strip(slots.B) : null } : null;

  return { from, slots, targets, forced, pendingPromotion, onSquarePress, choosePromotion, clear, reset, submission };
}
