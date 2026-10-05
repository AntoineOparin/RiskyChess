import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import type { GameMode } from '@gamble/shared';
import { saveSeat } from '../net/seats';
import { getSocket, request, SERVER_URL } from '../net/socket';
import { colors } from '../lib/theme';

export default function Home() {
  const [name, setName] = useState('Player');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState(getSocket().connected);

  useEffect(() => {
    const socket = getSocket();
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    socket.on('connect', up);
    socket.on('disconnect', down);
    return () => {
      socket.off('connect', up);
      socket.off('disconnect', down);
    };
  }, []);

  const displayName = name.trim() || 'Player';

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  const create = (mode: GameMode) =>
    run(async () => {
      const res = await request('create_game', { mode, displayName, color: 'random' });
      if (!res.ok) return setError(res.message);
      await saveSeat(res.data);
      router.push({ pathname: '/game/[id]', params: { id: res.data.gameId } });
    });

  const join = () =>
    run(async () => {
      const res = await request('join_game', { gameId: code.trim().toUpperCase(), displayName });
      if (!res.ok) return setError(res.message);
      await saveSeat(res.data);
      router.push({ pathname: '/game/[id]', params: { id: res.data.gameId } });
    });

  return (
    <View style={styles.container}>
      <Text style={styles.tagline}>Pick two moves. Flip a coin. Live with it.</Text>

      <Text style={styles.label}>Your name</Text>
      <TextInput value={name} onChangeText={setName} maxLength={32} style={styles.input} placeholderTextColor={colors.textMuted} />

      <Button label="Play offline vs bot" onPress={() => router.push('/local')} />

      <View style={styles.section}>
        <Text style={styles.label}>
          Online {online ? '●' : '○'} <Text style={styles.muted}>{online ? 'connected' : `connecting to ${SERVER_URL}`}</Text>
        </Text>
        <Button label="Play online vs bot" onPress={() => create('bot')} disabled={!online || busy} />
        <Button label="Create game for a friend" onPress={() => create('pvp')} disabled={!online || busy} />
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
          <Button label="Join" onPress={join} disabled={!online || busy || code.trim().length < 4} />
        </View>
      </View>

      {busy && <ActivityIndicator color={colors.slotA} />}
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

function Button({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[styles.button, disabled && styles.disabled]}>
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
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
  joinRow: { flexDirection: 'row', gap: 10 },
  codeInput: { flex: 1, letterSpacing: 4, fontWeight: '700' },
  button: { backgroundColor: colors.surfaceRaised, borderRadius: 10, paddingVertical: 14, paddingHorizontal: 16, alignItems: 'center' },
  buttonText: { color: colors.text, fontWeight: '700', fontSize: 16 },
  disabled: { opacity: 0.4 },
  error: { color: colors.danger },
});
