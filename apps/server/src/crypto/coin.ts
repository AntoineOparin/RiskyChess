import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { commitmentOf, hmacRng, type Rng } from '@risky-chess/engine';

/** CSPRNG-backed rng: the only source of randomness for authoritative tosses. */
export const cryptoRng: Rng = { int: (maxExclusive) => randomInt(0, maxExclusive) };

export const newId = (): string => randomUUID();
/** Short, human-shareable game code (no ambiguous characters). */
export function newGameCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => alphabet[randomInt(0, alphabet.length)]).join('');
}
export const newToken = (): string => randomBytes(24).toString('base64url');

/** A fresh 32-byte server seed (hex) and its public commitment. */
export function newServerSeed(): { seed: string; commitment: string } {
  const seed = randomBytes(32).toString('hex');
  return { seed, commitment: commitmentOf(seed) };
}

/** Entropy the server supplies when the mover sends none (the bot, older clients). */
export const newClientSeed = (): string => randomBytes(16).toString('hex');

/** The Rng whose single int(10000) is the committed HMAC roll for this turn. */
export const hmacRngFor = (serverSeed: string, gameId: string, turnNumber: number, clientSeed: string): Rng =>
  hmacRng(serverSeed, gameId, turnNumber, clientSeed);
