import type { LeaderboardRow, RevealedSeedPair, SeedPair, User, UserStats } from '@risky-chess/shared';
import type { Db } from './db';
import { HOUSE_USER_ID } from './ledger';

interface UserRow {
  id: string;
  username: string;
  balance_cents: number;
  created_at: number;
}

const toUser = (r: UserRow): User => ({ id: r.id, username: r.username, balanceCents: r.balance_cents, createdAt: r.created_at });

export class Users {
  constructor(private readonly db: Db) {}

  create(u: { id: string; username: string; tokenHash: string; now: number }): User {
    this.db.prepare('INSERT INTO users (id, username, token_hash, balance_cents, created_at) VALUES (?, ?, ?, 0, ?)').run(u.id, u.username, u.tokenHash, u.now);
    return this.byId(u.id)!;
  }

  byId(id: string): User | null {
    const r = this.db.prepare('SELECT id, username, balance_cents, created_at FROM users WHERE id = ?').get(id) as UserRow | undefined;
    return r ? toUser(r) : null;
  }

  byTokenHash(tokenHash: string): User | null {
    const r = this.db.prepare('SELECT id, username, balance_cents, created_at FROM users WHERE token_hash = ?').get(tokenHash) as UserRow | undefined;
    return r ? toUser(r) : null;
  }

  usernameTaken(username: string): boolean {
    return !!this.db.prepare('SELECT 1 FROM users WHERE username = ? COLLATE NOCASE').get(username);
  }

  /** Lifetime table and betting results, from the ledger. */
  stats(userId: string): UserStats {
    const games = this.db
      .prepare(
        `SELECT
           COUNT(*) AS games,
           SUM(CASE WHEN json_extract(outcome_json, '$.winner') = CASE WHEN w_user_id = ? THEN 'w' ELSE 'b' END THEN 1 ELSE 0 END) AS wins,
           SUM(CASE WHEN json_extract(outcome_json, '$.winner') IS NULL THEN 1 ELSE 0 END) AS draws
         FROM games WHERE w_user_id = ? OR b_user_id = ?`,
      )
      .get(userId, userId, userId) as { games: number; wins: number | null; draws: number | null };
    const net = this.db
      .prepare(
        `SELECT
           COALESCE(SUM(CASE WHEN kind IN ('buy_in', 'refund', 'cashout') THEN amount_cents ELSE 0 END), 0) AS table_net,
           COALESCE(SUM(CASE WHEN kind IN ('bet_stake', 'bet_payout', 'bet_refund', 'original_stake', 'original_payout') THEN amount_cents ELSE 0 END), 0) AS bet_net
         FROM transactions WHERE user_id = ?`,
      )
      .get(userId) as { table_net: number; bet_net: number };
    const wins = games.wins ?? 0;
    const draws = games.draws ?? 0;
    return { games: games.games, wins, draws, losses: games.games - wins - draws, tableNetCents: net.table_net, betNetCents: net.bet_net };
  }

  /** Accounts ranked by lifetime net result (everything but deposits, withdrawals and the signup bonus). */
  leaderboard(limit = 20): LeaderboardRow[] {
    const rows = this.db
      .prepare(
        `SELECT u.id, u.username,
           COALESCE((SELECT SUM(amount_cents) FROM transactions t WHERE t.user_id = u.id AND t.kind NOT IN ('deposit', 'withdraw', 'bonus')), 0) AS net,
           (SELECT COUNT(*) FROM games g WHERE g.w_user_id = u.id OR g.b_user_id = u.id) AS games
         FROM users u WHERE u.id != ? ORDER BY net DESC, games DESC LIMIT ?`,
      )
      .all(HOUSE_USER_ID, limit) as unknown as { id: string; username: string; net: number; games: number }[];
    return rows.map((r) => ({ userId: r.id, username: r.username, netCents: r.net, games: r.games }));
  }

  // ---------- seed pairs (originals) ----------

  seedPair(userId: string): (SeedPair & { serverSeed: string }) | null {
    const r = this.db.prepare('SELECT server_seed, server_seed_hash, client_seed, nonce FROM seeds WHERE user_id = ?').get(userId) as
      | { server_seed: string; server_seed_hash: string; client_seed: string; nonce: number }
      | undefined;
    return r ? { serverSeed: r.server_seed, serverSeedHash: r.server_seed_hash, clientSeed: r.client_seed, nonce: r.nonce } : null;
  }

  setSeedPair(userId: string, p: { serverSeed: string; serverSeedHash: string; clientSeed: string }): void {
    this.db
      .prepare('INSERT OR REPLACE INTO seeds (user_id, server_seed, server_seed_hash, client_seed, nonce) VALUES (?, ?, ?, ?, 0)')
      .run(userId, p.serverSeed, p.serverSeedHash, p.clientSeed);
  }

  setClientSeed(userId: string, clientSeed: string): void {
    this.db.prepare('UPDATE seeds SET client_seed = ? WHERE user_id = ?').run(clientSeed, userId);
  }

  /** Reserves the next nonce for a round and returns it. */
  nextNonce(userId: string): number {
    const r = this.db.prepare('UPDATE seeds SET nonce = nonce + 1 WHERE user_id = ? RETURNING nonce - 1 AS nonce').get(userId) as { nonce: number } | undefined;
    if (!r) throw new Error(`No seed pair for ${userId}`);
    return r.nonce;
  }

  retireSeedPair(userId: string, retiredAt: number): void {
    const cur = this.seedPair(userId);
    if (!cur) return;
    this.db
      .prepare('INSERT INTO seed_history (user_id, server_seed, server_seed_hash, client_seed, rounds, retired_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(userId, cur.serverSeed, cur.serverSeedHash, cur.clientSeed, cur.nonce, retiredAt);
  }

  seedHistory(userId: string, limit = 20): RevealedSeedPair[] {
    const rows = this.db
      .prepare('SELECT server_seed, server_seed_hash, client_seed, rounds, retired_at FROM seed_history WHERE user_id = ? ORDER BY id DESC LIMIT ?')
      .all(userId, limit) as unknown as { server_seed: string; server_seed_hash: string; client_seed: string; rounds: number; retired_at: number }[];
    return rows.map((r) => ({ serverSeed: r.server_seed, serverSeedHash: r.server_seed_hash, clientSeed: r.client_seed, rounds: r.rounds, retiredAt: r.retired_at }));
  }
}
