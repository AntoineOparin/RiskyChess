import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { initSfx } from '../lib/sfx';
import { colors } from '../lib/theme';
import { usePresence } from '../net/presence';
import { useAuthStore } from '../state/authStore';

// Load every sound effect once, before any screen needs one.
initSfx();

export default function RootLayout() {
  const hydrated = useAuthStore((s) => s.hydrated);
  const token = useAuthStore((s) => s.token);
  useEffect(() => {
    void useAuthStore.getState().hydrate();
  }, []);
  usePresence();

  if (!hydrated) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.slotA} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.text,
          headerTitleStyle: { fontWeight: '800' },
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Protected guard={!token}>
          <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Protected guard={!!token}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="new-table" options={{ title: 'New table' }} />
          <Stack.Screen name="local" options={{ title: 'Practice vs bot' }} />
          <Stack.Screen name="game/[id]/index" options={{ title: 'Table' }} />
          <Stack.Screen name="game/[id]/fairness" options={{ title: 'Fairness' }} />
          <Stack.Screen name="watch/[id]" options={{ title: 'Live' }} />
          <Stack.Screen name="originals/coin-duel" options={{ title: 'Coin Duel' }} />
          <Stack.Screen name="originals/puzzle" options={{ title: 'Blitz Puzzle' }} />
          <Stack.Screen name="history" options={{ title: 'History' }} />
          <Stack.Screen name="fairness/seeds" options={{ title: 'Provably fair' }} />
        </Stack.Protected>
      </Stack>
    </>
  );
}
