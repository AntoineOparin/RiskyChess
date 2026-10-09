import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ORIGINALS, SIGNUP_BONUS_CENTS, type MoveInput, type ServerToClientEvents } from '@risky-chess/shared';
import { solvePuzzle, verifyCoinDuelRound } from '@risky-chess/engine';
import { HOUSE_USER_ID } from '../db/ledger';
import { BlitzPuzzle } from '../originals/BlitzPuzzle';
import { CoinDuel, type EmitToUser } from '../originals/CoinDuel';
import { createServices } from '../platform';

type Sent = { userId: string; event: keyof ServerToClientEvents; payload: unknown };

function setup() {
  const services = createServices();
  const sent: Sent[] = [];
  const emit: EmitToUser = (userId, event, ...args) => sent.push({ userId, event, payload: args[0] });
  const out = services.auth.register('ann');
  if (!out.ok) throw new Error(out.message);
  const user = { id: out.data.user.id, username: 'ann' };
  return { services, sent, emit, user, coinDuel: new CoinDuel(services, emit), puzzle: new BlitzPuzzle(services, emit) };
}

const data = <T>(ack: { ok: true; data: T } | { ok: false; message: string }): T => {
  if (!ack.ok) throw new Error(ack.message);
  return ack.data;
};

describe('Coin Duel', () => {
  it('deals, takes a stake and pays by the committed coin, conserving money', () => {
    const t = setup();
    const total = t.services.ledger.totalCents();
    const deal = data(t.coinDuel.deal(t.user));
    expect(deal.nonce).toBe(0);
    expect(deal.moveA.lan).not.toBe(deal.moveB.lan);

    const res = data(t.coinDuel.bet(t.user, { roundId: deal.roundId, slot: 'A', stakeCents: 1_000 }));
    expect(res.chosen).toBe(res.roll < deal.odds.A ? 'A' : 'B');
    expect(res.won).toBe(res.chosen === 'A');
    const expectedPayout = res.won ? Math.floor((1_000 * deal.payoutX100.A) / 100) : 0;
    expect(res.payoutCents).toBe(expectedPayout);
    expect(res.balanceCents).toBe(SIGNUP_BONUS_CENTS - 1_000 + expectedPayout);
    expect(t.services.ledger.balance(t.user.id)).toBe(res.balanceCents);
    // The house is a mock bankroll: it may have been topped up, never more than the shortfall.
    expect(t.services.ledger.totalCents()).toBeGreaterThanOrEqual(total);
    expect(t.services.ledger.balance(HOUSE_USER_ID)).toBe(Math.max(0, 1_000 - expectedPayout));
    expect(t.sent.at(-1)).toMatchObject({ userId: t.user.id, event: 'balance_updated', payload: { balanceCents: res.balanceCents } });
    expect(t.services.archive.feed()[0]).toMatchObject({ username: 'ann', game: 'coin_duel', stakeCents: 1_000, payoutCents: expectedPayout });
    expect(t.services.bets.roundsOf(t.user.id)[0]).toMatchObject({ game: 'coin_duel', nonce: 0, status: res.won ? 'won' : 'lost' });

    // The round re-derives from the revealed seed once the pair is rotated.
    const { history } = t.services.fairness.rotate(t.user.id);
    const check = verifyCoinDuelRound(history[0]!.serverSeed, deal.clientSeed, deal.nonce);
    expect(check.deal.fen).toBe(deal.fen);
    expect(check.roll).toBe(res.roll);
    expect(check.result.chosen).toBe(res.chosen);
  });

  it('refuses a settled, foreign, expired or rotated round and bad stakes', () => {
    const t = setup();
    const deal = data(t.coinDuel.deal(t.user));
    expect(t.coinDuel.bet(t.user, { roundId: 'nope', slot: 'A', stakeCents: 500 })).toMatchObject({ ok: false, error: 'ROUND_NOT_FOUND' });
    expect(t.coinDuel.bet({ id: 'someone', username: 'x' }, { roundId: deal.roundId, slot: 'A', stakeCents: 500 })).toMatchObject({ ok: false, error: 'ROUND_NOT_FOUND' });
    expect(t.coinDuel.bet(t.user, { roundId: deal.roundId, slot: 'A', stakeCents: ORIGINALS.MIN_STAKE_CENTS - 1 })).toMatchObject({ ok: false, error: 'INVALID_STAKE' });
    expect(t.coinDuel.bet(t.user, { roundId: deal.roundId, slot: 'A', stakeCents: SIGNUP_BONUS_CENTS * 2 })).toMatchObject({ ok: false, error: 'INVALID_STAKE' });
    expect(t.coinDuel.bet(t.user, { roundId: deal.roundId, slot: 'A', stakeCents: 500 }, deal.expiresAt + 1)).toMatchObject({ ok: false, error: 'ROUND_EXPIRED' });
    expect(t.coinDuel.bet(t.user, { roundId: deal.roundId, slot: 'A', stakeCents: 500 })).toMatchObject({ ok: false, error: 'ROUND_EXPIRED' });

    const fresh = data(t.coinDuel.deal(t.user));
    t.services.fairness.rotate(t.user.id);
    expect(t.coinDuel.bet(t.user, { roundId: fresh.roundId, slot: 'B', stakeCents: 500 })).toMatchObject({ ok: false, error: 'ROUND_EXPIRED' });
    expect(t.services.ledger.balance(t.user.id)).toBe(SIGNUP_BONUS_CENTS);
  });

  it('refuses a stake the balance cannot cover', () => {
    const t = setup();
    t.services.wallet.withdraw(t.user.id, SIGNUP_BONUS_CENTS - 100);
    const deal = data(t.coinDuel.deal(t.user));
    expect(t.coinDuel.bet(t.user, { roundId: deal.roundId, slot: 'A', stakeCents: 500 })).toMatchObject({ ok: false, error: 'INSUFFICIENT_FUNDS' });
    expect(t.services.ledger.balance(t.user.id)).toBe(100);
    expect(t.services.bets.round(deal.roundId)?.status).toBe('open');
  });
});

