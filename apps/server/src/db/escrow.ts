import type { Db } from './db';

export type EscrowStatus = 'held' | 'settled' | 'refunded';

export interface EscrowRow {
  gameId: string;
  userId: string;
  amountCents: number;
  status: EscrowStatus;
}

/**
 * Where a buy-in sits between sitting down and the game ending. Live games
 * are in memory, so after a restart anything still `held` belongs to a game
 * that no longer exists and is refunded at boot.
 */
export class Escrow {
  constructor(private readonly db: Db) {}

  hold(gameId: string, userId: string, amountCents: number, now = Date.now()): void {
    this.db.prepare('INSERT OR IGNORE INTO escrow (game_id, user_id, amount_cents, status, created_at) VALUES (?, ?, ?, ?, ?)').run(gameId, userId, amountCents, 'held', now);
  }

  /** Flips a held row; returns false if it was already settled or refunded (or never held). */
  release(gameId: string, userId: string, status: Exclude<EscrowStatus, 'held'>): boolean {
    return this.db.prepare("UPDATE escrow SET status = ? WHERE game_id = ? AND user_id = ? AND status = 'held'").run(status, gameId, userId).changes > 0;
  }

  held(gameId: string): EscrowRow[] {
    return this.rows("SELECT game_id, user_id, amount_cents, status FROM escrow WHERE game_id = ? AND status = 'held'", [gameId]);
  }

  allHeld(): EscrowRow[] {
    return this.rows("SELECT game_id, user_id, amount_cents, status FROM escrow WHERE status = 'held'", []);
  }

  private rows(sql: string, args: (string | number)[]): EscrowRow[] {
    const rows = this.db.prepare(sql).all(...args) as unknown as { game_id: string; user_id: string; amount_cents: number; status: EscrowStatus }[];
    return rows.map((r) => ({ gameId: r.game_id, userId: r.user_id, amountCents: r.amount_cents, status: r.status }));
  }
}
