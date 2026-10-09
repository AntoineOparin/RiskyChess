import { describe, expect, it } from 'vitest';
import { SIGNUP_BONUS_CENTS, START_FEN, type GameSession } from '@risky-chess/shared';
import { settleTable } from '@risky-chess/engine';
import { createServices } from '../platform';
import { InsufficientFunds, HOUSE_BANKROLL_CENTS, HOUSE_USER_ID } from '../db/ledger';

function user(services: ReturnType<typeof createServices>, name: string) {
  const out = services.auth.register(name);
  if (!out.ok) throw new Error(out.message);
  return out.data;
}

describe('ledger', () => {
  it('credits the signup bonus and authenticates by token', () => {
    const s = createServices();
    const { user: u, token } = user(s, 'ann');
    expect(u.balanceCents).toBe(SIGNUP_BONUS_CENTS);
    expect(s.auth.authenticate(token)?.id).toBe(u.id);
    expect(s.auth.authenticate('nope')).toBeNull();
    expect(s.auth.register('Ann')).toMatchObject({ ok: false, error: 'USERNAME_TAKEN' });
    expect(s.auth.register('house')).toMatchObject({ ok: false, error: 'USERNAME_TAKEN' });
    expect(s.auth.register('a b')).toMatchObject({ ok: false, error: 'USERNAME_INVALID' });
  });

  it('never lets a balance go negative and replays idempotent posts', () => {
    const s = createServices();
    const { user: u } = user(s, 'bob');
    expect(() => s.ledger.post({ userId: u.id, kind: 'withdraw', amountCents: -(SIGNUP_BONUS_CENTS + 1), idemKey: 'w1' })).toThrow(InsufficientFunds);
    const first = s.ledger.post({ userId: u.id, kind: 'withdraw', amountCents: -500, idemKey: 'w2' });
    const again = s.ledger.post({ userId: u.id, kind: 'withdraw', amountCents: -500, idemKey: 'w2' });
    expect(first).toEqual({ balanceCents: SIGNUP_BONUS_CENTS - 500, replayed: false });
    expect(again).toEqual({ balanceCents: SIGNUP_BONUS_CENTS - 500, replayed: true });
    expect(s.ledger.transactions(u.id).map((t) => t.kind)).toEqual(['withdraw', 'bonus']);
  });

  it('a transfer rolls back as one unit', () => {
    const s = createServices();
    const { user: a } = user(s, 'cat');
    const { user: b } = user(s, 'dan');
    expect(() => s.ledger.transfer(a.id, b.id, SIGNUP_BONUS_CENTS * 2, { debit: 'bet_stake', credit: 'bet_payout' }, 't1')).toThrow(InsufficientFunds);
    expect(s.ledger.balance(a.id)).toBe(SIGNUP_BONUS_CENTS);
    expect(s.ledger.balance(b.id)).toBe(SIGNUP_BONUS_CENTS);
  });
});

describe('wallet', () => {
  const session = (id: string, w: string, b: string, buyInCents: number): GameSession => ({
    id,
    mode: 'pvp',
    status: 'finished',
    players: {
      w: { playerId: 'pw', userId: w, displayName: 'w', isBot: false, connected: true },
      b: { playerId: 'pb', userId: b, displayName: 'b', isBot: false, connected: true },
    },
    startFen: START_FEN,
    fen: START_FEN,
    turn: 'w',
    turnNumber: 1,
    history: [],
    rules: { modes: [] },
    buyInCents,
    chipValueCents: buyInCents / 100,
    visibility: 'public',
    host: 'w',
    modeState: {},
    createdAt: 0,
    updatedAt: 0,
  });

  it('holds, settles and conserves money', () => {
    const s = createServices();
    const { user: a } = user(s, 'eve');
    const { user: b } = user(s, 'fay');
    const total = s.ledger.totalCents();
    expect(s.wallet.holdBuyIn('G1', a.id, 5_000)).toBe(true);
    expect(s.wallet.holdBuyIn('G1', b.id, 5_000)).toBe(true);
    expect(s.wallet.holdBuyIn('G1', a.id, 5_000)).toBe(true); // replay: nothing more is taken
    expect(s.ledger.balance(a.id)).toBe(SIGNUP_BONUS_CENTS - 5_000);
    expect(s.ledger.totalCents()).toBe(total - 10_000); // escrow is outside user balances

    const sess = session('G1', a.id, b.id, 5_000);
    const settlement = settleTable({ buyInCents: 5_000, outcome: { kind: 'checkmate', winner: 'b' } })!;
    s.wallet.settleGame(sess, settlement);
    s.wallet.settleGame(sess, settlement); // idempotent
    expect(s.ledger.balance(b.id)).toBe(SIGNUP_BONUS_CENTS - 5_000 + settlement.payouts.b);
    expect(s.ledger.balance(HOUSE_USER_ID)).toBe(HOUSE_BANKROLL_CENTS + settlement.rakeCents);
    expect(s.ledger.totalCents()).toBe(total);
    expect(s.escrow.held('G1')).toEqual([]);
  });

  it('refuses a buy-in the balance cannot cover and refunds orphans at boot', () => {
    const s = createServices();
    const { user: a } = user(s, 'gus');
    expect(s.wallet.holdBuyIn('G2', a.id, SIGNUP_BONUS_CENTS + 1)).toBe(false);
    expect(s.wallet.holdBuyIn('G2', a.id, 25_000)).toBe(true);
    expect(s.wallet.refundAllHeld(new Set(['G2']))).toBe(0);
    expect(s.wallet.refundAllHeld(new Set())).toBe(1);
    expect(s.ledger.balance(a.id)).toBe(SIGNUP_BONUS_CENTS);
    expect(s.wallet.refundAllHeld(new Set())).toBe(0);
  });

  it('mock deposits and withdrawals move the balance', () => {
    const s = createServices();
    const { user: a } = user(s, 'hal');
    const seen: number[] = [];
    s.wallet.onBalance((_id, b) => seen.push(b));
    expect(s.wallet.deposit(a.id, 1_000)).toBe(SIGNUP_BONUS_CENTS + 1_000);
    expect(s.wallet.withdraw(a.id, 10_000_000)).toBe('INSUFFICIENT_FUNDS');
    expect(s.wallet.withdraw(a.id, 1_000)).toBe(SIGNUP_BONUS_CENTS);
    expect(seen).toEqual([SIGNUP_BONUS_CENTS + 1_000, SIGNUP_BONUS_CENTS]);
  });
});

describe('seed pairs', () => {
  it('rotating reveals the old server seed and resets the nonce', () => {
    const s = createServices();
    const { user: a } = user(s, 'ivy');
    const r0 = s.fairness.openRound(a.id);
    const r1 = s.fairness.openRound(a.id);
    expect([r0.nonce, r1.nonce]).toEqual([0, 1]);
    expect(r0.roll()).toBeGreaterThanOrEqual(0);
    expect(r0.roll()).toBeLessThan(10_000);
    const { current, history } = s.fairness.rotate(a.id);
    expect(current.nonce).toBe(0);
    expect(current.serverSeedHash).not.toBe(r0.serverSeedHash);
    expect(history[0]).toMatchObject({ serverSeedHash: r0.serverSeedHash, rounds: 2 });
  });
});
