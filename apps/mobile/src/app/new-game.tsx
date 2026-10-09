import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { MODE_PRESETS, type GameMode, type ModeId, type ModePreset } from '@risky-chess/shared';
import { ModeCard } from '../components/ModeCard';
import { activeUi, registry, UI_ORDER } from '../modes/registry';
import { request } from '../net/socket';
import { colors } from '../lib/theme';
import { useOnline } from '../net/useOnline';

const CLASSIC_PITCH = 'Pick two moves, flip a fair coin. No chips.';

function presetCard(p: ModePreset): { pitch: string; risk: 0 | 1 | 2 | 3; bullets: readonly string[] } {
  if (p.id === 'classic') return { pitch: CLASSIC_PITCH, risk: 0, bullets: [] };
  if (p.id === 'high_roller') return { pitch: 'Every mode at once. Big swings.', risk: 3, bullets: activeUi(p.modes).map(([, ui]) => `${ui.title}: ${ui.pitch}`) };
  const ui = registry[p.id];
  return { pitch: ui.pitch, risk: ui.risk, bullets: ui.bullets };
}

const sameModes = (a: readonly ModeId[], b: readonly ModeId[]) => a.length === b.length && a.every((m) => b.includes(m));

/** Two steps, one decision each: the table's modes, then who to play. */
export default function NewGame() {
  const { name } = useLocalSearchParams<{ name?: string }>();
  const displayName = (name ?? '').trim() || 'Player';
  const online = useOnline();
  const [step, setStep] = useState<1 | 2>(1);
  const [modes, setModes] = useState<ModeId[]>([]);
  const [advanced, setAdvanced] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const presets = MODE_PRESETS.filter((p) => p.id !== 'high_roller');
  const highRoller = MODE_PRESETS.find((p) => p.id === 'high_roller')!;
  const toggle = (id: ModeId, on: boolean) => setModes((m) => (on ? UI_ORDER.filter((x) => x === id || m.includes(x)) : m.filter((x) => x !== id)));

  const createOnline = async (mode: GameMode) => {
    setBusy(true);
    setError(null);
    try {
      const res = await request('create_game', { mode, displayName, color: 'random', rules: { modes } });
      if (!res.ok) return setError(res.message);
      router.replace({ pathname: '/game/[id]', params: { id: res.data.gameId } });
    } finally {
      setBusy(false);
    }
  };

  if (step === 2) {
    const summary = modes.length ? activeUi(modes).map(([, ui]) => ui.title).join(' + ') : 'Classic';
    return (
      <View style={styles.container}>
        <Text style={styles.step}>Step 2 of 2</Text>
        <Text style={styles.heading}>Who are you playing?</Text>
        <Text style={styles.muted}>Table: {summary}</Text>
        <Choice label="Offline vs bot" sub="No connection needed" onPress={() => router.replace({ pathname: '/local', params: { modes: modes.join(',') } })} />
        <Choice label="Online vs bot" sub={online ? 'Server tosses, provably fair' : 'Connecting…'} disabled={!online || busy} onPress={() => void createOnline('bot')} />
        <Choice label="Invite a friend" sub={online ? 'Get a code to share' : 'Connecting…'} disabled={!online || busy} onPress={() => void createOnline('pvp')} />
        {busy && <ActivityIndicator color={colors.slotA} />}
        {error && <Text style={styles.error}>{error}</Text>}
        <Pressable onPress={() => setStep(1)} style={styles.back} accessibilityRole="button">
          <Text style={styles.backText}>‹ Change modes</Text>
        </Pressable>
        <Footer />
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.container}>
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
              <View style={styles.flex}>
                <Text style={styles.label}>{registry[id].title}</Text>
                <Text style={styles.muted}>{registry[id].pitch}</Text>
              </View>
              <Switch value={modes.includes(id)} onValueChange={(on) => toggle(id, on)} accessibilityLabel={registry[id].title} />
            </View>
          ))}
        <Footer />
      </ScrollView>
      <View style={styles.bottom}>
        <Pressable onPress={() => setStep(2)} style={styles.primary} accessibilityRole="button">
          <Text style={styles.primaryText}>Next</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Choice({ label, sub, onPress, disabled }: { label: string; sub: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[styles.choice, disabled && styles.disabled]} accessibilityRole="button">
      <Text style={styles.choiceText}>{label}</Text>
      <Text style={styles.muted}>{sub}</Text>
    </Pressable>
  );
}

function Footer() {
  return <Text style={styles.footer}>Chips are play money. No real-money wagering.</Text>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { padding: 16, gap: 12 },
  step: { color: colors.textMuted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  heading: { color: colors.text, fontSize: 22, fontWeight: '800' },
  label: { color: colors.text, fontWeight: '700' },
  muted: { color: colors.textMuted, fontSize: 13 },
  advRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: 12, padding: 12 },
  choice: { backgroundColor: colors.surfaceRaised, borderRadius: 12, padding: 16, gap: 2 },
  choiceText: { color: colors.text, fontWeight: '800', fontSize: 17 },
  disabled: { opacity: 0.4 },
  error: { color: colors.danger },
  back: { padding: 8, alignSelf: 'flex-start' },
  backText: { color: colors.slotB, fontWeight: '700' },
  footer: { color: colors.textMuted, fontSize: 12, textAlign: 'center', marginTop: 12 },
  bottom: { padding: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  primary: { backgroundColor: colors.slotA, borderRadius: 12, minHeight: 56, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#111', fontWeight: '800', fontSize: 17 },
});
