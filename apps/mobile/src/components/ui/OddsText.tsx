import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';
import { colors } from '../../lib/theme';

export interface OddsTextProps {
  /** Decimal odds ×100: 215 → "2.15×". */
  oddsX100: number;
  style?: StyleProp<TextStyle>;
  size?: 'sm' | 'md' | 'lg';
  /** Also show the implied probability, e.g. "(47%)". */
  implied?: boolean;
}

const SIZE = { sm: 13, md: 16, lg: 22 } as const;

export const formatOdds = (oddsX100: number) => `${(oddsX100 / 100).toFixed(2)}×`;
export const impliedPct = (oddsX100: number) => `${Math.round(10_000 / oddsX100)}%`;

/** Decimal odds, always as text, with an optional implied percentage beside them. */
export function OddsText({ oddsX100, style, size = 'md', implied = false }: OddsTextProps) {
  return (
    <Text style={[styles.odds, { fontSize: SIZE[size] }, style]} accessibilityLabel={`${formatOdds(oddsX100)}${implied ? `, ${impliedPct(oddsX100)} implied` : ''}`}>
      {formatOdds(oddsX100)}
      {implied ? <Text style={[styles.implied, { fontSize: Math.max(11, SIZE[size] - 4) }]}> {impliedPct(oddsX100)}</Text> : null}
    </Text>
  );
}

const styles = StyleSheet.create({
  odds: { color: colors.text, fontWeight: '800', fontVariant: ['tabular-nums'] },
  implied: { color: colors.textMuted, fontWeight: '600' },
});
