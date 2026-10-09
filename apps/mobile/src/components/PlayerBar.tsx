import { memo, useEffect, useRef, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { formatCents, stackCents, type Color, type PieceSymbol } from '@risky-chess/shared';
import { CHIP_PULSE_MS } from '../lib/motion';
import { CHIP, colors } from '../lib/theme';
import { Piece } from './Board/Piece';

const GLYPH = 16;

interface Props {
  name: string;
  /** Pieces this player has taken, drawn in the opponent's color. */
  captured: readonly Exclude<PieceSymbol, 'k'>[];
  capturedColor: Color;
  /** Material relative to the opponent: "+3" when ahead, "-3" when behind, hidden when level. */
  score: number;
  /** Chip count when a chip mode is on. */
  chips?: number | undefined;
  /** Cents per table chip on a paid table; the stack's money value is shown beside it. */
  chipValueCents?: number | undefined;
  /** Mode additions (e.g. bets), drawn after the chips. */
  accessory?: ReactNode;
}

/** A player's name with the pieces they have captured and their material balance. */
function PlayerBarImpl({ name, captured, capturedColor, score, chips, chipValueCents, accessory }: Props) {
  return (
    <View style={styles.row}>
      <Text numberOfLines={1} style={styles.name}>
        {name}
      </Text>
      <View style={styles.captured} accessibilityLabel={`Captured: ${captured.join(' ') || 'none'}`}>
        {captured.map((type, i) => (
          // Same-type pieces overlap more than different types, so groups read at a glance.
          <View key={i} style={{ marginLeft: i === 0 ? 0 : captured[i - 1] === type ? -GLYPH * 0.55 : -GLYPH * 0.15 }}>
            <Piece type={type} color={capturedColor} size={GLYPH} />
          </View>
        ))}
      </View>
      {score !== 0 && (
        <Text style={[styles.score, score > 0 ? styles.ahead : styles.behind]}>{score > 0 ? `+${score}` : `−${-score}`}</Text>
      )}
      <View style={styles.spacer} />
      {accessory}
      {chips !== undefined && <Chips value={chips} chipValueCents={chipValueCents} />}
    </View>
  );
}

/** "◎ 87" (and its cash value on a paid table), pulsing briefly whenever the value changes. */
function Chips({ value, chipValueCents }: { value: number; chipValueCents?: number | undefined }) {
  const reduceMotion = useReducedMotion();
  const pulse = useSharedValue(1);
  const prev = useRef(value);
  useEffect(() => {
    if (prev.current === value) return;
    prev.current = value;
    if (!reduceMotion) pulse.value = withSequence(withTiming(0.35, { duration: CHIP_PULSE_MS }), withTiming(1, { duration: CHIP_PULSE_MS }));
  }, [value, reduceMotion, pulse]);
  const style = useAnimatedStyle(() => ({ opacity: pulse.value }));
  const cash = chipValueCents ? formatCents(stackCents(value, chipValueCents)) : null;
  return (
    <Animated.Text style={[styles.chips, style]} accessibilityLabel={`${value} chips${cash ? `, worth ${cash}` : ''}`}>
      {CHIP} {value}
      {cash && <Text style={styles.cash}> {cash}</Text>}
    </Animated.Text>
  );
}

export const PlayerBar = memo(PlayerBarImpl);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: GLYPH + 4 },
  name: { color: colors.textMuted, fontWeight: '600', flexShrink: 1 },
  captured: { flexDirection: 'row', alignItems: 'center', flexShrink: 1, overflow: 'hidden' },
  score: { fontWeight: '800', fontSize: 13, fontVariant: ['tabular-nums'] },
  ahead: { color: colors.success },
  behind: { color: colors.danger },
  spacer: { flex: 1 },
  chips: { color: colors.chip, fontWeight: '800', fontSize: 14, fontVariant: ['tabular-nums'] },
  cash: { color: colors.textMuted, fontWeight: '600', fontSize: 12 },
});
