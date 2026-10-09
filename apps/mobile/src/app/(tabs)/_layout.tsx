import { Text, type ColorValue } from 'react-native';
import { Tabs } from 'expo-router';
import { colors } from '../../lib/theme';

const icon = (glyph: string) =>
  function TabIcon({ color }: { color: ColorValue }) {
    return <Text style={{ color, fontSize: 20 }}>{glyph}</Text>;
  };

/** The casino's four rooms. Each tab draws its own header so the balance pill can sit in it. */
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.slotA,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontWeight: '700' },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Casino', tabBarIcon: icon('♛') }} />
      <Tabs.Screen name="sportsbook" options={{ title: 'Sportsbook', tabBarIcon: icon('◉') }} />
      <Tabs.Screen name="wallet" options={{ title: 'Wallet', tabBarIcon: icon('◎') }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: icon('☺') }} />
    </Tabs>
  );
}
