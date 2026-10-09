import { useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { router } from 'expo-router';
import { BUY_IN_TIERS_CENTS, MODE_PRESETS, RAKE_BPS, formatCents, type GameMode, type ModeId, type ModePreset, type Visibility } from '@risky-chess/shared';
import { ModeCard } from '../components/ModeCard';
import { Button, Card, Money, Pill, Screen } from '../components/ui';
import { activeUi, registry, UI_ORDER } from '../modes/registry';
import { request } from '../net/socket';
import { colors, type as t } from '../lib/theme';
import { useOnline } from '../net/useOnline';
import { useWalletStore } from '../state/walletStore';

const CLASSIC_PITCH = 'Pick two moves, flip a fair coin. No chips.';

function presetCard(p: ModePreset): { pitch: string; risk: 0 | 1 | 2 | 3; bullets: readonly string[] } {
  if (p.id === 'classic') return { pitch: CLASSIC_PITCH, risk: 0, bullets: [] };
  if (p.id === 'high_roller') return { pitch: 'Every mode at once. Big swings.', risk: 3, bullets: activeUi(p.modes).map(([, ui]) => `${ui.title}: ${ui.pitch}`) };
  const ui = registry[p.id];
  return { pitch: ui.pitch, risk: ui.risk, bullets: ui.bullets };
}

const sameModes = (a: readonly ModeId[], b: readonly ModeId[]) => a.length === b.length && a.every((m) => b.includes(m));

/** Two steps: the table's modes, then the stakes and who sits across. */
export default function NewTable() {
  const online = useOnline();
  const balance = useWalletStore((s) => s.balanceCents);
  const [step, setStep] = useState<1 | 2>(1);
  const [modes, setModes] = useState<ModeId[]>([]);
  const [advanced, setAdvanced] = useState(false);
  const [buyIn, setBuyIn] = useState<number>(BUY_IN_TIERS_CENTS[1] ?? 0);
  const [visibility, setVisibility] = useState<Visibility>('public');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const presets = MODE_PRESETS.filter((p) => p.id !== 'high_roller');
  const highRoller = MODE_PRESETS.find((p) => p.id === 'high_roller')!;
  const toggle = (id: ModeId, on: boolean) => setModes((m) => (on ? UI_ORDER.filter((x) => x === id || m.includes(x)) : m.filter((x) => x !== id)));

  const createOnline = async (mode: GameMode) => {
    setBusy(true);
    setError(null);
    try {
      const res = await request('create_game', { mode, color: 'random', rules: { modes }, buyInCents: mode === 'bot' ? 0 : buyIn, visibility });
      if (!res.ok) return setError(res.message);
      router.replace({ pathname: '/game/[id]', params: { id: res.data.gameId } });
    } finally {
      setBusy(false);
    }
  };

  if (step === 2) {
    const summary = modes.length ? activeUi(modes).map(([, ui]) => ui.title).join(' + ') : 'Classic';
    const short = balance !== null && balance < buyIn;
    return (
      <Screen scroll>
        <Text style={styles.step}>Step 2 of 2</Text>
        <Text style={styles.heading}>Set the stakes</Text>
        <Text style={styles.muted}>Table: {summary}</Text>

        <Text style={styles.label}>Buy-in per seat</Text>
        <View style={styles.tiers}>
          {BUY_IN_TIERS_CENTS.map((cents) => (
            <Pill key={cents} label={cents === 0 ? 'Free' : formatCents(cents)} selected={buyIn === cents} tone="accent" onPress={() => setBuyIn(cents)} disabled={balance !== null && cents > balance} />
          ))}
        </View>
        <Card>
          {buyIn > 0 ? (
            <>
              <Text style={styles.potLine}>
                Pot <Money cents={buyIn * 2} /> · winner takes <Money cents={buyIn * 2 - Math.floor((buyIn * 2 * RAKE_BPS) / 10_000)} tone="auto" />
              </Text>
              <Text style={styles.muted}>
                {RAKE_BPS / 100}% rake on decisive games. Draws split the pot by final chip stacks. Each table chip is worth {formatCents(buyIn / 100)}.
              </Text>
            </>
          ) : (
            <Text style={styles.muted}>Free table: nothing changes hands. Modes still use 100 table chips.</Text>
          )}
        </Card>
        <View style={styles.switchRow}>
          <View style={styles.grow}>
            <Text style={styles.label}>List in the lobby</Text>
            <Text style={styles.muted}>{visibility === 'public' ? 'Anyone can sit down and spectators can bet on it.' : 'Only people with the code can join; no sportsbook.'}</Text>
          </View>
          <Switch value={visibility === 'public'} onValueChange={(on) => setVisibility(on ? 'public' : 'private')} accessibilityLabel="List in the lobby" />
        </View>

        <Button label={buyIn > 0 ? `Open table · buy in ${formatCents(buyIn)}` : 'Open free table'} onPress={() => void createOnline('pvp')} disabled={!online || busy || short} loading={busy} size="lg" />
        {short && <Text style={styles.error}>Not enough chips for that buy-in. Top up in the wallet.</Text>}
        <Text style={styles.or}>— or practice, no stakes —</Text>
        <Button label="Online vs bot" variant="secondary" onPress={() => void createOnline('bot')} disabled={!online || busy} />
        <Button label="Offline vs bot" variant="secondary" onPress={() => router.replace({ pathname: '/local', params: { modes: modes.join(',') } })} />
        {error && <Text style={styles.error}>{error}</Text>}
        <Button label="‹ Change modes" variant="ghost" onPress={() => setStep(1)} />
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <Text style={styles.step}>Step 1 of 2</Text>
      <Text style={styles.heading}>Choose your table</Text>
      {!advanced &&
        [...presets, highRoller].map((p) => (
          <ModeCard key={p.id} title={p.name} {...presetCard(p)} selected={sameModes(modes, p.modes)} onPress={() => setModes([...p.modes])} />
        ))}
      <View style={styles.advRow}>
        <Text style={styles.label}>Advanced: mix modes</Text>
        <Switch value={advanced} onValueChange={setAdvanced} accessibilityLabel="Advanced: mix modes" />
      </View>
      {advanced &&
        UI_ORDER.map((id) => (
          <View key={id} style={styles.switchRow}>
            <View style={styles.grow}>
              <Text style={styles.label}>{registry[id].title}</Text>
              <Text style={styles.muted}>{registry[id].pitch}</Text>
            </View>
            <Switch value={modes.includes(id)} onValueChange={(on) => toggle(id, on)} accessibilityLabel={registry[id].title} />
          </View>
        ))}
      <Button label="Next: stakes" onPress={() => setStep(2)} size="lg" style={styles.next} />
      <Text style={styles.footer}>Chips are play money. No real-money wagering.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  step: { color: colors.textMuted, fontSize: t.tiny, fontWeight: '700', textTransform: 'uppercase', marginTop: 4 },
  heading: { color: colors.text, fontSize: t.h1 - 4, fontWeight: '800', marginBottom: 8 },
  label: { color: colors.text, fontWeight: '700' },
  muted: { color: colors.textMuted, fontSize: t.small, marginTop: 2 },
  tiers: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8, marginBottom: 10 },
  potLine: { color: colors.text, fontWeight: '700', marginBottom: 4 },
  grow: { flex: 1 },
  advRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, marginBottom: 8 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: 12, padding: 12, marginVertical: 6 },
  next: { marginTop: 12 },
  or: { color: colors.textMuted, textAlign: 'center', fontSize: t.small, marginVertical: 12 },
  error: { color: colors.danger, marginTop: 8 },
  footer: { color: colors.textMuted, fontSize: t.tiny, textAlign: 'center', marginTop: 16 },
});
