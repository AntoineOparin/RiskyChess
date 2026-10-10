import { memo, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Color, PieceSymbol } from '@risky-chess/shared';
import { colors } from '../lib/theme';
import { Piece } from './Board/Piece';

const GLYPH = 16;

interface Props {
  name: string;
  /** Pieces this player has taken, drawn in the opponent's color. */
  captured: readonly Exclude<PieceSymbol, 'k'>[];
  capturedColor: Color;
  /** Material relative to the opponent: "+3" when ahead, "-3" when behind, hidden when level. */
  score: number;
  /** Mode additions, drawn at the right edge. */
  accessory?: ReactNode;
}

/** A player's name with the pieces they have captured and their material balance. */
function PlayerBarImpl({ name, captured, capturedColor, score, accessory }: Props) {
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
    </View>
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
});
