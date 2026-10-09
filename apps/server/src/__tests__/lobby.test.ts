import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Ack, GameSession, LobbySnapshot, MatchLine } from '@risky-chess/shared';
import { createApp, type App } from '../app';
import { connectAs, type Client } from './helpers';

let app: App;
let url: string;
const clients: Client[] = [];

beforeEach(async () => {
  app = createApp({ tosser: () => ({ chosen: 'A', method: 'local' }) });
  await new Promise<void>((r) => app.http.listen(0, r));
  url = `http://localhost:${(app.http.address() as AddressInfo).port}`;
});

afterEach(async () => {
  clients.splice(0).forEach((c) => c.disconnect());
  await app.close();
});

async function client(name: string): Promise<Client> {
  const c = await connectAs(app, url, name);
  clients.push(c);
  return c;
}
const call = <T,>(c: Client, ev: string, p: unknown) => new Promise<Ack<T>>((r) => (c as unknown as { emit: (e: string, p: unknown, cb: (a: Ack<T>) => void) => void }).emit(ev, p, r));
const next = <T,>(c: Client, e: string) => new Promise<T>((r) => (c as unknown as { once: (e: string, cb: (p: T) => void) => void }).once(e, r));

describe('lobby', () => {
  it('lists public open tables, not private ones, and pushes updates', async () => {
    const [a, b, c] = [await client('alice'), await client('bob'), await client('cleo')];
    const joined = await call<LobbySnapshot>(c, 'join_lobby', {});
    expect(joined.ok && joined.data).toMatchObject({ tables: [], markets: [], feed: [], online: 3 });

    const update = next<LobbySnapshot>(c, 'lobby_update');
    const pub = await call<{ gameId: string }>(a, 'create_game', { mode: 'pvp', color: 'w', buyInCents: 1_000 });
    const priv = await call<{ gameId: string }>(b, 'create_game', { mode: 'pvp', color: 'w', visibility: 'private' });
    if (!pub.ok || !priv.ok) throw new Error('create failed');
    const snap = await update;
    expect(snap.tables.map((t) => t.gameId)).toEqual([pub.data.gameId]);
    expect(snap.tables[0]).toMatchObject({ host: { username: 'alice', color: 'w' }, buyInCents: 1_000 });

    // Once joined the table becomes a market.
    const update2 = next<LobbySnapshot>(c, 'lobby_update');
    expect((await call(b, 'join_game', { gameId: pub.data.gameId })).ok).toBe(true);
    const snap2 = await update2;
    expect(snap2.tables).toEqual([]);
    expect(snap2.markets.map((m) => m.gameId)).toEqual([pub.data.gameId]);
    expect(snap2.markets[0]!.line.asOfTurn).toBe(1);

    // Leaving the room stops the updates.
    expect((await call(c, 'leave_lobby', {})).ok).toBe(true);
    const direct = app.lobby.snapshot();
    expect(direct.markets).toHaveLength(1);
  });

  it('lets a third account watch a public game with both seats sealed', async () => {
    const [a, b, c] = [await client('alice'), await client('bob'), await client('cleo')];
    const created = await call<{ gameId: string }>(a, 'create_game', { mode: 'pvp', color: 'w', rules: { modes: ['side_bets'] } });
    if (!created.ok) throw new Error();
    const { gameId } = created.data;
    await call(b, 'join_game', { gameId });
    expect((await call(a, 'place_bet', { gameId, clientBetId: 'k1', kind: 'opp_promotes', stake: 5 })).ok).toBe(true);

    const watched = await call<{ session: GameSession; line: MatchLine | null; myBets: unknown[] }>(c, 'watch_game', { gameId });
    if (!watched.ok) throw new Error(watched.message);
    expect(watched.data.session.modeState.bets?.w).toEqual({ count: 1 });
    expect(watched.data.line).not.toBeNull();
    expect(watched.data.myBets).toEqual([]);
    expect(JSON.stringify(watched.data.session)).not.toContain('opp_promotes');

    // Spectators receive the room's turns, and request_state stays sealed for them.
    const resolved = next<{ turnNumber: number }>(c, 'turn_resolved');
    const market = next<{ line: MatchLine }>(c, 'market_update');
    await call(a, 'submit_moves', { gameId, turnNumber: 1, clientSubmissionId: 's1', moveA: { from: 'e2', to: 'e4' }, moveB: { from: 'd2', to: 'd4' } });
    expect((await resolved).turnNumber).toBe(1);
    expect((await market).line.asOfTurn).toBe(2);
    const state = await call<{ session: GameSession }>(c, 'request_state', { gameId });
    expect(state.ok && state.data.session.modeState.bets?.w).toEqual({ count: 1 });

    expect((await call(c, 'leave_game', { gameId })).ok).toBe(true);
    const unseen = await call(c, 'request_state', { gameId });
    expect(unseen).toMatchObject({ ok: false, error: 'UNAUTHORIZED' });
  });

  it('refuses to watch a private table', async () => {
    const [a, c] = [await client('alice'), await client('cleo')];
    const created = await call<{ gameId: string }>(a, 'create_game', { mode: 'pvp', color: 'w', visibility: 'private' });
    if (!created.ok) throw new Error();
    expect(await call(c, 'watch_game', { gameId: created.data.gameId })).toMatchObject({ ok: false, error: 'UNAUTHORIZED' });
    expect(await call(c, 'watch_game', { gameId: 'NOPE' })).toMatchObject({ ok: false, error: 'GAME_NOT_FOUND' });
  });
});
