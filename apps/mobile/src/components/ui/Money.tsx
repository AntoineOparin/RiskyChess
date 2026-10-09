import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';
import { formatCents } from '@risky-chess/shared';
import { accent, colors } from '../../lib/theme';

export interface MoneyProps {
  cents: number;
  /** Show "+" on gains. */
  sign?: boolean;
  /** auto: green when positive, red when negative. */
  tone?: 'auto' | 'neutral' | 'muted';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  style?: StyleProp<TextStyle>;
}

const SIZE = { sm: 13, md: 15, lg: 20, xl: 30 } as const;

/** "◎ 1,250.00", tabular, gold by default. */
export function Money({ cents, sign = false, tone = 'neutral', size = 'md', style }: MoneyProps) {
  const color = tone === 'muted' ? colors.textMuted : tone === 'auto' ? (cents > 0 ? accent.green : cents < 0 ? colors.danger : colors.textMuted) : colors.chip;
  const text = formatCents(cents, { sign });
  return (
    <Text style={[styles.money, { color, fontSize: SIZE[size] }, style]} accessibilityLabel={`${text.replace('◎', '')} chips`}>
      {text}
    </Text>
  );
}

const styles = StyleSheet.create({
  money: { fontWeight: '800', fontVariant: ['tabular-nums'] },
});
