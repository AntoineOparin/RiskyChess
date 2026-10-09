import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import type { LiveMarket } from '@risky-chess/shared';
import { BalancePill, Banner, Card, EmptyState, Money, OddsText, Screen, SectionHeader } from '../../components/ui';
import { useLobby } from '../../hooks/useLobby';
import { colors, type as t } from '../../lib/theme';
import { activeUi } from '../../modes/registry';
import { useWalletStore } from '../../state/walletStore';

/** Every public game in progress, priced. Tap one to watch it and bet. */
export default function Sportsbook() {
  const balance = useWalletStore((s) => s.balanceCents);
  const { snapshot, online } = useLobby();
  const markets = snapshot?.markets ?? [];

  return (
    <Screen scroll>
      <View style={styles.header}>
        <Text style={styles.title}>Sportsbook</Text>
        <BalancePill cents={balance} onPress={() => router.push('/(tabs)/wallet')} />
      </View>
      {!online && <Banner tone="warn">Connecting to the house…</Banner>}
      <SectionHeader title={`Live now · ${markets.length}`} />
      {markets.length === 0 ? (
        <EmptyState title="No games on the board" hint="Public tables appear here as soon as two players sit down." />
      ) : (
        markets.map((m) => <MarketCard key={m.gameId} market={m} />)
      )}
      <Text style={styles.footer}>Odds move with the position after every toss. Your bet locks at the odds you take.</Text>
    </Screen>
  );
}

function MarketCard({ market: m }: { market: LiveMarket }) {
  const modes = m.rules.modes.length ? activeUi(m.rules.modes).map(([, ui]) => ui.title).join(' + ') : 'Classic';
  return (
    <Card onPress={() => router.push({ pathname: '/watch/[id]', params: { id: m.gameId } })}>
      <View style={styles.row}>
        <Text style={styles.players} numberOfLines={1}>
          <Text style={styles.white}>{m.players.w.username}</Text> vs <Text style={styles.black}>{m.players.b.username}</Text>
        </Text>
        <Text style={styles.muted}>ply {m.turnNumber}</Text>
      </View>
      <Text style={styles.muted}>
        {modes} · buy-in <Money cents={m.buyInCents} size="sm" /> · handle <Money cents={m.handleCents} size="sm" />
      </Text>
      <View style={styles.odds}>
        <OddsBox label="White" oddsX100={m.line.w} />
        <OddsBox label="Draw" oddsX100={m.line.d} />
        <OddsBox label="Black" oddsX100={m.line.b} />
      </View>
    </Card>
  );
}

function OddsBox({ label, oddsX100 }: { label: string; oddsX100: number }) {
  return (
    <View style={styles.oddsBox}>
      <Text style={styles.oddsLabel}>{label}</Text>
      <OddsText oddsX100={oddsX100} size="md" />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, marginTop: 8 },
  title: { color: colors.text, fontSize: t.h1, fontWeight: '900' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  players: { color: colors.text, fontWeight: '800', fontSize: t.h3, flexShrink: 1 },
  white: { color: colors.text },
  black: { color: colors.textMuted },
  muted: { color: colors.textMuted, fontSize: t.small, marginTop: 2 },
  odds: { flexDirection: 'row', gap: 8, marginTop: 10 },
  oddsBox: { flex: 1, backgroundColor: colors.surfaceRaised, borderRadius: 10, paddingVertical: 8, alignItems: 'center', gap: 2 },
  oddsLabel: { color: colors.textMuted, fontSize: t.tiny, fontWeight: '700', textTransform: 'uppercase' },
  footer: { color: colors.textMuted, fontSize: t.tiny, textAlign: 'center', marginTop: 24 },
});
