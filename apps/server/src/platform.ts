import { AuthService } from './auth/AuthService';
import { Archive } from './db/archive';
import { Bets } from './db/bets';
import { openDb, type Db } from './db/db';
import { Escrow } from './db/escrow';
import { Ledger } from './db/ledger';
import { Users } from './db/users';
import { Fairness } from './originals/Fairness';
import { WalletService } from './wallet/WalletService';

/** Everything backed by the database, wired once per process (or per test). */
export interface Services {
  db: Db;
  ledger: Ledger;
  users: Users;
  escrow: Escrow;
  archive: Archive;
  bets: Bets;
  fairness: Fairness;
  auth: AuthService;
  wallet: WalletService;
}

export function createServices(db: Db = openDb()): Services {
  const ledger = new Ledger(db);
  const users = new Users(db);
  const escrow = new Escrow(db);
  const fairness = new Fairness(db, users);
  return {
    db,
    ledger,
    users,
    escrow,
    archive: new Archive(db),
    bets: new Bets(db),
    fairness,
    auth: new AuthService(db, users, ledger, fairness),
    wallet: new WalletService(db, ledger, escrow),
  };
}
