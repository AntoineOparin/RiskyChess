import { create } from 'zustand';
import type { User } from '@risky-chess/shared';
import { logger } from '../lib/log';
import { storage } from '../lib/storage';
import { setAuthToken } from '../net/socket';

const KEY = 'auth';
const log = logger('auth');

interface Stored {
  token: string;
  user: User;
}

interface AuthState {
  /** False until the stored credential has been read. */
  hydrated: boolean;
  token: string | null;
  user: User | null;
  hydrate(): Promise<void>;
  /** Stores a freshly registered account and connects the socket with it. */
  signIn(session: Stored): Promise<void>;
  setUser(user: User): void;
  signOut(): Promise<void>;
}

/** The device's account. One token per device; there is no password. */
export const useAuthStore = create<AuthState>()((set, get) => ({
  hydrated: false,
  token: null,
  user: null,

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const raw = await storage.get(KEY);
      const stored = raw ? (JSON.parse(raw) as Stored) : null;
      if (stored?.token) {
        set({ token: stored.token, user: stored.user });
        setAuthToken(stored.token);
      }
    } catch (e) {
      log.warn('could not read stored account', { error: String(e) });
    } finally {
      set({ hydrated: true });
    }
  },

  signIn: async (session) => {
    await storage.set(KEY, JSON.stringify(session));
    set({ token: session.token, user: session.user, hydrated: true });
    setAuthToken(session.token);
  },

  setUser: (user) => {
    set({ user });
    const { token } = get();
    if (token) void storage.set(KEY, JSON.stringify({ token, user }));
  },

  signOut: async () => {
    await storage.remove(KEY);
    set({ token: null, user: null });
    setAuthToken(null);
  },
}));
