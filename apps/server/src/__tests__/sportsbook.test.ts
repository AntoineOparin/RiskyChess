import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { matchPayout } from '@risky-chess/engine';
import { SIGNUP_BONUS_CENTS, SPORTSBOOK, type Ack, type MatchBet, type MatchLine, type MoveInput } from '@risky-chess/shared';
import { createApp, type App } from '../app';
import { HOUSE_USER_ID, HOUSE_BANKROLL_CENTS } from '../db/ledger';
import { connectAs, registerUser, type Client } from './helpers';

let app: App;
let url: string;
const clients: Client[] = [];

beforeEach(async () => {
  app = createApp({ tosser: () => ({ chosen: 'A', method: 'local' }), ttlMs: 1_000 });
  await new Promise<void>((r) => app.http.listen(0, r));
  url = `http://localhost:${(app.http.address() as AddressInfo).port}`;
});

afterEach(async () => {
  clients.splice(0).forEach((c) => c.disconnect());
  await app.close();
});

async function client(who: string | { token: string }): Promise<Client & { token: string }> {
  const c = await connectAs(app, url, who);
  clients.push(c);
  return c;
}
const m = (lan: string): MoveInput => ({ from: lan.slice(0, 2), to: lan.slice(2, 4) }) as MoveInput;
const call = <T,>(c: Client, ev: string, p: unknown) => new Promise<Ack<T>>((r) => (c as unknown as { emit: (e: string, p: unknown, cb: (a: Ack<T>) => void) => void }).emit(ev, p, r));
const next = <T,>(c: Client, e: string) => new Promise<T>((r) => (c as unknown as { once: (e: string, cb: (p: T) => void) => void }).once(e, r));

/** A public game between alice and bob, plus cleo watching it. */
async function liveGame() {
  const [a, b, c] = [await client('alice'), await client('bob'), await client('cleo')];
  const created = await call<{ gameId: string }>(a, 'create_game', { mode: 'pvp', color: 'w' });
  if (!created.ok) throw new Error(created.message);
  const { gameId } = created.data;
  await call(b, 'join_game', { gameId });
  const watched = await call<{ line: MatchLine }>(c, 'watch_game', { gameId });
  if (!watched.ok) throw new Error(watched.message);
  const cleo = app.services.auth.authenticate(c.token)!;
  return { a, b, c, gameId, line: watched.data.line, cleo };
}

