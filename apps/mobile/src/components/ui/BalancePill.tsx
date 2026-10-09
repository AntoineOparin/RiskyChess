import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatCents } from '@risky-chess/shared';
import { colors, radius } from '../../lib/theme';

export interface BalancePillProps {
  /** null while the balance is still loading. */
  cents: number | null;
  /** Usually opens the wallet / top-up. */
  onPress?: () => void;
}

/** The header balance: "◎ 1,250.00" with a "+" for topping up. */
export function BalancePill({ cents, onPress }: BalancePillProps) {
  const text = cents === null ? '—' : formatCents(cents);
  const body = (
    <>
      <Text style={styles.balance}>{text}</Text>
      {onPress ? (
        <View style={styles.plus}>
          <Text style={styles.plusText}>+</Text>
        </View>
      ) : null}
    </>
  );
  if (!onPress) return <View style={styles.pill}>{body}</View>;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`Balance ${text}. Top up`} style={({ pressed }) => [styles.pill, pressed && styles.pressed]}>
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface, borderRadius: radius.pill, paddingLeft: 12, paddingRight: 4, paddingVertical: 4, minHeight: 36, borderWidth: 1, borderColor: colors.border },
  balance: { color: colors.chip, fontWeight: '800', fontSize: 15, fontVariant: ['tabular-nums'] },
  plus: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.slotA, alignItems: 'center', justifyContent: 'center' },
  plusText: { color: '#111', fontWeight: '900', fontSize: 18, lineHeight: 20 },
  pressed: { opacity: 0.85 },
});
