import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ALL_IN_RULES, CLASSIC_RULES, type GameRules } from '@risky-chess/shared';
import { ModeCard } from '../components/ModeCard';
import { Button, Screen } from '../components/ui';
import { registry } from '../modes/registry';
import { saveSeat } from '../net/seats';
import { request } from '../net/socket';
import { colors } from '../lib/theme';
import { useOnline } from '../net/useOnline';

const allIn = registry.all_in;

/** The two tables on offer. */
const TABLES = [
  { id: 'classic', title: 'Classic', pitch: 'Pick two moves, flip a fair coin.', risk: 0 as const, bullets: [] as const, rules: CLASSIC_RULES },
  { id: 'all_in', title: allIn.title, pitch: allIn.pitch, risk: allIn.risk, bullets: allIn.bullets, rules: ALL_IN_RULES },
];

/** Two steps, one decision each: the table, then who to play. */
export default function NewGame() {
  const { name } = useLocalSearchParams<{ name?: string }>();
  const displayName = (name ?? '').trim() || 'Player';
  const online = useOnline();
  const [step, setStep] = useState<1 | 2>(1);
  const [rules, setRules] = useState<GameRules>(CLASSIC_RULES);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const invite = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await request('create_game', { mode: 'pvp', displayName, color: 'random', rules });
      if (!res.ok) return setError(res.message);
      await saveSeat(res.data);
      router.replace({ pathname: '/game/[id]', params: { id: res.data.gameId } });
    } finally {
      setBusy(false);
    }
  };

  const table = TABLES.find((t) => t.rules === rules) ?? TABLES[0]!;

  if (step === 2) {
    return (
      <Screen scroll>
        <Text style={styles.step}>Step 2 of 2</Text>
        <Text style={styles.heading}>Who are you playing?</Text>
        <Text style={styles.muted}>Table: {table.title}</Text>
        <Choice label="Offline vs bot" sub="No connection needed" onPress={() => router.replace({ pathname: '/local', params: { modes: rules.modes.join(',') } })} />
        <Choice label="Invite a friend" sub={online ? 'Get a code to share' : 'Connecting…'} disabled={!online || busy} loading={busy} onPress={() => void invite()} />
        {error && <Text style={styles.error}>{error}</Text>}
        <Button label="‹ Change table" variant="ghost" onPress={() => setStep(1)} />
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <Text style={styles.step}>Step 1 of 2</Text>
      <Text style={styles.heading}>Choose your table</Text>
      {TABLES.map((t) => (
        <ModeCard key={t.id} title={t.title} pitch={t.pitch} risk={t.risk} bullets={t.bullets} selected={rules === t.rules} onPress={() => setRules(t.rules)} />
      ))}
      <Button label="Next" size="lg" onPress={() => setStep(2)} style={styles.next} />
    </Screen>
  );
}

function Choice({ label, sub, onPress, disabled, loading }: { label: string; sub: string; onPress: () => void; disabled?: boolean; loading?: boolean }) {
  return (
    <View style={styles.choice}>
      <Button label={label} variant="secondary" size="lg" onPress={onPress} disabled={disabled} loading={loading} />
      <Text style={styles.sub}>{sub}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  step: { color: colors.textMuted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  heading: { color: colors.text, fontSize: 22, fontWeight: '800' },
  muted: { color: colors.textMuted, fontSize: 13 },
  choice: { gap: 4 },
  sub: { color: colors.textMuted, fontSize: 13, textAlign: 'center' },
  error: { color: colors.danger },
  next: { marginTop: 8 },
});
