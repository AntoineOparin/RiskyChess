import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import type { Ack, ClientToServerEvents, Color, GameRules, GameSession, MoveInput, PropBet, ServerToClientEvents } from '@risky-chess/shared';
import { BET_KINDS, seededRng } from '@risky-chess/engine';
import { createApp, type App } from '../app';
import { GameManager, type Emit, type EmitTo } from '../game/GameManager';
import { InMemoryGameStore } from '../game/GameStore';

const m = (lan: string): MoveInput => ({ from: lan.slice(0, 2), to: lan.slice(2, 4) }) as MoveInput;
const RULES: GameRules = { modes: ['side_bets'] };

describe('placeBet (manager)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup(rules: GameRules = RULES) {
    const events: { event: keyof ServerToClientEvents; payload: unknown; to?: Color }[] = [];
    const emit: Emit = (_g, event, ...a) => events.push({ event, payload: a[0] });
    const emitTo: EmitTo = (_g, to, event, ...a) => events.push({ event, payload: a[0], to });
    const store = new InMemoryGameStore();
    const manager = new GameManager(store, emit, { tossRng: { int: () => 0 }, rng: seededRng(2), botThinkMs: { min: 10, max: 10 } }, emitTo);
    return { manager, store, events, rules };
  }
  async function pvp(t: ReturnType<typeof setup>) {
    const w = t.manager.create({ mode: 'pvp', displayName: 'A', color: 'w', rules: t.rules }, 'cw');
    if (!w.ok) throw new Error();
    t.manager.join({ gameId: w.data.gameId, displayName: 'B' }, 'cb');
    await Promise.resolve();
    return w.data.gameId;
  }
  let n = 0;
  const bet = (t: ReturnType<typeof setup>, id: string, color: Color, kind: PropBet['kind'], stake = 10, clientBetId = `c${++n}`) =>
    t.manager.placeBet(color, { gameId: id, clientBetId, kind, stake });

  it('debits the stake, acks the bettor privately and syncs both seats', async () => {
    const t = setup();
    const id = await pvp(t);
    const res = bet(t, id, 'w', 'opp_promotes', 10);
    expect(res).toMatchObject({ ok: true, data: { bet: { kind: 'opp_promotes', stake: 10, placedAtTurn: 1, status: 'open' } } });
    const s = t.store.get(id)!.session;
    expect(s.wallet).toEqual({ w: 90, b: 100 });
    expect(t.events.filter((e) => e.event === 'bet_placed').map((e) => e.to)).toEqual(['w']);
    const syncs = t.events.filter((e) => e.event === 'state_sync');
    expect(syncs.map((e) => e.to)).toEqual(['w', 'b']);
    expect((syncs[1]!.payload as GameSession).modeState.bets).toEqual({ w: { count: 1 } });
    expect(JSON.stringify(syncs[1]!.payload)).not.toContain('opp_promotes');
  });

  it('is idempotent per clientBetId', async () => {
    const t = setup();
    const id = await pvp(t);
    const a = bet(t, id, 'w', 'opp_promotes', 10, 'same');
    const b = bet(t, id, 'w', 'opp_promotes', 10, 'same');
    expect(b).toEqual(a);
    expect(t.store.get(id)!.session.wallet).toEqual({ w: 90, b: 100 });
    expect((t.store.get(id)!.session.modeState.bets!.w as PropBet[]).length).toBe(1);
  });

  it('enforces the window, the limit and the stake', async () => {
    const t = setup();
    const id = await pvp(t);
    expect(bet(t, id, 'w', 'opp_promotes', 30)).toMatchObject({ ok: false, error: 'INVALID_STAKE' });
    for (const k of ['opp_promotes', 'game_length_under', 'game_length_over'] as const) expect(bet(t, id, 'w', k, 5).ok).toBe(true);
    expect(bet(t, id, 'w', 'opp_castles_by', 5)).toMatchObject({ ok: false, error: 'BET_LIMIT' });
    const plies: [Color, string, string][] = [
      ['w', 'e2e4', 'd2d4'],
      ['b', 'e7e5', 'd7d5'],
      ['w', 'g1f3', 'b1c3'],
    ];
    for (const [i, [c, a, b]] of plies.entries()) t.manager.submit(c, { gameId: id, turnNumber: i + 1, clientSubmissionId: `p${i}`, moveA: m(a), moveB: m(b) });
    expect(bet(t, id, 'b', 'opp_promotes', 5).ok).toBe(true); // turn 4: still open
    t.manager.submit('b', { gameId: id, turnNumber: 4, clientSubmissionId: 'p4', moveA: m('b8c6'), moveB: m('g8f6') });
    expect(bet(t, id, 'b', 'game_length_over', 5)).toMatchObject({ ok: false, error: 'BETTING_CLOSED' });
  });

  it('settles at game over and reveals every bet to the room', async () => {
    const t = setup();
    const id = await pvp(t);
    bet(t, id, 'w', 'game_length_under', 10); // White bets on a short game…
    bet(t, id, 'b', 'game_length_over', 20);
    t.manager.resign(id, 'b'); // …and Black resigns: White's bet wins, Black's quitting voids nothing of White's.
    const s = t.store.get(id)!.session;
    const [wBet] = s.modeState.bets!.w as PropBet[];
    const [bBet] = s.modeState.bets!.b as PropBet[];
    expect(wBet!.status).toBe('won');
    expect(bBet!.status).toBe('lost');
    expect(s.wallet!.w).toBe(90 + Math.floor((10 * wBet!.payoutX100) / 100));
    expect(s.wallet!.b).toBe(80);
    const revealed = t.events.find((e) => e.event === 'bets_revealed');
    expect(revealed?.to).toBeUndefined();
    expect(revealed?.payload).toMatchObject({ bets: { w: [{ kind: 'game_length_under' }], b: [{ kind: 'game_length_over' }] } });
    const over = t.events.find((e) => e.event === 'game_over')!.payload as { effects: unknown[] };
    expect(over.effects).toContainEqual(expect.objectContaining({ kind: 'bet_settled', result: 'won' }));
  });

  it('lets the bot place its sealed bets before the game starts', async () => {
    const t = setup({ modes: ['side_bets', 'all_in'] });
    const res = t.manager.create({ mode: 'bot', displayName: 'A', color: 'w', rules: t.rules }, 'c');
    if (!res.ok) throw new Error();
    await Promise.resolve();
    const start = t.events.find((e) => e.event === 'game_started')!.payload as GameSession;
    const sealed = start.modeState.bets?.b as { count: number };
    expect(sealed.count).toBeGreaterThanOrEqual(1);
    expect(start.wallet!.b).toBe(100 - 5 * sealed.count);
    expect(JSON.stringify(start)).not.toMatch(new RegExp(BET_KINDS.join('|')));
  });
});

