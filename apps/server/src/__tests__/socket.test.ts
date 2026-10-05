import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import type { Ack, ClientToServerEvents, GameOutcome, MoveInput, ServerToClientEvents, TurnResult } from '@risky-chess/shared';
import { createApp, type App } from '../app';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

const m = (lan: string): MoveInput => ({ from: lan.slice(0, 2), to: lan.slice(2, 4) }) as MoveInput;

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

async function client(): Promise<Client> {
  const c: Client = connect(url, { transports: ['websocket'], forceNew: true });
  clients.push(c);
  await new Promise<void>((r) => c.once('connect', () => r()));
  return c;
}

function call<T>(fn: (ack: (r: Ack<T>) => void) => void): Promise<Ack<T>> {
  return new Promise((r) => fn(r));
}
const next = <E extends keyof ServerToClientEvents>(c: Client, e: E) =>
  new Promise<Parameters<ServerToClientEvents[E]>[0]>((r) => (c as unknown as Socket).once(e as string, r));

describe('socket integration', () => {
  it('plays a full pvp game to checkmate', async () => {
    const [a, b] = [await client(), await client()];
    const created = await call<{ gameId: string }>((ack) => a.emit('create_game', { mode: 'pvp', displayName: 'Ann', color: 'w' }, ack as never));
    if (!created.ok) throw new Error(created.message);
    const gameId = created.data.gameId;

    const started = next(a, 'game_started');
    expect((await call((ack) => b.emit('join_game', { gameId, displayName: 'Bo' }, ack as never))).ok).toBe(true);
    await started;

    const plies: [Client, string, string][] = [
      [a, 'f2f3', 'a2a3'],
      [b, 'e7e5', 'a7a6'],
      [a, 'g2g4', 'a2a3'],
      [b, 'd8h4', 'a7a6'],
    ];
    const over = next(b, 'game_over');
    let resolved: TurnResult | undefined;
    for (const [i, [c, x, y]] of plies.entries()) {
      const r = next(a, 'turn_resolved');
      const ack = await call((cb) =>
        c.emit('submit_moves', { gameId, turnNumber: i + 1, clientSubmissionId: `t${i}`, moveA: m(x), moveB: m(y) }, cb as never),
      );
      expect(ack.ok).toBe(true);
      resolved = await r;
    }
    expect(resolved?.executed.san).toBe('Qh4#');
    expect(((await over) as { outcome: GameOutcome }).outcome).toEqual({ kind: 'checkmate', winner: 'b' });
  });

  it('rejects malformed payloads and unseated sockets', async () => {
    const a = await client();
    const bad = await call((ack) => a.emit('create_game', { mode: 'chaos' } as never, ack as never));
    expect(bad).toMatchObject({ ok: false, error: 'INVALID_PAYLOAD' });
    const unseated = await call((ack) =>
      a.emit('submit_moves', { gameId: 'ABC', turnNumber: 1, clientSubmissionId: 'x', moveA: m('e2e4'), moveB: m('d2d4') }, ack as never),
    );
    expect(unseated).toMatchObject({ ok: false, error: 'UNAUTHORIZED' });
  });

  it('lets a dropped player rejoin by token and keep playing', async () => {
    const [a, b] = [await client(), await client()];
    const created = await call<{ gameId: string; playerToken: string }>((ack) =>
      a.emit('create_game', { mode: 'pvp', displayName: 'Ann', color: 'w' }, ack as never),
    );
    if (!created.ok) throw new Error();
    const { gameId, playerToken } = created.data;
    await call((ack) => b.emit('join_game', { gameId, displayName: 'Bo' }, ack as never));

    const dropped = next(b, 'opponent_disconnected');
    a.disconnect();
    expect(await dropped).toMatchObject({ color: 'w' });

    const a2 = await client();
    const back = next(b, 'opponent_reconnected');
    const rejoined = await call<{ session: { status: string } }>((ack) => a2.emit('rejoin_game', { gameId, playerToken }, ack as never));
    expect(rejoined.ok && rejoined.data.session.status).toBe('awaiting_submission');
    await back;

    const ack = await call((cb) =>
      a2.emit('submit_moves', { gameId, turnNumber: 1, clientSubmissionId: 'r1', moveA: m('e2e4'), moveB: m('d2d4') }, cb as never),
    );
    expect(ack.ok).toBe(true);
  });
});
