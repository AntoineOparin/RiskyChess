import type { Color, FeedItem, GameSession, GameSummary } from '@risky-chess/shared';
import { newId } from '../crypto/coin';
import type { Db } from './db';

/** Finished games and the live wager feed. Live games stay in memory. */
export class Archive {
  constructor(private readonly db: Db) {}

  saveGame(s: GameSession, finishedAt = Date.now()): void {
    if (!s.outcome) throw new Error('Archive.saveGame: game is not over');
    this.db
      .prepare(
        `INSERT OR REPLACE INTO games (id, mode, rules_json, buy_in_cents, visibility, w_user_id, b_user_id, w_name, b_name, outcome_json, settlement_json, session_json, plies, finished_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        s.id,
        s.mode,
        JSON.stringify(s.rules),
        s.buyInCents,
        s.visibility,
        s.players.w?.userId ?? null,
        s.players.b?.userId ?? null,
        s.players.w?.displayName ?? '?',
        s.players.b?.displayName ?? '?',
        JSON.stringify(s.outcome),
        s.settlement ? JSON.stringify(s.settlement) : null,
        JSON.stringify(s),
        s.history.length,
        finishedAt,
      );
  }

  game(id: string): GameSession | null {
    const r = this.db.prepare('SELECT session_json FROM games WHERE id = ?').get(id) as { session_json: string } | undefined;
    return r ? (JSON.parse(r.session_json) as GameSession) : null;
  }

  /** A player's finished games, newest first. */
  gamesOf(userId: string, limit = 50): GameSummary[] {
    const rows = this.db
      .prepare(
        `SELECT id, rules_json, buy_in_cents, w_user_id, w_name, b_name, outcome_json, settlement_json, finished_at
         FROM games WHERE w_user_id = ? OR b_user_id = ? ORDER BY finished_at DESC LIMIT ?`,
      )
      .all(userId, userId, limit) as unknown as {
      id: string;
      rules_json: string;
      buy_in_cents: number;
      w_user_id: string | null;
      w_name: string;
      b_name: string;
      outcome_json: string;
      settlement_json: string | null;
      finished_at: number;
    }[];
    return rows.map((r) => {
      const color: Color = r.w_user_id === userId ? 'w' : 'b';
      const outcome = JSON.parse(r.outcome_json) as { winner?: Color };
      const settlement = r.settlement_json ? (JSON.parse(r.settlement_json) as { payouts: Record<Color, number> }) : null;
      return {
        gameId: r.id,
        color,
        opponent: color === 'w' ? r.b_name : r.w_name,
        modes: (JSON.parse(r.rules_json) as { modes: string[] }).modes,
        buyInCents: r.buy_in_cents,
        result: outcome.winner ? (outcome.winner === color ? 'win' : 'loss') : 'draw',
        payoutCents: settlement?.payouts[color] ?? 0,
        finishedAt: r.finished_at,
      };
    });
  }

  // ---------- live feed ----------

  pushFeed(item: Omit<FeedItem, 'id'> & { userId: string }): FeedItem {
    const id = newId();
    this.db.prepare('INSERT INTO feed (id, user_id, username, game, stake_cents, payout_cents, at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, item.userId, item.username, item.game, item.stakeCents, item.payoutCents, item.at);
    return { id, username: item.username, game: item.game, stakeCents: item.stakeCents, payoutCents: item.payoutCents, at: item.at };
  }

  feed(limit = 30): FeedItem[] {
    const rows = this.db.prepare('SELECT id, username, game, stake_cents, payout_cents, at FROM feed ORDER BY at DESC LIMIT ?').all(limit) as unknown as {
      id: string;
      username: string;
      game: FeedItem['game'];
      stake_cents: number;
      payout_cents: number;
      at: number;
    }[];
    return rows.map((r) => ({ id: r.id, username: r.username, game: r.game, stakeCents: r.stake_cents, payoutCents: r.payout_cents, at: r.at }));
  }
}
