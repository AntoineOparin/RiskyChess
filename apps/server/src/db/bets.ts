import type { MatchBet, MatchBetStatus, MatchSide, OriginalGame, OriginalRoundSummary, RoundStatus } from '@risky-chess/shared';
import type { Db } from './db';

interface MatchBetRow {
  id: string;
  game_id: string;
  user_id: string;
  side: MatchSide;
  stake_cents: number;
  odds_x100: number;
  status: MatchBetStatus;
  payout_cents: number;
  placed_at: number;
  settled_at: number | null;
}

const toBet = (r: MatchBetRow): MatchBet & { userId: string } => ({
  id: r.id,
  gameId: r.game_id,
  userId: r.user_id,
  side: r.side,
  stakeCents: r.stake_cents,
  oddsX100: r.odds_x100,
  status: r.status,
  payoutCents: r.payout_cents,
  placedAt: r.placed_at,
  ...(r.settled_at !== null ? { settledAt: r.settled_at } : {}),
});

const BET_COLS = 'id, game_id, user_id, side, stake_cents, odds_x100, status, payout_cents, placed_at, settled_at';

/** Sportsbook bets and originals rounds. Money moves through the Ledger; these rows record what it was for. */
export class Bets {
  constructor(private readonly db: Db) {}

  // ---------- sportsbook ----------

  insertMatchBet(b: { id: string; gameId: string; userId: string; side: MatchSide; stakeCents: number; oddsX100: number; idemKey: string; placedAt: number }): void {
    this.db
      .prepare("INSERT INTO match_bets (id, game_id, user_id, side, stake_cents, odds_x100, status, payout_cents, idem_key, placed_at) VALUES (?, ?, ?, ?, ?, ?, 'open', 0, ?, ?)")
      .run(b.id, b.gameId, b.userId, b.side, b.stakeCents, b.oddsX100, b.idemKey, b.placedAt);
  }

  matchBetByIdem(idemKey: string): (MatchBet & { userId: string }) | null {
    const r = this.db.prepare(`SELECT ${BET_COLS} FROM match_bets WHERE idem_key = ?`).get(idemKey) as MatchBetRow | undefined;
    return r ? toBet(r) : null;
  }

  openMatchBets(gameId: string): (MatchBet & { userId: string })[] {
    const rows = this.db.prepare(`SELECT ${BET_COLS} FROM match_bets WHERE game_id = ? AND status = 'open'`).all(gameId) as unknown as MatchBetRow[];
    return rows.map(toBet);
  }

  /** Open stake one account holds on one game. */
  exposure(gameId: string, userId: string): number {
    const r = this.db.prepare("SELECT COALESCE(SUM(stake_cents), 0) AS s FROM match_bets WHERE game_id = ? AND user_id = ? AND status = 'open'").get(gameId, userId) as { s: number };
    return r.s;
  }

  handle(gameId: string): number {
    const r = this.db.prepare("SELECT COALESCE(SUM(stake_cents), 0) AS s FROM match_bets WHERE game_id = ? AND status = 'open'").get(gameId) as { s: number };
    return r.s;
  }

  settleMatchBet(id: string, status: Exclude<MatchBetStatus, 'open'>, payoutCents: number, settledAt: number): boolean {
    return this.db.prepare("UPDATE match_bets SET status = ?, payout_cents = ?, settled_at = ? WHERE id = ? AND status = 'open'").run(status, payoutCents, settledAt, id).changes > 0;
  }

  matchBetsOf(userId: string, opts: { gameId?: string; limit?: number } = {}): MatchBet[] {
    const rows = (
      opts.gameId
        ? this.db.prepare(`SELECT ${BET_COLS} FROM match_bets WHERE user_id = ? AND game_id = ? ORDER BY placed_at DESC LIMIT ?`).all(userId, opts.gameId, opts.limit ?? 50)
        : this.db.prepare(`SELECT ${BET_COLS} FROM match_bets WHERE user_id = ? ORDER BY placed_at DESC LIMIT ?`).all(userId, opts.limit ?? 50)
    ) as unknown as MatchBetRow[];
    return rows.map((r) => {
      const { userId: _u, ...bet } = toBet(r);
      return bet;
    });
  }

  // ---------- originals ----------

  insertRound<S>(r: { id: string; userId: string; game: OriginalGame; serverSeedHash: string; clientSeed: string; nonce: number; stakeCents: number; state: S; createdAt: number }): void {
    this.db
      .prepare(
        "INSERT INTO original_rounds (id, user_id, game, server_seed_hash, client_seed, nonce, stake_cents, payout_cents, status, state_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'open', ?, ?)",
      )
      .run(r.id, r.userId, r.game, r.serverSeedHash, r.clientSeed, r.nonce, r.stakeCents, JSON.stringify(r.state), r.createdAt);
  }

  round<S>(id: string): (OriginalRoundSummary & { userId: string; state: S }) | null {
    const r = this.db
      .prepare('SELECT id, user_id, game, server_seed_hash, client_seed, nonce, stake_cents, payout_cents, status, state_json, created_at FROM original_rounds WHERE id = ?')
      .get(id) as RoundRow | undefined;
    return r ? { ...toRound(r), state: JSON.parse(r.state_json) as S } : null;
  }

  /** Closes an open round; returns false when it was already settled. */
  settleRound<S>(id: string, status: Exclude<RoundStatus, 'open'>, p: { stakeCents?: number; payoutCents: number; state: S; settledAt: number }): boolean {
    return (
      this.db
        .prepare("UPDATE original_rounds SET status = ?, stake_cents = COALESCE(?, stake_cents), payout_cents = ?, state_json = ?, settled_at = ? WHERE id = ? AND status = 'open'")
        .run(status, p.stakeCents ?? null, p.payoutCents, JSON.stringify(p.state), p.settledAt, id).changes > 0
    );
  }

  roundsOf(userId: string, limit = 50): OriginalRoundSummary[] {
    const rows = this.db
      .prepare('SELECT id, user_id, game, server_seed_hash, client_seed, nonce, stake_cents, payout_cents, status, state_json, created_at FROM original_rounds WHERE user_id = ? ORDER BY created_at DESC LIMIT ?')
      .all(userId, limit) as unknown as RoundRow[];
    return rows.map((r) => {
      const { userId: _u, ...round } = toRound(r);
      return round;
    });
  }

  /** Rounds still open past their deadline (puzzle clocks lost to a restart). */
  openRounds(game: OriginalGame): (OriginalRoundSummary & { userId: string; state: unknown })[] {
    const rows = this.db
      .prepare("SELECT id, user_id, game, server_seed_hash, client_seed, nonce, stake_cents, payout_cents, status, state_json, created_at FROM original_rounds WHERE game = ? AND status = 'open'")
      .all(game) as unknown as RoundRow[];
    return rows.map((r) => ({ ...toRound(r), state: JSON.parse(r.state_json) as unknown }));
  }
}

interface RoundRow {
  id: string;
  user_id: string;
  game: OriginalGame;
  server_seed_hash: string;
  client_seed: string;
  nonce: number;
  stake_cents: number;
  payout_cents: number;
  status: RoundStatus;
  state_json: string;
  created_at: number;
}

const toRound = (r: RoundRow): OriginalRoundSummary & { userId: string } => ({
  id: r.id,
  userId: r.user_id,
  game: r.game,
  serverSeedHash: r.server_seed_hash,
  clientSeed: r.client_seed,
  nonce: r.nonce,
  stakeCents: r.stake_cents,
  payoutCents: r.payout_cents,
  status: r.status,
  createdAt: r.created_at,
});
