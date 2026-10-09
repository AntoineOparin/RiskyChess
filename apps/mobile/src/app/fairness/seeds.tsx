import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { commitmentOf, rollFromMessage } from '@risky-chess/engine';
import type { OriginalRoundSummary, RevealedSeedPair, SeedPair } from '@risky-chess/shared';
import { Button, Card, EmptyState, Screen, SectionHeader } from '../../components/ui';
import { colors, type as t } from '../../lib/theme';
import { api, ApiError } from '../../net/api';

const HOW = [
  'Your account holds a seed pair: a secret server seed (you see only its SHA-256) and a client seed you can change.',
  'Round n of the Originals rolls HMAC-SHA256(serverSeed, "clientSeed:n") mapped uniformly to 0–9999. The server committed to the seed before you played.',
  'Rotate the pair to reveal the old server seed. Then every round on it can be recomputed here, on your device.',
];

interface Seeds {
  current: SeedPair;
  history: RevealedSeedPair[];
}

/** Stake-style seed management plus on-device verification of past rounds. */
export default function Seeds() {
  const [seeds, setSeeds] = useState<Seeds | null>(null);
  const [rounds, setRounds] = useState<OriginalRoundSummary[]>([]);
  const [clientSeed, setClientSeed] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, r] = await Promise.all([api<Seeds>('/me/seeds'), api<OriginalRoundSummary[]>('/me/rounds')]);
      setSeeds(s);
      setRounds(r);
      setClientSeed(s.current.clientSeed);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const post = async (path: string, body?: unknown) => {
    setBusy(true);
    setError(null);
    try {
      setSeeds(await api<Seeds>(path, { method: 'POST', body: body ?? {} }));
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const revealedByHash = new Map((seeds?.history ?? []).map((h) => [h.serverSeedHash, h]));

  return (
    <Screen scroll>
      <SectionHeader title="How it works" />
      {HOW.map((h) => (
        <Text key={h} style={styles.bullet}>
          • {h}
        </Text>
      ))}

      <SectionHeader title="Active seed pair" />
      {seeds ? (
        <Card>
          <Text style={styles.label}>Server seed (hashed)</Text>
          <Text style={styles.mono} selectable>
            {seeds.current.serverSeedHash}
          </Text>
          <Text style={styles.label}>Client seed</Text>
          <TextInput value={clientSeed} onChangeText={setClientSeed} autoCapitalize="none" autoCorrect={false} style={styles.input} maxLength={64} accessibilityLabel="Client seed" />
          <Text style={styles.label}>Next nonce: {seeds.current.nonce}</Text>
          <View style={styles.actions}>
            <Button label="Save client seed" variant="secondary" onPress={() => void post('/me/seeds/client', { clientSeed: clientSeed.trim() })} disabled={busy || clientSeed.trim() === seeds.current.clientSeed} style={styles.grow} />
            <Button label="Rotate & reveal" onPress={() => void post('/me/seeds/rotate')} loading={busy} style={styles.grow} />
          </View>
          <Text style={styles.hint}>Changing the client seed also rotates the server seed, so an old nonce never meets a new seed.</Text>
        </Card>
      ) : (
        <EmptyState title="Loading…" />
      )}
      {error && <Text style={styles.error}>{error}</Text>}

      <SectionHeader title="Revealed pairs" />
      {!seeds?.history.length ? (
        <EmptyState title="Nothing revealed yet" hint="Rotate the pair above after playing to check your rounds." />
      ) : (
        seeds.history.map((h) => {
          const hashOk = commitmentOf(h.serverSeed) === h.serverSeedHash;
          return (
            <Card key={`${h.serverSeedHash}:${h.retiredAt}`}>
              <View style={styles.rowHead}>
                <Text style={styles.cardTitle}>{h.rounds} round{h.rounds === 1 ? '' : 's'}</Text>
                <Text style={hashOk ? styles.ok : styles.bad}>{hashOk ? '✓ hash matches' : '⚠ hash mismatch'}</Text>
              </View>
              <Text style={styles.mono} selectable>
                seed {h.serverSeed}
              </Text>
              <Text style={styles.mono}>client {h.clientSeed}</Text>
            </Card>
          );
        })
      )}

      <SectionHeader title="Your rounds" />
      {rounds.length === 0 ? (
        <EmptyState title="No rounds yet" />
      ) : (
        rounds.map((r) => {
          const pair = revealedByHash.get(r.serverSeedHash);
          const roll = pair ? rollFromMessage(pair.serverSeed, `${r.clientSeed}:${r.nonce}`) : null;
          return (
            <View key={r.id} style={styles.round}>
              <Text style={styles.roundTitle}>
                {r.game === 'coin_duel' ? 'Coin Duel' : 'Blitz Puzzle'} · nonce {r.nonce} · {r.status}
              </Text>
              <Text style={styles.mono}>{roll === null ? 'roll: rotate the pair to reveal' : `roll ${roll} (recomputed on this device)`}</Text>
            </View>
          );
        })
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  bullet: { color: colors.textMuted, lineHeight: 20, marginBottom: 4 },
  label: { color: colors.textMuted, fontSize: t.tiny, fontWeight: '700', textTransform: 'uppercase', marginTop: 8 },
  mono: { color: colors.text, fontFamily: 'Menlo', fontSize: 11, marginTop: 2 },
  input: { backgroundColor: colors.surfaceRaised, color: colors.text, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontFamily: 'Menlo', marginTop: 4 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  grow: { flex: 1 },
  hint: { color: colors.textMuted, fontSize: t.tiny, marginTop: 8 },
  error: { color: colors.danger, marginTop: 8 },
  rowHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { color: colors.text, fontWeight: '800' },
  ok: { color: colors.success, fontWeight: '800', fontSize: t.small },
  bad: { color: colors.danger, fontWeight: '800', fontSize: t.small },
  round: { paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  roundTitle: { color: colors.text, fontWeight: '700', fontSize: t.small },
});
