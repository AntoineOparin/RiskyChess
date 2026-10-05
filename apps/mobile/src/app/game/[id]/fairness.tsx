import { FlatList, StyleSheet, Text, View } from 'react-native';
import { verifyToss } from '@risky-chess/engine';
import type { TurnResult } from '@risky-chess/shared';
import { shortHash } from '../../../lib/fairness';
import { colors } from '../../../lib/theme';
import { useGameStore } from '../../../state/gameStore';

const HOW = [
  'Before you choose your moves, the server locks in a secret seed and shows you its fingerprint (the commitment).',
  'Your phone adds its own random seed when you submit, so the server can’t pick a seed that suits it.',
  'After the toss the secret is revealed: your phone re-hashes it, recomputes the roll and checks it picked the move that was played.',
];

/** Every toss in this game, each re-verified on the device. */
export default function Fairness() {
  const session = useGameStore((s) => s.session);
  const tosses = (session?.history ?? []).filter((r) => r.coin);

  return (
    <FlatList
      contentContainerStyle={styles.container}
      data={tosses}
      keyExtractor={(r) => String(r.turnNumber)}
      ListHeaderComponent={
        <View style={styles.how}>
          <Text style={styles.title}>How this works</Text>
          {HOW.map((h) => (
            <Text key={h} style={styles.bullet}>
              • {h}
            </Text>
          ))}
          {session?.pendingCommitment && <Text style={styles.mono}>Next toss is locked: {shortHash(session.pendingCommitment, 12)}</Text>}
        </View>
      }
      ListEmptyComponent={<Text style={styles.muted}>No tosses yet.</Text>}
      renderItem={({ item }) => <Row r={item} />}
    />
  );
}

function Row({ r }: { r: TurnResult }) {
  const c = r.coin!;
  const check = verifyToss(r);
  const pctA = Math.round(r.odds.A / 100);
  return (
    <View style={styles.row} accessible accessibilityLabel={`Turn ${r.turnNumber}: ${check.ok ? 'verified' : `mismatch, ${check.reason}`}`}>
      <View style={styles.rowHead}>
        <Text style={styles.turn}>
          #{r.turnNumber} {r.moveA.san} {r.moveB ? `vs ${r.moveB.san}` : 'All-In'} → {c.chosen}
        </Text>
        <Text style={check.ok ? styles.ok : styles.bad}>{check.ok ? '✓' : '⚠'}</Text>
      </View>
      <Text style={styles.mono}>commit {shortHash(c.commitment)} · seed {shortHash(c.serverSeed)}</Text>
      <Text style={styles.mono}>
        roll {c.roll ?? '—'} · odds A {pctA}% / B {100 - pctA}%
      </Text>
      {!check.ok && <Text style={styles.bad}>{check.reason}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 10 },
  how: { gap: 6, marginBottom: 8 },
  title: { color: colors.text, fontWeight: '800', fontSize: 18 },
  bullet: { color: colors.textMuted, lineHeight: 20 },
  muted: { color: colors.textMuted, textAlign: 'center' },
  row: { backgroundColor: colors.surface, borderRadius: 10, padding: 12, gap: 4 },
  rowHead: { flexDirection: 'row', justifyContent: 'space-between' },
  turn: { color: colors.text, fontWeight: '700' },
  mono: { color: colors.textMuted, fontFamily: 'Menlo', fontSize: 12 },
  ok: { color: colors.success, fontWeight: '800' },
  bad: { color: colors.danger, fontWeight: '700' },
});