describe('sportsbook', () => {
  it('takes a bet at the line and pays it on the result', async () => {
    const { a, b, c, gameId, line, cleo } = await liveGame();
    const total = app.services.ledger.totalCents();
    const balanceEvent = next<{ balanceCents: number }>(c, 'balance_updated');
    const placed = await call<{ bet: MatchBet; balanceCents: number }>(c, 'place_match_bet', { gameId, clientBetId: 'b1', side: 'b', stakeCents: 2_000, oddsX100: line.b });
    if (!placed.ok) throw new Error(placed.message);
    expect(placed.data.bet).toMatchObject({ side: 'b', stakeCents: 2_000, oddsX100: line.b, status: 'open' });
    expect(placed.data.balanceCents).toBe(SIGNUP_BONUS_CENTS - 2_000);
    expect((await balanceEvent).balanceCents).toBe(SIGNUP_BONUS_CENTS - 2_000);
    expect(app.services.ledger.balance(HOUSE_USER_ID)).toBe(HOUSE_BANKROLL_CENTS + 2_000);
    expect(app.services.ledger.totalCents()).toBe(total);
    expect(app.lobby.snapshot().markets[0]).toMatchObject({ gameId, handleCents: 2_000 });

    // A retry with the same clientBetId is the same bet.
    const again = await call<{ bet: MatchBet }>(c, 'place_match_bet', { gameId, clientBetId: 'b1', side: 'b', stakeCents: 2_000, oddsX100: line.b });
    expect(again.ok && again.data.bet.id).toBe(placed.data.bet.id);
    expect(app.services.bets.handle(gameId)).toBe(2_000);

    // Fool's mate: black wins on ply 4.
    const settled = next<{ bet: MatchBet; balanceCents: number }>(c, 'match_bet_settled');
    const plies: [Client, string, string][] = [
      [a, 'f2f3', 'e2e4'],
      [b, 'e7e5', 'd7d5'],
      [a, 'g2g4', 'h2h3'],
      [b, 'd8h4', 'f8c5'],
    ];
    for (const [i, [who, x, y]] of plies.entries()) {
      const res = await call(who, 'submit_moves', { gameId, turnNumber: i + 1, clientSubmissionId: `s${i}`, moveA: m(x), moveB: m(y) });
      if (!res.ok) throw new Error(res.message);
    }
    const payout = matchPayout(2_000, line.b);
    const s = await settled;
    expect(s.bet).toMatchObject({ id: placed.data.bet.id, status: 'won', payoutCents: payout });
    expect(s.balanceCents).toBe(SIGNUP_BONUS_CENTS - 2_000 + payout);
    expect(app.services.ledger.balance(cleo.id)).toBe(s.balanceCents);
    // The bankroll paid the difference; nothing was minted.
    expect(app.services.ledger.totalCents()).toBe(total);
    expect(app.services.ledger.balance(HOUSE_USER_ID)).toBe(HOUSE_BANKROLL_CENTS + 2_000 - payout);
    expect(app.services.bets.matchBetsOf(cleo.id)[0]).toMatchObject({ status: 'won', payoutCents: payout });
    expect(app.services.archive.feed().map((f) => f.game)).toContain('sportsbook');
  });

  it('refuses stale odds, own games, oversized exposure and short balances', async () => {
    const { a, b, c, gameId, line } = await liveGame();
    const stale = await call(c, 'place_match_bet', { gameId, clientBetId: 'x1', side: 'w', stakeCents: 1_000, oddsX100: line.w + SPORTSBOOK.ODDS_TOLERANCE_X100 + 1 });
    expect(stale).toMatchObject({ ok: false, error: 'ODDS_CHANGED', details: { line } });
    expect(await call(a, 'place_match_bet', { gameId, clientBetId: 'x2', side: 'w', stakeCents: 1_000, oddsX100: line.w })).toMatchObject({ ok: false, error: 'OWN_GAME' });
    expect(await call(c, 'place_match_bet', { gameId, clientBetId: 'x3', side: 'w', stakeCents: SPORTSBOOK.MIN_STAKE_CENTS - 1, oddsX100: line.w })).toMatchObject({ ok: false, error: 'INVALID_STAKE' });
    expect((await call(c, 'place_match_bet', { gameId, clientBetId: 'x4', side: 'w', stakeCents: SPORTSBOOK.MAX_STAKE_CENTS, oddsX100: line.w })).ok).toBe(true);
    expect((await call(c, 'place_match_bet', { gameId, clientBetId: 'x5', side: 'd', stakeCents: SPORTSBOOK.MAX_STAKE_CENTS, oddsX100: line.d })).ok).toBe(true);
    expect(await call(c, 'place_match_bet', { gameId, clientBetId: 'x6', side: 'b', stakeCents: 1_000, oddsX100: line.b })).toMatchObject({ ok: false, error: 'EXPOSURE_LIMIT' });

    // The line moves with the board: odds quoted before a capture are refused after it.
    await call(a, 'submit_moves', { gameId, turnNumber: 1, clientSubmissionId: 's1', moveA: m('e2e4'), moveB: m('d2d4') });
    await call(b, 'submit_moves', { gameId, turnNumber: 2, clientSubmissionId: 's2', moveA: m('d7d5'), moveB: m('e7e5') });
    await call(a, 'submit_moves', { gameId, turnNumber: 3, clientSubmissionId: 's3', moveA: m('e4d5'), moveB: m('d2d4') });
    const poor = registerUser(app, 'dave');
    app.services.wallet.withdraw(poor.userId, SIGNUP_BONUS_CENTS - 500);
    const d = await client({ token: poor.token });
    await call(d, 'watch_game', { gameId });
    const fresh = app.sportsbook.line(app.manager.record(gameId)!);
    expect(fresh.w).toBeLessThan(line.w);
    expect(await call(d, 'place_match_bet', { gameId, clientBetId: 'd1', side: 'w', stakeCents: 1_000, oddsX100: line.w })).toMatchObject({ ok: false, error: 'ODDS_CHANGED' });
    expect(await call(d, 'place_match_bet', { gameId, clientBetId: 'd2', side: 'w', stakeCents: 1_000, oddsX100: fresh.w })).toMatchObject({ ok: false, error: 'INSUFFICIENT_FUNDS' });
    expect(app.services.ledger.balance(poor.userId)).toBe(500);

    // Betting closes with the game.
    await call(a, 'resign', { gameId });
    expect(await call(c, 'place_match_bet', { gameId, clientBetId: 'x7', side: 'b', stakeCents: 1_000, oddsX100: fresh.b })).toMatchObject({ ok: false, error: 'GAME_NOT_ACTIVE' });
  });

  it('voids open bets when a game is swept without a result', async () => {
    const { c, gameId, line, cleo } = await liveGame();
    const total = app.services.ledger.totalCents();
    expect((await call(c, 'place_match_bet', { gameId, clientBetId: 'v1', side: 'w', stakeCents: 3_000, oddsX100: line.w })).ok).toBe(true);
    expect(app.services.ledger.balance(cleo.id)).toBe(SIGNUP_BONUS_CENTS - 3_000);
    const settled = next<{ bet: MatchBet }>(c, 'match_bet_settled');
    app.manager.sweep(Date.now() + 10_000);
    expect((await settled).bet).toMatchObject({ status: 'void', payoutCents: 3_000 });
    expect(app.services.ledger.balance(cleo.id)).toBe(SIGNUP_BONUS_CENTS);
    expect(app.services.ledger.totalCents()).toBe(total);
    expect(app.manager.record(gameId)).toBeUndefined();
    expect(app.lobby.snapshot().markets).toEqual([]);
  });

  it('settles a paid table into the feed alongside the bets', async () => {
    const [a, b] = [await client('alice'), await client('bob')];
    const created = await call<{ gameId: string }>(a, 'create_game', { mode: 'pvp', color: 'w', buyInCents: 5_000 });
    if (!created.ok) throw new Error(created.message);
    await call(b, 'join_game', { gameId: created.data.gameId });
    await call(a, 'resign', { gameId: created.data.gameId });
    await new Promise((r) => setTimeout(r, 20));
    const feed = app.services.archive.feed();
    expect(feed.filter((f) => f.game === 'table')).toHaveLength(2);
    expect(feed.find((f) => f.username === 'bob')).toMatchObject({ stakeCents: 5_000, payoutCents: 9_500 });
  });
});
