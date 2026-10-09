import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { SIGNUP_BONUS_CENTS, USERNAME, formatCents, type User } from '@risky-chess/shared';
import { Button, Screen } from '../components/ui';
import { colors, type as t } from '../lib/theme';
import { api, ApiError } from '../net/api';
import { useAuthStore } from '../state/authStore';
import { useWalletStore } from '../state/walletStore';

/** First launch: pick a name, get a bankroll of play money. No password, no email. */
export default function Onboarding() {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = name.trim().length >= USERNAME.MIN && USERNAME.PATTERN.test(name.trim());

  const register = async () => {
    setBusy(true);
    setError(null);
    try {
      const out = await api<{ user: User; token: string }>('/auth/register', { body: { username: name.trim() }, token: null });
      await useAuthStore.getState().signIn(out);
      useWalletStore.getState().setBalance(out.user.balanceCents);
      router.replace('/(tabs)');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll safe="both">
      <View style={styles.hero}>
        <Text style={styles.wordmark}>RISKY CHESS</Text>
        <Text style={styles.tagline}>Pick two moves. Flip a coin. Bet on it.</Text>
      </View>
      <Text style={styles.label}>Choose a username</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        maxLength={USERNAME.MAX}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="e.g. knightmare"
        placeholderTextColor={colors.textMuted}
        style={styles.input}
        onSubmitEditing={() => valid && void register()}
        accessibilityLabel="Username"
      />
      <Text style={styles.hint}>
        {USERNAME.MIN}–{USERNAME.MAX} letters, digits or underscores. You start with {formatCents(SIGNUP_BONUS_CENTS)} of play chips.
      </Text>
      {error && <Text style={styles.error}>{error}</Text>}
      <Button label="Enter the casino" onPress={() => void register()} disabled={!valid} loading={busy} size="lg" />
      <Text style={styles.footer}>Chips are play money. No real-money wagering, ever.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: 6, marginTop: 48, marginBottom: 32 },
  wordmark: { color: colors.slotA, fontSize: 30, fontWeight: '900', letterSpacing: 4 },
  tagline: { color: colors.textMuted, fontSize: t.body },
  label: { color: colors.text, fontWeight: '700', marginBottom: 8 },
  input: { backgroundColor: colors.surface, color: colors.text, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14, fontSize: 18, fontWeight: '700' },
  hint: { color: colors.textMuted, fontSize: t.small, marginTop: 8, marginBottom: 20, lineHeight: 18 },
  error: { color: colors.danger, marginBottom: 12 },
  footer: { color: colors.textMuted, fontSize: t.tiny, textAlign: 'center', marginTop: 24 },
});
