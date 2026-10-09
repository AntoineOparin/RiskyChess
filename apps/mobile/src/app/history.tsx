import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { GameSummary, MatchBet, OriginalRoundSummary } from '@risky-chess/shared';
import { EmptyState, ListRow, Money, Pill, Screen } from '../components/ui';
import { colors, type as t } from '../lib/theme';
import { api } from '../net/api';

type Tab = 'games' | 'bets' | 'rounds';

/** Everything this account has played or wagered, newest first. */
export default function History() {
  const [tab, setTab] = useState<Tab>('games');
  const [games, setGames] = useState<GameSummary[]>([]);
  const [bets, setBets] = useState<MatchBet[]>([]);
  const [rounds, setRounds] = useState<OriginalRoundSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api<GameSummary[]>('/me/games'), api<MatchBet[]>('/me/bets'), api<OriginalRoundSummary[]>('/me/rounds')])
      .then(([g, b, r]) => {
        setGames(g);
        setBets(b);
        setRounds(r);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <Screen scroll>
      <View style={styles.tabs}>
        <Pill label={`Games · ${games.length}`} selected={tab === 'games'} onPress={() => setTab('games')} />
        <Pill label={`Bets · ${bets.length}`} selected={tab === 'bets'} onPress={() => setTab('bets')} />
        <Pill label={`Originals · ${rounds.length}`} selected={tab === 'rounds'} onPress={() => setTab('rounds')} />
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
      {tab === 'games' &&
        (games.length === 0 ? (
          <EmptyState title="No finished games" />
        ) : (
          games.map((g) => (
            <ListRow
              key={g.gameId}
              title={`${g.result === 'win' ? 'Won' : g.result === 'loss' ? 'Lost' : 'Drew'} vs ${g.opponent}`}
              subtitle={`${g.modes.length ? g.modes.join(' + ') : 'classic'} · ${g.color === 'w' ? 'White' : 'Black'} · ${new Date(g.finishedAt).toLocaleDateString()}`}
              right={g.buyInCents > 0 ? <Money cents={g.payoutCents - g.buyInCents} sign tone="auto" /> : <Text style={styles.muted}>free</Text>}
            />
          ))
        ))}
      {tab === 'bets' &&
        (bets.length === 0 ? (
          <EmptyState title="No sportsbook bets" />
        ) : (
          bets.map((b) => (
            <ListRow
              key={b.id}
              title={`${SIDE[b.side]} @ ${(b.oddsX100 / 100).toFixed(2)}× · ${b.status}`}
              subtitle={`Game ${b.gameId} · stake ${(b.stakeCents / 100).toFixed(2)} · ${new Date(b.placedAt).toLocaleString()}`}
              right={b.status === 'open' ? <Text style={styles.muted}>open</Text> : <Money cents={b.payoutCents - b.stakeCents} sign tone="auto" />}
            />
          ))
        ))}
      {tab === 'rounds' &&
        (rounds.length === 0 ? (
          <EmptyState title="No originals rounds" />
        ) : (
          rounds.map((r) => (
            <ListRow
              key={r.id}
              title={`${r.game === 'coin_duel' ? 'Coin Duel' : 'Blitz Puzzle'} · ${r.status}`}
              subtitle={`nonce ${r.nonce} · ${r.serverSeedHash.slice(0, 10)}… · ${new Date(r.createdAt).toLocaleString()}`}
              right={r.status === 'open' ? <Text style={styles.muted}>open</Text> : <Money cents={r.payoutCents - r.stakeCents} sign tone="auto" />}
            />
          ))
        ))}
    </Screen>
  );
}

const SIDE = { w: 'White', b: 'Black', d: 'Draw' } as const;

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', gap: 8, marginBottom: 12, marginTop: 4 },
  muted: { color: colors.textMuted, fontSize: t.small },
  error: { color: colors.danger },
});
