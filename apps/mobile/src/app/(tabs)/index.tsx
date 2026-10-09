import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { formatCents, type FeedItem, type OpenTable } from '@risky-chess/shared';
import { BalancePill, Banner, Button, Card, EmptyState, Money, Screen, SectionHeader, Tile } from '../../components/ui';
import { useLobby } from '../../hooks/useLobby';
import { colors, type as t } from '../../lib/theme';
import { activeUi } from '../../modes/registry';
import { request } from '../../net/socket';
import { useAuthStore } from '../../state/authStore';
import { useWalletStore } from '../../state/walletStore';

const modeNames = (modes: readonly OpenTable['rules']['modes'][number][]) => (modes.length ? activeUi(modes).map(([, ui]) => ui.title).join(' + ') : 'Classic');

/** The casino floor: what to play, who is waiting, what just paid. */
export default function Casino() {
  const user = useAuthStore((s) => s.user);
  const balance = useWalletStore((s) => s.balanceCents);
  const { snapshot, online } = useLobby();
  const [joining, setJoining] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const join = async (gameId: string) => {
    setJoining(gameId);
    setError(null);
    const res = await request('join_game', { gameId });
    setJoining(null);
    if (!res.ok) return setError(res.message);
    router.push({ pathname: '/game/[id]', params: { id: res.data.gameId, joined: '1' } });
  };

  const tables = (snapshot?.tables ?? []).filter((tb) => tb.host.userId !== user?.id);
  const mine = (snapshot?.tables ?? []).find((tb) => tb.host.userId === user?.id);

  return (
    <Screen scroll>
      <View style={styles.header}>
        <Text style={styles.wordmark}>RISKY CHESS</Text>
        <BalancePill cents={balance} onPress={() => router.push('/(tabs)/wallet')} />
      </View>
      {!online && <Banner tone="warn">Connecting to the house…</Banner>}

      <View style={styles.grid}>
        <Tile title="Tables" subtitle="Buy in, play, take the pot" glyph="♜" tone="gold" onPress={() => router.push('/new-table')} />
        <Tile title="Sportsbook" subtitle="Bet on live games" glyph="◉" tone="blue" badge={snapshot?.markets.length ? `${snapshot.markets.length} live` : undefined} onPress={() => router.push('/(tabs)/sportsbook')} />
        <Tile title="Coin Duel" subtitle="Back a move, flip the coin" glyph="◐" tone="green" onPress={() => router.push('/originals/coin-duel')} />
        <Tile title="Blitz Puzzle" subtitle="Find the mate on the clock" glyph="⚡" tone="red" onPress={() => router.push('/originals/puzzle')} />
      </View>
      <Button label="Practice vs bot (free)" variant="ghost" onPress={() => router.push({ pathname: '/local', params: { modes: '' } })} />

      {mine && (
        <Card selected>
          <Text style={styles.cardTitle}>Your table {mine.gameId} is waiting</Text>
          <Text style={styles.muted}>{modeNames(mine.rules.modes)} · buy-in <Money cents={mine.buyInCents} size="sm" /></Text>
          <Button label="Return to table" onPress={() => router.push({ pathname: '/game/[id]', params: { id: mine.gameId } })} variant="secondary" />
        </Card>
      )}

      <SectionHeader title="Open tables" action={{ label: 'Host one', onPress: () => router.push('/new-table') }} />
      {error && <Text style={styles.error}>{error}</Text>}
      {tables.length === 0 ? (
        <EmptyState title="Nobody is waiting" hint="Host a table and share the code, or play the house in Coin Duel." />
      ) : (
        tables.map((tb) => (
          <Card key={tb.gameId}>
            <View style={styles.row}>
              <View style={styles.grow}>
                <Text style={styles.cardTitle}>{tb.host.username}</Text>
                <Text style={styles.muted}>
                  {modeNames(tb.rules.modes)} · plays {tb.host.color === 'w' ? 'White' : 'Black'}
                </Text>
              </View>
              <View style={styles.stake}>
                <Money cents={tb.buyInCents} size="md" />
                <Text style={styles.tiny}>buy-in</Text>
              </View>
            </View>
            <Button
              label={tb.buyInCents > 0 ? `Sit down for ${formatCents(tb.buyInCents)}` : 'Sit down (free)'}
              onPress={() => void join(tb.gameId)}
              loading={joining === tb.gameId}
              disabled={balance !== null && balance < tb.buyInCents}
            />
          </Card>
        ))
      )}

      <SectionHeader title="Live wins & losses" />
      {!snapshot?.feed.length ? <EmptyState title="Quiet so far" hint="Settled bets and pots show up here." /> : snapshot.feed.slice(0, 12).map((f) => <FeedRow key={f.id} item={f} />)}
      <Text style={styles.footer}>Chips are play money. No real-money wagering.</Text>
    </Screen>
  );
}

const GAME_LABEL: Record<FeedItem['game'], string> = { table: 'table', sportsbook: 'sportsbook', coin_duel: 'Coin Duel', puzzle: 'Blitz Puzzle' };

function FeedRow({ item }: { item: FeedItem }) {
  const net = item.payoutCents - item.stakeCents;
  return (
    <View style={styles.feedRow}>
      <Text style={styles.feedWho} numberOfLines={1}>
        <Text style={styles.feedName}>{item.username}</Text> · {GAME_LABEL[item.game]}
      </Text>
      <Money cents={net} sign tone="auto" size="sm" />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, marginTop: 8 },
  wordmark: { color: colors.slotA, fontSize: 18, fontWeight: '900', letterSpacing: 3 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  grow: { flex: 1 },
  stake: { alignItems: 'flex-end' },
  cardTitle: { color: colors.text, fontWeight: '800', fontSize: t.h3 },
  muted: { color: colors.textMuted, fontSize: t.small, marginTop: 2 },
  tiny: { color: colors.textMuted, fontSize: t.tiny },
  error: { color: colors.danger },
  feedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  feedWho: { color: colors.textMuted, fontSize: t.small, flexShrink: 1 },
  feedName: { color: colors.text, fontWeight: '700' },
  footer: { color: colors.textMuted, fontSize: t.tiny, textAlign: 'center', marginTop: 24, marginBottom: 8 },
});
