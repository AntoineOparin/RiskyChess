import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { initSfx } from '../lib/sfx';
import { colors } from '../lib/theme';

// Load every sound effect once, before any screen needs one.
initSfx();

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.text,
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="index" options={{ title: 'Risky Chess' }} />
        <Stack.Screen name="local" options={{ title: 'Offline vs Bot' }} />
        <Stack.Screen name="game/[id]" options={{ title: 'Online Game' }} />
      </Stack>
    </>
  );
}