describe('redaction over sockets', () => {
  let app: App;
  const clients: Socket<ServerToClientEvents, ClientToServerEvents>[] = [];
  afterEach(async () => {
    clients.splice(0).forEach((c) => c.disconnect());
    await app.close();
  });

  it("never sends the opponent a bet's kind before game over", async () => {
    app = createApp({ tossRng: { int: () => 0 } });
    await new Promise<void>((r) => app.http.listen(0, r));
    const url = `http://localhost:${(app.http.address() as AddressInfo).port}`;
    const client = async () => {
      const c: Socket<ServerToClientEvents, ClientToServerEvents> = connect(url, { transports: ['websocket'], forceNew: true });
      clients.push(c);
      await new Promise<void>((r) => c.once('connect', () => r()));
      return c;
    };
    const [a, b] = [await client(), await client()];
    const call = <T,>(c: Socket, ev: string, p: unknown) => new Promise<Ack<T>>((r) => c.emit(ev, p, r));
    const seen: { event: string; payload: unknown; over: boolean }[] = [];
    let over = false;
    b.onAny((event, payload) => {
      if (event === 'game_over') over = true;
      seen.push({ event, payload, over });
    });

    const created = await call<{ gameId: string }>(a as unknown as Socket, 'create_game', { mode: 'pvp', displayName: 'A', color: 'w', rules: { modes: ['side_bets', 'odds_market', 'all_in'] } });
    if (!created.ok) throw new Error();
    const gameId = created.data.gameId;
    await call(b as unknown as Socket, 'join_game', { gameId, displayName: 'B' });
    for (const [i, kind] of (['opp_toss_upset', 'opp_all_in_bust', 'game_length_over'] as const).entries()) {
      expect((await call(a as unknown as Socket, 'place_bet', { gameId, clientBetId: `k${i}`, kind, stake: 5 })).ok).toBe(true);
    }
    // B's own requests while bets are sealed.
    const state = await call<{ session: GameSession }>(b as unknown as Socket, 'request_state', { gameId });
    expect(state.ok && state.data.session.modeState.bets?.w).toEqual({ count: 3 });

    await call(a as unknown as Socket, 'submit_moves', { gameId, turnNumber: 1, clientSubmissionId: 's1', moveA: m('e2e4'), moveB: m('d2d4') });
    await call(a as unknown as Socket, 'resign', { gameId });
    await new Promise((r) => setTimeout(r, 50));

    const before = seen.filter((e) => !e.over);
    expect(before.length).toBeGreaterThan(3);
    expect(JSON.stringify(before)).not.toMatch(/opp_toss_upset|opp_all_in_bust|game_length_over/);
    expect(before.some((e) => e.event === 'bet_placed')).toBe(false);
    const revealed = seen.find((e) => e.event === 'bets_revealed');
    expect(JSON.stringify(revealed)).toContain('opp_toss_upset');
  });
});
