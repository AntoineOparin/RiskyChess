/** Ordered, append-only. Never edit an applied migration; add a new one. */
export const MIGRATIONS: readonly { id: number; sql: string }[] = [
  {
    id: 1,
    sql: `
      CREATE TABLE users (
        id            TEXT PRIMARY KEY,
        username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
        token_hash    TEXT NOT NULL UNIQUE,
        balance_cents INTEGER NOT NULL DEFAULT 0 CHECK (balance_cents >= 0),
        created_at    INTEGER NOT NULL
      );
      -- The house: rake, edges and payouts flow through it so the sum of all balances is conserved.
      INSERT INTO users (id, username, token_hash, balance_cents, created_at) VALUES ('house', 'house', 'house', 0, 0);

      CREATE TABLE transactions (
        id            TEXT PRIMARY KEY,
        user_id       TEXT NOT NULL REFERENCES users(id),
        kind          TEXT NOT NULL,
        amount_cents  INTEGER NOT NULL,
        balance_after INTEGER NOT NULL,
        ref_type      TEXT,
        ref_id        TEXT,
        idem_key      TEXT NOT NULL UNIQUE,
        created_at    INTEGER NOT NULL
      );
      CREATE INDEX transactions_user ON transactions (user_id, created_at DESC);

      CREATE TABLE escrow (
        game_id      TEXT NOT NULL,
        user_id      TEXT NOT NULL REFERENCES users(id),
        amount_cents INTEGER NOT NULL,
        status       TEXT NOT NULL CHECK (status IN ('held', 'settled', 'refunded')),
        created_at   INTEGER NOT NULL,
        PRIMARY KEY (game_id, user_id)
      );

      CREATE TABLE games (
        id              TEXT PRIMARY KEY,
        mode            TEXT NOT NULL,
        rules_json      TEXT NOT NULL,
        buy_in_cents    INTEGER NOT NULL,
        visibility      TEXT NOT NULL,
        w_user_id       TEXT,
        b_user_id       TEXT,
        w_name          TEXT NOT NULL,
        b_name          TEXT NOT NULL,
        outcome_json    TEXT NOT NULL,
        settlement_json TEXT,
        session_json    TEXT NOT NULL,
        plies           INTEGER NOT NULL,
        finished_at     INTEGER NOT NULL
      );
      CREATE INDEX games_w ON games (w_user_id, finished_at DESC);
      CREATE INDEX games_b ON games (b_user_id, finished_at DESC);

      CREATE TABLE match_bets (
        id           TEXT PRIMARY KEY,
        game_id      TEXT NOT NULL,
        user_id      TEXT NOT NULL REFERENCES users(id),
        side         TEXT NOT NULL CHECK (side IN ('w', 'b', 'd')),
        stake_cents  INTEGER NOT NULL,
        odds_x100    INTEGER NOT NULL,
        status       TEXT NOT NULL CHECK (status IN ('open', 'won', 'lost', 'void')),
        payout_cents INTEGER NOT NULL DEFAULT 0,
        idem_key     TEXT NOT NULL UNIQUE,
        placed_at    INTEGER NOT NULL,
        settled_at   INTEGER
      );
      CREATE INDEX match_bets_game ON match_bets (game_id, status);
      CREATE INDEX match_bets_user ON match_bets (user_id, placed_at DESC);

      CREATE TABLE seeds (
        user_id          TEXT PRIMARY KEY REFERENCES users(id),
        server_seed      TEXT NOT NULL,
        server_seed_hash TEXT NOT NULL,
        client_seed      TEXT NOT NULL,
        nonce            INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE seed_history (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id          TEXT NOT NULL REFERENCES users(id),
        server_seed      TEXT NOT NULL,
        server_seed_hash TEXT NOT NULL,
        client_seed      TEXT NOT NULL,
        rounds           INTEGER NOT NULL,
        retired_at       INTEGER NOT NULL
      );

      CREATE TABLE original_rounds (
        id               TEXT PRIMARY KEY,
        user_id          TEXT NOT NULL REFERENCES users(id),
        game             TEXT NOT NULL CHECK (game IN ('coin_duel', 'puzzle')),
        server_seed_hash TEXT NOT NULL,
        client_seed      TEXT NOT NULL,
        nonce            INTEGER NOT NULL,
        stake_cents      INTEGER NOT NULL DEFAULT 0,
        payout_cents     INTEGER NOT NULL DEFAULT 0,
        status           TEXT NOT NULL CHECK (status IN ('open', 'won', 'lost', 'void')),
        state_json       TEXT NOT NULL,
        created_at       INTEGER NOT NULL,
        settled_at       INTEGER
      );
      CREATE INDEX original_rounds_user ON original_rounds (user_id, created_at DESC);

      CREATE TABLE feed (
        id           TEXT PRIMARY KEY,
        user_id      TEXT NOT NULL,
        username     TEXT NOT NULL,
        game         TEXT NOT NULL,
        stake_cents  INTEGER NOT NULL,
        payout_cents INTEGER NOT NULL,
        at           INTEGER NOT NULL
      );
      CREATE INDEX feed_at ON feed (at DESC);
    `,
  },
];
