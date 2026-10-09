import { createHash } from 'node:crypto';
import { SIGNUP_BONUS_CENTS, USERNAME, type Ack, type User } from '@risky-chess/shared';
import { newId, newToken } from '../crypto/coin';
import { tx, type Db } from '../db/db';
import { Ledger } from '../db/ledger';
import { Users } from '../db/users';
import { logger } from '../log';
import type { Fairness } from '../originals/Fairness';

const log = logger('auth');

/** Names nobody may register: the house account and words that would confuse the feed. */
const RESERVED = new Set(['house', 'admin', 'system', 'riskybot', 'bot']);

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/**
 * Mock identity: a username and a bearer token minted once per device. The
 * token is the only credential; its hash is what the database keeps. Real
 * authentication can replace `register` without touching anything else.
 */
export class AuthService {
  constructor(
    private readonly db: Db,
    private readonly users: Users,
    private readonly ledger: Ledger,
    private readonly fairness: Fairness,
  ) {}

  register(username: string, now = Date.now()): Ack<{ user: User; token: string }> {
    const name = username.trim();
    if (name.length < USERNAME.MIN || name.length > USERNAME.MAX || !USERNAME.PATTERN.test(name)) {
      return { ok: false, error: 'USERNAME_INVALID', message: `${USERNAME.MIN}–${USERNAME.MAX} letters, digits or underscores` };
    }
    if (RESERVED.has(name.toLowerCase()) || this.users.usernameTaken(name)) {
      return { ok: false, error: 'USERNAME_TAKEN', message: 'That name is taken' };
    }
    const token = newToken();
    const id = newId();
    const user = tx(this.db, () => {
      this.users.create({ id, username: name, tokenHash: hashToken(token), now });
      this.ledger.post({ userId: id, kind: 'bonus', amountCents: SIGNUP_BONUS_CENTS, idemKey: `bonus:${id}`, now });
      this.fairness.ensureSeedPair(id);
      return this.users.byId(id)!;
    });
    log.info('registered', { userId: id, username: name });
    return { ok: true, data: { user, token } };
  }

  /** The account behind a bearer token, or null. */
  authenticate(token: string | undefined): User | null {
    if (!token) return null;
    return this.users.byTokenHash(hashToken(token));
  }
}
