import type { Color, GameSession, Settlement } from '@risky-chess/shared';
import { newId } from '../crypto/coin';
import { tx, type Db } from '../db/db';
import type { Escrow } from '../db/escrow';
import { HOUSE_USER_ID, InsufficientFunds, type Ledger } from '../db/ledger';
import { logger } from '../log';

const log = logger('wallet');

/** Called after any balance change so the account's devices can refresh. */
export type BalanceListener = (userId: string, balanceCents: number) => void;

/**
 * Every money movement around tables and top-ups. Each operation is
 * idempotent by construction (ledger keys are derived from what the money
 * is for), so a retried call or a double finish() never pays twice.
 */
export class WalletService {
  private listener: BalanceListener = () => {};

  constructor(
    private readonly db: Db,
    private readonly ledger: Ledger,
    private readonly escrow: Escrow,
  ) {}

  onBalance(fn: BalanceListener): void {
    this.listener = fn;
  }

  balance(userId: string): number {
    return this.ledger.balance(userId);
  }

  /** Mock top-up: nothing is charged anywhere. */
  deposit(userId: string, amountCents: number): number {
    const { balanceCents } = this.ledger.post({ userId, kind: 'deposit', amountCents, idemKey: `deposit:${newId()}` });
    this.listener(userId, balanceCents);
    return balanceCents;
  }

  withdraw(userId: string, amountCents: number): number | 'INSUFFICIENT_FUNDS' {
    try {
      const { balanceCents } = this.ledger.post({ userId, kind: 'withdraw', amountCents: -amountCents, idemKey: `withdraw:${newId()}` });
      this.listener(userId, balanceCents);
      return balanceCents;
    } catch (e) {
      if (e instanceof InsufficientFunds) return 'INSUFFICIENT_FUNDS';
      throw e;
    }
  }

  // ---------- tables ----------

  /** Debits the buy-in into escrow. Free tables (0) hold nothing. */
  holdBuyIn(gameId: string, userId: string, amountCents: number): boolean {
    if (amountCents <= 0) return true;
    try {
      const { balanceCents } = tx(this.db, () => {
        const posted = this.ledger.post({ userId, kind: 'buy_in', amountCents: -amountCents, idemKey: `buyin:${gameId}:${userId}`, ref: { type: 'game', id: gameId } });
        this.escrow.hold(gameId, userId, amountCents);
        return posted;
      });
      this.listener(userId, balanceCents);
      return true;
    } catch (e) {
      if (e instanceof InsufficientFunds) return false;
      throw e;
    }
  }

  /** Returns a held buy-in (table cancelled, opponent never came, game lost to a restart). */
  refund(gameId: string, userId: string): void {
    const held = this.escrow.held(gameId).find((r) => r.userId === userId);
    if (!held) return;
    const { balanceCents } = tx(this.db, () => {
      this.escrow.release(gameId, userId, 'refunded');
      return this.ledger.post({ userId, kind: 'refund', amountCents: held.amountCents, idemKey: `refund:${gameId}:${userId}`, ref: { type: 'game', id: gameId } });
    });
    log.info('buy-in refunded', { gameId, userId, amountCents: held.amountCents });
    this.listener(userId, balanceCents);
  }

  refundGame(gameId: string): void {
    for (const r of this.escrow.held(gameId)) this.refund(gameId, r.userId);
  }

  /** Pays the pot out as the settlement says: each seat's payout, the rake to the house. */
  settleGame(s: GameSession, settlement: Settlement): void {
    const held = this.escrow.held(s.id);
    if (held.length === 0) return; // already settled, or a free table
    const paid: { userId: string; balanceCents: number }[] = [];
    tx(this.db, () => {
      for (const c of ['w', 'b'] as const) {
        const userId = s.players[c]?.userId;
        if (!userId) continue;
        this.escrow.release(s.id, userId, 'settled');
        const payout = settlement.payouts[c];
        if (payout > 0) {
          const { balanceCents } = this.ledger.post({ userId, kind: 'cashout', amountCents: payout, idemKey: `cashout:${s.id}:${userId}`, ref: { type: 'game', id: s.id } });
          paid.push({ userId, balanceCents });
        }
      }
      if (settlement.rakeCents > 0) {
        this.ledger.post({ userId: HOUSE_USER_ID, kind: 'rake', amountCents: settlement.rakeCents, idemKey: `rake:${s.id}`, ref: { type: 'game', id: s.id } });
      }
    });
    log.info('table settled', { gameId: s.id, payouts: settlement.payouts, rake: settlement.rakeCents });
    for (const p of paid) this.listener(p.userId, p.balanceCents);
  }

  /** Boot: anything still held belongs to a game that died with the previous process. */
  refundAllHeld(liveGameIds: ReadonlySet<string>): number {
    let n = 0;
    for (const r of this.escrow.allHeld()) {
      if (liveGameIds.has(r.gameId)) continue;
      this.refund(r.gameId, r.userId);
      n++;
    }
    if (n) log.warn('refunded orphaned buy-ins at boot', { count: n });
    return n;
  }

  seatsOf(s: GameSession): Partial<Record<Color, string>> {
    const out: Partial<Record<Color, string>> = {};
    for (const c of ['w', 'b'] as const) if (s.players[c]?.userId) out[c] = s.players[c]!.userId;
    return out;
  }
}
