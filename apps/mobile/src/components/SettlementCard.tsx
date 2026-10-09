import { StyleSheet, Text, View } from 'react-native';
import type { Color, Settlement } from '@risky-chess/shared';
import { colors, type as t } from '../lib/theme';
import { Money } from './ui';

/** How the pot was paid out, from the viewer's seat. */
export function SettlementCard({ settlement: s, myColor }: { settlement: Settlement; myColor: Color }) {
  const mine = s.payouts[myColor];
  const net = mine - s.buyInCents;
  return (
    <View style={styles.card} accessible accessibilityLabel={`Settlement: you ${net >= 0 ? 'won' : 'lost'} ${Math.abs(net) / 100} chips`}>
      <Text style={styles.title}>{net > 0 ? 'You take the pot' : net === 0 ? 'Buy-in returned' : 'The pot goes across'}</Text>
      <Money cents={net} sign tone="auto" size="xl" />
      <View style={styles.rows}>
        <Row label="Buy-in" cents={-s.buyInCents} />
        <Row label="Pot" cents={s.potCents} />
        <Row label="Rake" cents={-s.rakeCents} />
        <Row label="Paid to you" cents={mine} />
      </View>
    </View>
  );
}

function Row({ label, cents }: { label: string; cents: number }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Money cents={cents} sign tone="muted" size="sm" />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: 14, padding: 16, alignItems: 'center', gap: 6 },
  title: { color: colors.text, fontWeight: '800', fontSize: t.h3 },
  rows: { alignSelf: 'stretch', marginTop: 8, gap: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  label: { color: colors.textMuted, fontSize: t.small },
});
