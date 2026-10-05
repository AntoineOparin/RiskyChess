import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import type { Color, MoveSlot, Square } from '@risky-chess/shared';
import { MoveArrow, pairOffset } from './MoveArrow';

export interface Marker {
  from: Square;
  to: Square;
}

interface Props {
  orientation: Color;
  cell: number;
  /** The candidates being picked. */
  slots: Partial<Record<MoveSlot, Marker | null>>;
  /** The candidate the coin rejected last turn, drawn faintly. */
  ghost?: { slot: MoveSlot; move: Marker } | null;
}

/**
 * Arrows drawn above the board grid. Kept separate so picking moves re-renders
 * only these few Views, never the 64 squares.
 */
function BoardOverlayImpl({ orientation, cell, slots, ghost }: Props) {
  const offsets = pairOffset(slots.A, slots.B);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {ghost && (
        <MoveArrow {...ghost.move} slot={ghost.slot} orientation={orientation} cell={cell} animatedStyle={styles.ghost} />
      )}
      {(['A', 'B'] as const).map((slot) => {
        const m = slots[slot];
        return m ? <MoveArrow key={slot} from={m.from} to={m.to} slot={slot} orientation={orientation} cell={cell} offset={offsets[slot]} /> : null;
      })}
    </View>
  );
}

export const BoardOverlay = memo(BoardOverlayImpl);

const styles = StyleSheet.create({
  ghost: { opacity: 0.22 },
});
