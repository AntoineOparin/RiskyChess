import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { request, SERVER_URL } from '../net/socket';
import { useOnline } from '../net/useOnline';
import { colors } from '../lib/theme';

export default function Home() {
  const [name, setName] = useState('Player');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const online = useOnline();

  const displayName = name.trim() || 'Player';

  const join = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await request('join_game', { gameId: code.trim().toUpperCase(), displayName });
      if (!res.ok) return setError(res.message);
      router.push({ pathname: '/game/[id]', params: { id: res.data.gameId, joined: '1' } });
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.tagline}>Pick two moves. Flip a coin. Live with it.</Text>

      <Text style={styles.label}>Your name</Text>
      <TextInput value={name} onChangeText={setName} maxLength={32} style={styles.input} placeholderTextColor={colors.textMuted} />

      <Pressable onPress={() => router.push({ pathname: '/new-game', params: { name: displayName } })} style={styles.primary} accessibilityRole="button">
        <Text style={styles.primaryText}>New game</Text>
      </Pressable>

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
            maxLength={6}
            style={[styles.input, styles.codeInput]}
            placeholderTextColor={colors.textMuted}
          />
          <Pressable
            onPress={() => void join()}
            disabled={!online || busy || code.trim().length < 4}
            style={[styles.button, (!online || busy || code.trim().length < 4) && styles.disabled]}
          >
            <Text style={styles.buttonText}>Join</Text>
          </Pressable>
        </View>
      </View>

      {busy && <ActivityIndicator color={colors.slotA} />}
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12 },
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
  primary: { backgroundColor: colors.slotA, borderRadius: 12, minHeight: 56, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  primaryText: { color: '#111', fontWeight: '800', fontSize: 17 },
  joinRow: { flexDirection: 'row', gap: 10 },
  codeInput: { flex: 1, letterSpacing: 4, fontWeight: '700' },
  button: { backgroundColor: colors.surfaceRaised, borderRadius: 10, paddingVertical: 14, paddingHorizontal: 16, alignItems: 'center' },
  buttonText: { color: colors.text, fontWeight: '700', fontSize: 16 },
  disabled: { opacity: 0.4 },
  error: { color: colors.danger },
});
