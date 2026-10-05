import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { rngTosser, type Rng, type Tosser } from '@gamble/engine';

/** CSPRNG-backed rng: the only source of randomness for authoritative tosses. */
export const cryptoRng: Rng = { int: (maxExclusive) => randomInt(0, maxExclusive) };

export const cryptoTosser: Tosser = rngTosser(cryptoRng, 'crypto.randomInt');

export const newId = (): string => randomUUID();
/** Short, human-shareable game code (no ambiguous characters). */
export function newGameCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => alphabet[randomInt(0, alphabet.length)]).join('');
}
export const newToken = (): string => randomBytes(24).toString('base64url');
