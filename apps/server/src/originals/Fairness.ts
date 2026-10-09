import { rollFromMessage } from '@risky-chess/engine';
import type { RevealedSeedPair, SeedPair } from '@risky-chess/shared';
import { newClientSeed, newServerSeed } from '../crypto/coin';
import { tx, type Db } from '../db/db';
import type { Users } from '../db/users';

/** What round `nonce` of a pair hashes: the player's seed and the round counter. */
export const roundMessage = (clientSeed: string, nonce: number, tag?: string) => `${clientSeed}:${nonce}${tag ? `:${tag}` : ''}`;

/**
 * Stake-style provable fairness for the Originals. Each account has a seed
 * pair; the server seed stays secret until the pair is rotated, at which
 * point every round played on it can be re-derived by anyone.
 */
export class Fairness {
  constructor(
    private readonly db: Db,
    private readonly users: Users,
  ) {}

  ensureSeedPair(userId: string): void {
    if (this.users.seedPair(userId)) return;
    const { seed, commitment } = newServerSeed();
    this.users.setSeedPair(userId, { serverSeed: seed, serverSeedHash: commitment, clientSeed: newClientSeed().slice(0, 16) });
  }

  current(userId: string): SeedPair {
    this.ensureSeedPair(userId);
    const { serverSeed: _secret, ...pub } = this.users.seedPair(userId)!;
    return pub;
  }

  history(userId: string): RevealedSeedPair[] {
    return this.users.seedHistory(userId);
  }

  /** Retires the pair (revealing its server seed) and starts a fresh one with the same client seed. */
  rotate(userId: string, now = Date.now()): { current: SeedPair; history: RevealedSeedPair[] } {
    tx(this.db, () => {
      this.ensureSeedPair(userId);
      const old = this.users.seedPair(userId)!;
      this.users.retireSeedPair(userId, now);
      const { seed, commitment } = newServerSeed();
      this.users.setSeedPair(userId, { serverSeed: seed, serverSeedHash: commitment, clientSeed: old.clientSeed });
    });
    return { current: this.current(userId), history: this.history(userId) };
  }

  /** Changing the client seed also rotates, so a new seed never re-plays an old nonce under the old server seed. */
  setClientSeed(userId: string, clientSeed: string, now = Date.now()): { current: SeedPair; history: RevealedSeedPair[] } {
    tx(this.db, () => {
      this.rotate(userId, now);
      this.users.setClientSeed(userId, clientSeed);
    });
    return { current: this.current(userId), history: this.history(userId) };
  }

  /**
   * Reserves the next nonce and returns everything a round needs: the secret
   * (never sent), the public hash and client seed, and a roll function bound
   * to that nonce. `tag` derives extra rolls (e.g. the Coin Duel deal) from the
   * same commitment.
   */
  openRound(userId: string): { serverSeedHash: string; clientSeed: string; nonce: number; roll: (tag?: string) => number } {
    return tx(this.db, () => {
      this.ensureSeedPair(userId);
      const nonce = this.users.nextNonce(userId);
      const pair = this.users.seedPair(userId)!;
      return {
        serverSeedHash: pair.serverSeedHash,
        clientSeed: pair.clientSeed,
        nonce,
        roll: (tag?: string) => rollFromMessage(pair.serverSeed, roundMessage(pair.clientSeed, nonce, tag)),
      };
    });
  }
}
