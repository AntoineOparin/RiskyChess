import { memo, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Chess } from 'chess.js';
import type { Color, MoveSlot, PieceSymbol, Square } from '@gamble/shared';
import { boardSquares, isLightSquare } from '../../lib/chess';
import { colors, slotColor } from '../../lib/theme';
import { Piece } from './Piece';

export interface Marker {
  from: Square;
  to: Square;
}

export interface BoardProps {
  fen: string;
  orientation: Color;
  size: number;
  selected?: Square | null;
  targets?: readonly Square[];
  slots?: Partial<Record<MoveSlot, Marker | null>>;
  lastMove?: Marker | null;
  /** The candidate the coin rejected, drawn faintly after a turn resolves. */
  ghost?: Marker | null;
  onSquarePress?: (sq: Square) => void;
}

function BoardImpl({ fen, orientation, size, selected, targets, slots, lastMove, ghost, onSquarePress }: BoardProps) {
  const cell = size / 8;
  const pieces = useMemo(() => {
    const map = new Map<Square, { type: PieceSymbol; color: Color }>();
    for (const row of new Chess(fen).board()) for (const p of row) if (p) map.set(p.square, { type: p.type, color: p.color });
    return map;
  }, [fen]);
  const rows = useMemo(() => boardSquares(orientation), [orientation]);
  const targetSet = useMemo(() => new Set(targets ?? []), [targets]);

  const slotAt = (sq: Square): { slot: MoveSlot; role: 'from' | 'to' } | null => {
    for (const slot of ['A', 'B'] as const) {
      const mk = slots?.[slot];
      if (mk?.to === sq) return { slot, role: 'to' };
      if (mk?.from === sq) return { slot, role: 'from' };
    }
    return null;
  };

  return (
    <View style={{ width: size, height: size }}>
      {rows.map((row, ri) => (
        <View key={ri} style={styles.row}>
          {row.map((sq, fi) => {
            const piece = pieces.get(sq);
            const mark = slotAt(sq);
            const isLast = lastMove && (lastMove.from === sq || lastMove.to === sq);
            const isGhost = ghost && (ghost.from === sq || ghost.to === sq);
            const light = isLightSquare(sq);
            return (
              <Pressable
                key={sq}
                accessibilityLabel={sq}
                onPress={onSquarePress ? () => onSquarePress(sq) : undefined}
                style={[{ width: cell, height: cell, backgroundColor: light ? colors.lightSquare : colors.darkSquare }]}
              >
                {isLast && <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.lastMove }]} />}
                {selected === sq && <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.selected }]} />}
                {isGhost && <View style={[StyleSheet.absoluteFill, styles.ghost]} />}
                {mark && (
                  <View
                    style={[
                      StyleSheet.absoluteFill,
                      { borderColor: slotColor(mark.slot), borderWidth: mark.role === 'to' ? 4 : 2 },
                    ]}
                  />
                )}
                {piece && <Piece type={piece.type} color={piece.color} size={cell} />}
                {targetSet.has(sq) && (
                  <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.center]}>
                    <View
                      style={
                        piece
                          ? [styles.captureRing, { width: cell * 0.9, height: cell * 0.9, borderRadius: cell }]
                          : [styles.dot, { width: cell * 0.3, height: cell * 0.3, borderRadius: cell }]
                      }
                    />
                  </View>
                )}
                {mark?.role === 'to' && (
                  <View style={[styles.badge, { backgroundColor: slotColor(mark.slot) }]}>
                    <Text style={styles.badgeText}>{mark.slot}</Text>
                  </View>
                )}
                {fi === 0 && <Text style={[styles.coord, styles.rank, { color: light ? colors.darkSquare : colors.lightSquare }]}>{sq[1]}</Text>}
                {ri === 7 && <Text style={[styles.coord, styles.file, { color: light ? colors.darkSquare : colors.lightSquare }]}>{sq[0]}</Text>}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

export const Board = memo(BoardImpl);

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  center: { alignItems: 'center', justifyContent: 'center' },
  dot: { backgroundColor: colors.target },
  captureRing: { borderWidth: 4, borderColor: colors.target },
  ghost: { borderWidth: 2, borderStyle: 'dashed', borderColor: 'rgba(0,0,0,0.45)' },
  badge: { position: 'absolute', top: 1, right: 1, paddingHorizontal: 4, borderRadius: 6 },
  badgeText: { fontSize: 10, fontWeight: '800', color: '#111' },
  coord: { position: 'absolute', fontSize: 9, fontWeight: '700' },
  rank: { top: 1, left: 2 },
  file: { bottom: 0, right: 3 },
});