describe('Blitz Puzzle', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('pays a solved puzzle at the tier multiplier', () => {
    const t = setup();
    const round = data(t.puzzle.start(t.user, { tier: 'mate1', stakeCents: 2_000 }));
    expect(t.services.ledger.balance(t.user.id)).toBe(SIGNUP_BONUS_CENTS - 2_000);
    expect(round.payoutX100).toBe(ORIGINALS.PUZZLE_TIERS.mate1.payoutX100);
    const solution = solvePuzzle('mate1', round.fen)!;
    const res = data(t.puzzle.answer(t.user, { roundId: round.roundId, move: solution }));
    expect(res.outcome).toBe('solved');
    expect(res.payoutCents).toBe(Math.floor((2_000 * round.payoutX100) / 100));
    expect(res.balanceCents).toBe(SIGNUP_BONUS_CENTS - 2_000 + res.payoutCents);
    expect(t.services.bets.round(round.roundId)?.status).toBe('won');
    expect(t.puzzle.answer(t.user, { roundId: round.roundId, move: solution })).toMatchObject({ ok: false, error: 'ROUND_EXPIRED' });
    vi.runAllTimers(); // the cleared clock must not fire
    expect(t.services.ledger.balance(t.user.id)).toBe(res.balanceCents);
  });

  it('loses on a wrong or illegal answer', () => {
    const t = setup();
    const round = data(t.puzzle.start(t.user, { tier: 'mate2', stakeCents: 500 }));
    const solution = solvePuzzle('mate2', round.fen)!;
    const wrong: MoveInput = { from: 'a1', to: 'h8' };
    const res = data(t.puzzle.answer(t.user, { roundId: round.roundId, move: wrong }));
    expect(res.outcome).toBe('wrong');
    expect(res.move).toBeUndefined();
    expect(res.payoutCents).toBe(0);
    expect(t.services.ledger.balance(t.user.id)).toBe(SIGNUP_BONUS_CENTS - 500);
    expect(t.services.ledger.balance(HOUSE_USER_ID)).toBe(500);
    expect(solution).toBeTruthy();
  });

  it('times out on the server clock and tells the player', () => {
    const t = setup();
    const round = data(t.puzzle.start(t.user, { tier: 'mate1', stakeCents: 500 }));
    vi.advanceTimersByTime(ORIGINALS.PUZZLE_TIERS.mate1.seconds * 1000 + 1);
    expect(t.services.bets.round(round.roundId)?.status).toBe('lost');
    expect(t.sent.find((s) => s.event === 'original_settled')).toMatchObject({ userId: t.user.id, payload: { roundId: round.roundId, payoutCents: 0, balanceCents: SIGNUP_BONUS_CENTS - 500 } });
    expect(t.puzzle.answer(t.user, { roundId: round.roundId, move: solvePuzzle('mate1', round.fen)! })).toMatchObject({ ok: false, error: 'ROUND_EXPIRED' });

    // A late answer (clock skew) is also a timeout, never a win.
    const late = data(t.puzzle.start(t.user, { tier: 'mate1', stakeCents: 500 }));
    const res = data(t.puzzle.answer(t.user, { roundId: late.roundId, move: solvePuzzle('mate1', late.fen)! }, late.deadline + 1));
    expect(res.outcome).toBe('timeout');
    expect(res.payoutCents).toBe(0);
  });

  it('refuses a stake the balance cannot cover and settles orphans at boot', () => {
    const t = setup();
    expect(t.puzzle.start(t.user, { tier: 'mate1', stakeCents: SIGNUP_BONUS_CENTS + 1 })).toMatchObject({ ok: false, error: 'INVALID_STAKE' });
    t.services.wallet.withdraw(t.user.id, SIGNUP_BONUS_CENTS - 100);
    expect(t.puzzle.start(t.user, { tier: 'mate1', stakeCents: 500 })).toMatchObject({ ok: false, error: 'INSUFFICIENT_FUNDS' });
    expect(t.services.fairness.current(t.user.id).nonce).toBe(0); // no nonce burnt on a refused start

    t.services.wallet.deposit(t.user.id, 10_000);
    const round = data(t.puzzle.start(t.user, { tier: 'mate2', stakeCents: 500 }));
    const restarted = new BlitzPuzzle(t.services, t.emit);
    expect(t.services.bets.round(round.roundId)?.status).toBe('lost');
    restarted.dispose();
  });
});
