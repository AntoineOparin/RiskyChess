import { StyleSheet, Text } from 'react-native';
import type { MoveSlot, Odds } from '@risky-chess/shared';
import { colors } from '../lib/theme';

/** "62%" for a slot, as text (never color alone). Hidden at a fair 50/50. */
export function OddsBadge({ odds, slot }: { odds: Odds | null; slot: MoveSlot }) {
  if (!odds || odds.A === 5000) return null;
  return <Text style={styles.badge}>{pct(odds, slot)}</Text>;
}

export const pctNumber = (odds: Odds, slot: MoveSlot) => Math.round((slot === 'A' ? odds.A : 10_000 - odds.A) / 100);
export const pct = (odds: Odds, slot: MoveSlot) => `${pctNumber(odds, slot)}%`;

const styles = StyleSheet.create({
  badge: { color: colors.text, fontWeight: '800', fontSize: 13, fontVariant: ['tabular-nums'] },
});
