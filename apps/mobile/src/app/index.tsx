import { Redirect } from 'expo-router';
import { useAuthStore } from '../state/authStore';

/** Entry: accounts go to the casino, everyone else picks a name first. */
export default function Index() {
  const token = useAuthStore((s) => s.token);
  return <Redirect href={token ? '/(tabs)' : '/onboarding'} />;
}
