import { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Screen } from '../components/ui';
import { storage } from '../lib/storage';
import { colors } from '../lib/theme';
import { saveSeat } from '../net/seats';
import { request, SERVER_URL } from '../net/socket';
import { useOnline } from '../net/useOnline';

const NAME_KEY = 'display_name';

export default function Home() {
  const [name, setName] = useState('Player');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const online = useOnline();

  // The name is the only thing worth remembering between launches.
  useEffect(() => {
    void storage.get(NAME_KEY).then((saved) => saved && setName(saved));
  }, []);
  const displayName = name.trim() || 'Player';
  const rememberName = () => void storage.set(NAME_KEY, displayName);

  const join = async () => {
    setBusy(true);
    setError(null);
    rememberName();
    try {
      const res = await request('join_game', { gameId: code.trim().toUpperCase(), displayName });
      if (!res.ok) return setError(res.message);
      await saveSeat(res.data);
      router.push({ pathname: '/game/[id]', params: { id: res.data.gameId, joined: '1' } });
    } finally {
      setBusy(false);
    }
  };

  const canJoin = online && !busy && code.trim().length >= 4;
  return (
    <Screen scroll>
      <Text style={styles.tagline}>Pick two moves. Flip a coin. Live with it.</Text>

      <Text style={styles.label}>Your name</Text>
      <TextInput value={name} onChangeText={setName} onBlur={rememberName} maxLength={32} style={styles.input} placeholderTextColor={colors.textMuted} accessibilityLabel="Your name" />

      <Button
        label="New game"
        size="lg"
        onPress={() => {
          rememberName();
          router.push({ pathname: '/new-game', params: { name: displayName } });
        }}
      />

      <View style={styles.section}>
        <Text style={styles.label}>
          Join a friend {online ? '●' : '○'} <Text style={styles.muted}>{online ? 'connected' : `connecting to ${SERVER_URL}`}</Text>
        </Text>
        <View style={styles.joinRow}>
          <TextInput
            value={code}
            onChangeText={setCode}
            placeholder="CODE"
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={6}
            style={[styles.input, styles.codeInput]}
            placeholderTextColor={colors.textMuted}
            onSubmitEditing={() => canJoin && void join()}
            accessibilityLabel="Game code"
          />
          <Button label="Join" variant="secondary" onPress={() => void join()} disabled={!canJoin} loading={busy} />
        </View>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}
      <Text style={styles.footer}>Online tosses are provably fair: every coin can be verified on your device.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  tagline: { color: colors.text, fontSize: 18, fontWeight: '700', marginBottom: 8 },
  section: { gap: 10, marginTop: 16 },
  label: { color: colors.text, fontWeight: '600' },
  muted: { color: colors.textMuted, fontWeight: '400', fontSize: 12 },
  input: {
    backgroundColor: colors.surface,
    color: colors.text,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  joinRow: { flexDirection: 'row', gap: 10 },
  codeInput: { flex: 1, letterSpacing: 4, fontWeight: '700' },
  error: { color: colors.danger },
  footer: { color: colors.textMuted, fontSize: 12, textAlign: 'center', marginTop: 24 },
});
