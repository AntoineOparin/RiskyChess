import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Color, PieceSymbol, Square as Sq } from '@risky-chess/shared';
import { colors } from '../../lib/theme';
import { Piece } from './Piece';

/** What a tap on this square would do, drawn over the piece. */
export type TargetMark = 'dot' | 'ring' | 'taken' | null;

interface Props {
  sq: Sq;
  cell: number;
  light: boolean;
  pieceType: PieceSymbol | null;
  pieceColor: Color | null;
  lastMove: boolean;
  selected: boolean;
  target: TargetMark;
  rankLabel: boolean;
  fileLabel: boolean;
  /** Stable across renders, so memo only re-renders squares whose own state changed. */
  onPress: (sq: Sq) => void;
}

function SquareImpl({ sq, cell, light, pieceType, pieceColor, lastMove, selected, target, rankLabel, fileLabel, onPress }: Props) {
  const coordColor = { color: light ? colors.darkSquare : colors.lightSquare };
  return (
    <Pressable
      accessibilityLabel={sq}
      onPress={() => onPress(sq)}
      style={{ width: cell, height: cell, backgroundColor: light ? colors.lightSquare : colors.darkSquare }}
    >
      {lastMove && <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.lastMove }]} />}
      {selected && <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.selected }]} />}
      {pieceType && pieceColor && <Piece type={pieceType} color={pieceColor} size={cell} />}
      {target && (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.center]}>
          <View
            style={
              target === 'ring'
                ? [styles.ring, { width: cell * 0.9, height: cell * 0.9, borderRadius: cell }]
                : [target === 'taken' ? styles.taken : styles.dot, { width: cell * 0.3, height: cell * 0.3, borderRadius: cell }]
            }
          />
        </View>
      )}
      {rankLabel && <Text style={[styles.coord, styles.rank, coordColor]}>{sq[1]}</Text>}
      {fileLabel && <Text style={[styles.coord, styles.file, coordColor]}>{sq[0]}</Text>}
    </Pressable>
  );
}

export const Square = memo(SquareImpl);

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  dot: { backgroundColor: colors.target },
  // A candidate already in a slot: hollow and faint, so fresh options stand out.
  taken: { borderWidth: 2, borderColor: colors.target, opacity: 0.6 },
  ring: { borderWidth: 4, borderColor: colors.target },
  coord: { position: 'absolute', fontSize: 9, fontWeight: '700' },
  rank: { top: 1, left: 2 },
  file: { bottom: 0, right: 3 },
});
