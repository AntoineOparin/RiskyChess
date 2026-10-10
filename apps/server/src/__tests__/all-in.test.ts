import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import type { Socket } from 'socket.io-client';
import type { Ack, ClientToServerEvents, MoveInput, ServerToClientEvents, TurnResult, TurnStartedPayload } from '@risky-chess/shared';
import { createApp, type App } from '../app';
import { connectTo } from './helpers';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;
const m = (lan: string): MoveInput => ({ from: lan.slice(0, 2), to: lan.slice(2, 4) }) as MoveInput;

let app: App;
let url: string;
const clients: Client[] = [];
afterEach(async () => {
  clients.splice(0).forEach((c) => c.disconnect());
  await app.close();
});

async function start(tossRng?: { int: (n: number) => number }) {
  app = createApp(tossRng ? { tossRng } : {});
  await new Promise<void>((r) => app.http.listen(0, r));
  url = `http://localhost:${(app.http.address() as AddressInfo).port}`;
  const client = async () => {
    const c = await connectTo(url);
    clients.push(c);
    return c;
  };
  const [a, b] = [await client(), await client()];
  const call = <T,>(c: Client, ev: string, p: unknown) => new Promise<Ack<T>>((r) => (c as unknown as Socket).emit(ev, p, r));
  const created = await call<{ gameId: string }>(a, 'create_game', { mode: 'pvp', displayName: 'A', color: 'w', rules: { modes: ['all_in'] } });
  if (!created.ok) throw new Error(created.message);
  const gameId = created.data.gameId;
  const started = new Promise((r) => b.once('game_started', r));
  await call(b, 'join_game', { gameId, displayName: 'B' });
  await started;
  const turns: TurnStartedPayload[] = [];
  const results: TurnResult[] = [];
  b.on('turn_started', (p) => turns.push(p));
  b.on('turn_resolved', (r) => results.push(r));
  let n = 0;
  const play = async (c: Client, turnNumber: number, a1: string, b1: string | null, extras?: object) => {
    const before = results.length;
    const ack = await call(c, 'submit_moves', { gameId, turnNumber, clientSubmissionId: `x${++n}`, moveA: m(a1), moveB: b1 ? m(b1) : null, ...(extras ? { extras } : {}) });
    if (ack.ok) while (results.length === before || turns.length < results.length) await new Promise((r) => setTimeout(r, 5));
    return ack;
  };
  return { a, b, gameId, turns, results, play };
}

describe('All-In over sockets', () => {
  it('lets the same seat move twice after a won All-In', async () => {
    const g = await start({ int: () => 0 }); // every coin lands on A: the All-In wins
    await g.play(g.a, 1, 'e2e4', 'd2d4');
    await g.play(g.b, 2, 'd7d5', 'a7a6');
    expect((await g.play(g.a, 3, 'e4d5', null, { allIn: true })).ok).toBe(true);
    expect(g.results.at(-1)!.effects).toContainEqual({ kind: 'all_in', color: 'w', won: true, piece: 'p', square: 'e4', bonusPly: true });
    expect(g.turns.at(-1)).toMatchObject({ turnNumber: 4, turn: 'w' });

    expect(await g.play(g.b, 4, 'e7e5', 'a6a5')).toMatchObject({ ok: false, error: 'NOT_YOUR_TURN' });
    expect((await g.play(g.a, 4, 'g1f3', 'b1c3')).ok).toBe(true);
    expect(g.turns.at(-1)).toMatchObject({ turnNumber: 5, turn: 'b' });
    // White's capture and bonus ply share move 2; Black answers at move 2.
    expect(g.results.at(-1)!.fenAfter.split(' ').slice(1)).toEqual(['b', 'KQkq', '-', '1', '2']);
  });

  it('removes the piece and passes the turn on a bust', async () => {
    const rolls = [0, 0, 9999]; // A, A, then the All-In busts
    const g = await start({ int: () => rolls.shift() ?? 0 });
    await g.play(g.a, 1, 'e2e4', 'd2d4');
    await g.play(g.b, 2, 'd7d5', 'a7a6');
    expect((await g.play(g.a, 3, 'e4d5', null, { allIn: true })).ok).toBe(true);
    const bust = g.results.at(-1)!;
    expect(bust.fenAfter).toBe('rnbqkbnr/ppp1pppp/8/3p4/8/8/PPPP1PPP/RNBQKBNR b KQkq - 0 2');
    expect(bust.odds).toEqual({ A: 5000 });
    expect(g.turns.at(-1)).toMatchObject({ turnNumber: 4, turn: 'b' });
    // The pawn type is spent for White.
    await g.play(g.b, 4, 'a6a5', 'h7h6');
    expect(await g.play(g.a, 5, 'd2d4', 'g1f3', { allIn: true })).toMatchObject({ ok: false });
  });
});
