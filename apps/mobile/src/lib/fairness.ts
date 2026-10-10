import { getRandomBytes } from 'expo-crypto';

/** 16 random bytes (hex): this player's entropy in a commit-reveal toss. */
export function newClientSeed(): string {
  return Array.from(getRandomBytes(16), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** First and last few hex characters, for compact display. */
export const shortHash = (hex: string | undefined, n = 6) => (hex ? `${hex.slice(0, n)}…${hex.slice(-4)}` : '—');
