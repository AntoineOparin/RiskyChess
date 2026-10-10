import * as SecureStore from 'expo-secure-store';

/**
 * Small persistent key/value store for credentials and preferences. Native
 * builds use the keychain / keystore; `storage.web.ts` swaps in localStorage.
 */
export const storage = {
  get: (key: string): Promise<string | null> => SecureStore.getItemAsync(key),
  set: (key: string, value: string): Promise<void> => SecureStore.setItemAsync(key, value),
  remove: (key: string): Promise<void> => SecureStore.deleteItemAsync(key),
};
