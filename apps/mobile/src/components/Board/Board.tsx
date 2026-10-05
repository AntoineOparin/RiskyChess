import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { Chess } from 'chess.js';
import type { Color, PieceSymbol, Square as Sq } from '@risky-chess/shared';
import { boardSquares, isLightSquare } from '../../lib/chess';
import type { Marker } from './BoardOverlay';
import { Square, type TargetMark } from './Square';

export type { Marker } from './BoardOverlay';

export interface BoardProps {
  fen: string;
  orientation: Color;
  size: number;
  selected?: Sq | null;
  targets?: readonly Sq[];
  /** Targets whose move is already in a slot: drawn hollow. */
  takenTargets?: readonly Sq[];
  lastMove?: Marker | null;
  onSquarePress?: (sq: Sq) => void;
}

/**
 * The 8×8 grid. Each square is memoized on primitive props, so a tap
 * re-renders only the squares whose highlight changed. Arrows and reveals are
 * drawn by BoardOverlay / TossReveal on top.
 */
function BoardImpl({ fen, orientation, size, selected, targets, takenTargets, lastMove, onSquarePress }: BoardProps) {
  const cell = size / 8;
  const pieces = useMemo(() => {
    const map = new Map<Sq, { type: PieceSymbol; color: Color }>();
    for (const row of new Chess(fen).board()) for (const p of row) if (p) map.set(p.square, { type: p.type, color: p.color });
    return map;
  }, [fen]);
  const rows = useMemo(() => boardSquares(orientation), [orientation]);
  const targetSet = useMemo(() => new Set(targets ?? []), [targets]);
  const takenSet = useMemo(() => new Set(takenTargets ?? []), [takenTargets]);

  // One stable handler for every square; the latest callback is read at press time.
  const pressRef = useRef(onSquarePress);
  useEffect(() => {
    pressRef.current = onSquarePress;
  }, [onSquarePress]);
  const onPress = useCallback((sq: Sq) => pressRef.current?.(sq), []);

  return (
    <View style={{ width: size, height: size }}>
      {rows.map((row, ri) => (
        <View key={ri} style={styles.row}>
          {row.map((sq, fi) => {
            const piece = pieces.get(sq);
            const target: TargetMark = !targetSet.has(sq) ? null : piece ? 'ring' : takenSet.has(sq) ? 'taken' : 'dot';
            return (
              <Square
                key={sq}
                sq={sq}
                cell={cell}
                light={isLightSquare(sq)}
                pieceType={piece?.type ?? null}
                pieceColor={piece?.color ?? null}
                lastMove={lastMove?.from === sq || lastMove?.to === sq}
                selected={selected === sq}
                target={target}
                rankLabel={fi === 0}
                fileLabel={ri === 7}
                onPress={onPress}
              />
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
});
