import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { colors } from '../lib/theme';

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
        <Stack.Screen name="index" options={{ title: 'Gamble Chess' }} />
        <Stack.Screen name="local" options={{ title: 'Offline vs Bot' }} />
        <Stack.Screen name="game/[id]" options={{ title: 'Online Game' }} />
      </Stack>
    </>
  );
}
