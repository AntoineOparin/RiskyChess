import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { MIGRATIONS } from './migrations';

export type Db = DatabaseSync;

/**
 * Opens (or creates) the platform database and brings it up to date.
 * Tests pass ':memory:'. node:sqlite is synchronous, which is exactly what
 * the game loop wants: a turn, a bet and its ledger rows commit as one
 * critical section with no interleaving.
 */
export function openDb(path = ':memory:'): Db {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  migrate(db);
  return db;
}

function migrate(db: Db): void {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (id INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)');
  const applied = new Set(db.prepare('SELECT id FROM schema_migrations').all().map((r) => Number((r as { id: number }).id)));
  for (const m of MIGRATIONS) {
    if (applied.has(m.id)) continue;
    tx(db, () => {
      db.exec(m.sql);
      db.prepare('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)').run(m.id, Date.now());
    });
  }
}

let depth = 0;
/**
 * Runs `fn` atomically. Savepoints nest, so a ledger post inside a game
 * settlement inside a turn all commit or roll back together.
 */
export function tx<T>(db: Db, fn: () => T): T {
  const name = `sp${depth++}`;
  db.exec(`SAVEPOINT ${name}`);
  try {
    const out = fn();
    db.exec(`RELEASE ${name}`);
    return out;
  } catch (e) {
    db.exec(`ROLLBACK TO ${name}`);
    db.exec(`RELEASE ${name}`);
    throw e;
  } finally {
    depth--;
  }
}
