import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import type { LeaderboardRow } from '@risky-chess/shared';
import { Button, Card, EmptyState, ListRow, Money, Screen, SectionHeader } from '../../components/ui';
import { colors, type as t } from '../../lib/theme';
import { api } from '../../net/api';
import { refreshMe } from '../../net/presence';
import { useAuthStore } from '../../state/authStore';
import { useWalletStore } from '../../state/walletStore';

/** Who you are, how you're doing, and the doors to history and fairness. */
export default function Profile() {
  const user = useAuthStore((s) => s.user);
  const stats = useWalletStore((s) => s.stats);
  const [board, setBoard] = useState<LeaderboardRow[]>([]);

  useFocusEffect(
    useCallback(() => {
      void refreshMe();
      api<LeaderboardRow[]>('/leaderboard')
        .then(setBoard)
        .catch(() => setBoard([]));
    }, []),
  );

  const net = (stats?.tableNetCents ?? 0) + (stats?.betNetCents ?? 0);
  return (
    <Screen scroll>
      <Text style={styles.title}>{user?.username ?? 'Player'}</Text>
      <Card>
        <View style={styles.statsRow}>
          <Stat label="Games" value={String(stats?.games ?? 0)} />
          <Stat label="W / D / L" value={`${stats?.wins ?? 0} / ${stats?.draws ?? 0} / ${stats?.losses ?? 0}`} />
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Lifetime</Text>
            <Money cents={net} sign tone="auto" />
          </View>
        </View>
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Tables</Text>
            <Money cents={stats?.tableNetCents ?? 0} sign tone="auto" size="sm" />
          </View>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Bets & originals</Text>
            <Money cents={stats?.betNetCents ?? 0} sign tone="auto" size="sm" />
          </View>
        </View>
      </Card>

      <ListRow title="History" subtitle="Games, sportsbook bets and originals rounds" right={<Text style={styles.chev}>›</Text>} onPress={() => router.push('/history')} />
      <ListRow title="Provably fair" subtitle="Seed pairs, nonces and how to verify" right={<Text style={styles.chev}>›</Text>} onPress={() => router.push('/fairness/seeds')} />

      <SectionHeader title="Leaderboard" />
      {board.length === 0 ? (
        <EmptyState title="No results yet" />
      ) : (
        board.map((row, i) => (
          <ListRow
            key={row.userId}
            left={<Text style={styles.rank}>{i + 1}</Text>}
            title={row.username}
            subtitle={`${row.games} game${row.games === 1 ? '' : 's'}`}
            right={<Money cents={row.netCents} sign tone="auto" />}
          />
        ))
      )}

      <Button label="Sign out of this device" variant="ghost" onPress={() => void useAuthStore.getState().signOut()} style={styles.signOut} />
      <Text style={styles.footer}>Signing out forgets this account on this device. There is no way to sign back in: a new name means a new account.</Text>
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.text, fontSize: t.h1, fontWeight: '900', marginTop: 8, marginBottom: 12 },
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 10 },
  stat: { flex: 1, gap: 2 },
  statLabel: { color: colors.textMuted, fontSize: t.tiny, fontWeight: '700', textTransform: 'uppercase' },
  statValue: { color: colors.text, fontSize: t.h3, fontWeight: '800', fontVariant: ['tabular-nums'] },
  chev: { color: colors.textMuted, fontSize: 22 },
  rank: { color: colors.slotA, fontWeight: '900', width: 24, textAlign: 'center' },
  signOut: { marginTop: 24 },
  footer: { color: colors.textMuted, fontSize: t.tiny, textAlign: 'center', marginBottom: 12 },
});
