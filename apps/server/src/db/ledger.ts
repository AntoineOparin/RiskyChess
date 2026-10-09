import type { Transaction, TxKind } from '@risky-chess/shared';
import { newId } from '../crypto/coin';
import { tx, type Db } from './db';

export const HOUSE_USER_ID = 'house';
/** What migration 2 seeds the house with: payouts come out of it, so Σ balances is conserved. */
export const HOUSE_BANKROLL_CENTS = 1_000_000_000;

export interface PostInput {
  userId: string;
  kind: TxKind;
  /** Signed: debits are negative. */
  amountCents: number;
  /** Replaying the same key returns the original result and posts nothing. */
  idemKey: string;
  ref?: Transaction['ref'];
  now?: number;
}

export interface Posted {
  balanceCents: number;
  replayed: boolean;
}

export class InsufficientFunds extends Error {
  constructor(public readonly userId: string, public readonly amountCents: number) {
    super(`Insufficient funds: ${userId} cannot cover ${amountCents}`);
  }
}

interface TxRow {
  id: string;
  kind: TxKind;
  amount_cents: number;
  balance_after: number;
  ref_type: Transaction['ref'] extends infer R ? (R extends { type: infer T } ? T : never) | null : never;
  ref_id: string | null;
  created_at: number;
}

/**
 * The only way a balance changes. Every post is one atomic step: check the
 * idempotency key, move the balance (refusing to go below zero), record the
 * row with the balance after. Callers compose posts inside `tx()` when
 * several must land together (a payout and its rake, a refund for two seats).
 */
export class Ledger {
  constructor(private readonly db: Db) {}

  post(p: PostInput): Posted {
    return tx(this.db, () => {
      const prior = this.db.prepare('SELECT balance_after FROM transactions WHERE idem_key = ?').get(p.idemKey) as { balance_after: number } | undefined;
      if (prior) return { balanceCents: this.balance(p.userId), replayed: true };
      const moved = this.db
        .prepare('UPDATE users SET balance_cents = balance_cents + ? WHERE id = ? AND balance_cents + ? >= 0')
        .run(p.amountCents, p.userId, p.amountCents);
      if (moved.changes === 0) {
        if (!this.exists(p.userId)) throw new Error(`Ledger: unknown user ${p.userId}`);
        throw new InsufficientFunds(p.userId, p.amountCents);
      }
      const balanceCents = this.balance(p.userId);
      this.db
        .prepare('INSERT INTO transactions (id, user_id, kind, amount_cents, balance_after, ref_type, ref_id, idem_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(newId(), p.userId, p.kind, p.amountCents, balanceCents, p.ref?.type ?? null, p.ref?.id ?? null, p.idemKey, p.now ?? Date.now());
      return { balanceCents, replayed: false };
    });
  }

  /** Moves `amountCents` from one account to another as two posts that commit together. */
  transfer(from: string, to: string, amountCents: number, kind: { debit: TxKind; credit: TxKind }, idemKey: string, ref?: Transaction['ref']): Posted {
    return tx(this.db, () => {
      const out = this.post({ userId: from, kind: kind.debit, amountCents: -amountCents, idemKey: `${idemKey}:debit`, ...(ref ? { ref } : {}) });
      this.post({ userId: to, kind: kind.credit, amountCents, idemKey: `${idemKey}:credit`, ...(ref ? { ref } : {}) });
      return out;
    });
  }

  balance(userId: string): number {
    const row = this.db.prepare('SELECT balance_cents FROM users WHERE id = ?').get(userId) as { balance_cents: number } | undefined;
    if (!row) throw new Error(`Ledger: unknown user ${userId}`);
    return row.balance_cents;
  }

  exists(userId: string): boolean {
    return !!this.db.prepare('SELECT 1 FROM users WHERE id = ?').get(userId);
  }

  /** Newest first. */
  transactions(userId: string, limit = 100): Transaction[] {
    const rows = this.db
      .prepare('SELECT id, kind, amount_cents, balance_after, ref_type, ref_id, created_at FROM transactions WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?')
      .all(userId, limit) as unknown as TxRow[];
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      amountCents: r.amount_cents,
      balanceAfterCents: r.balance_after,
      ref: r.ref_type && r.ref_id ? { type: r.ref_type, id: r.ref_id } : undefined,
      createdAt: r.created_at,
    }));
  }

  /** Sum of every balance (users and house): constant unless deposits or withdrawals happen. */
  totalCents(): number {
    const row = this.db.prepare('SELECT COALESCE(SUM(balance_cents), 0) AS total FROM users').get() as { total: number };
    return row.total;
  }
}
