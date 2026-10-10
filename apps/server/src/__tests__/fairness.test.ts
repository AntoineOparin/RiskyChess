import type { AddressInfo } from 'node:net';
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { connectTo } from './helpers';
import type { Socket } from 'socket.io-client';
import type { ClientToServerEvents, MoveInput, ServerToClientEvents, TurnResult, TurnStartedPayload } from '@risky-chess/shared';
import { seededRng, verifyToss } from '@risky-chess/engine';
import { createApp, type App } from '../app';
import { GameManager, type Emit } from '../game/GameManager';
import { InMemoryGameStore } from '../game/GameStore';

const m = (lan: string): MoveInput => ({ from: lan.slice(0, 2), to: lan.slice(2, 4) }) as MoveInput;
const sha = (hex: string) => createHash('sha256').update(Buffer.from(hex, 'hex')).digest('hex');
const flush = () => Promise.resolve();

describe('commit-reveal tosses (manager)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup() {
    const events: { event: keyof ServerToClientEvents; payload: unknown }[] = [];
    const emit: Emit = (_g, event, ...args) => events.push({ event, payload: args[0] });
    const store = new InMemoryGameStore();
    const manager = new GameManager(store, emit, { rng: seededRng(3), botThinkMs: { min: 10, max: 10 } });
    const started = () => events.filter((e) => e.event === 'turn_started').map((e) => e.payload as TurnStartedPayload);
    const resolved = () => events.filter((e) => e.event === 'turn_resolved').map((e) => e.payload as TurnResult);
    return { manager, store, started, resolved };
  }

  it('publishes sha256(seed) before the turn and reveals a verifiable seed after it', async () => {
    const t = setup();
    const w = t.manager.create({ mode: 'pvp', displayName: 'A', color: 'w' }, 'cw');
    if (!w.ok) throw new Error();
    const id = w.data.gameId;
    t.manager.join({ gameId: id, displayName: 'B' }, 'cb');
    await flush();

    const commitment = t.started()[0]?.commitment;
    expect(commitment).toMatch(/^[0-9a-f]{64}$/);
    // The secret stays server-side until the reveal.
    const record = t.store.get(id)!;
    expect(sha(record.turnSeeds.get(1)!)).toBe(commitment);
    expect(record.session.pendingCommitment).toBe(commitment);

    t.manager.submit('w', { gameId: id, turnNumber: 1, clientSubmissionId: 's1', moveA: m('e2e4'), moveB: m('d2d4'), extras: { clientSeed: 'a1b2c3d4e5f60718' } });
    const r = t.resolved()[0]!;
    expect(r.coin).toMatchObject({ method: 'hmac-commit-reveal', commitment, clientSeed: 'a1b2c3d4e5f60718' });
    expect(sha(r.coin!.serverSeed!)).toBe(commitment);
    expect(verifyToss(r)).toEqual({ ok: true });

    // Seed deleted after reveal; the next turn has a fresh commitment.
    expect(record.turnSeeds.has(1)).toBe(false);
    const next = t.started()[1]!;
    expect(next.turnNumber).toBe(2);
    expect(next.commitment).not.toBe(commitment);
    expect(record.session.pendingCommitment).toBe(next.commitment);
  });

  it('supplies a client seed when the mover sends none, and the bot is verifiable too', async () => {
    const t = setup();
    const res = t.manager.create({ mode: 'bot', displayName: 'A', color: 'w' }, 'c');
    if (!res.ok) throw new Error();
    await flush();
    t.manager.submit('w', { gameId: res.data.gameId, turnNumber: 1, clientSubmissionId: 's', moveA: m('e2e4'), moveB: m('d2d4') });
    vi.advanceTimersByTime(10);
    const [mine, bot] = t.resolved();
    expect(mine?.coin?.clientSeed).toMatch(/^[0-9a-f]{32}$/);
    for (const r of [mine!, bot!]) expect(verifyToss(r)).toEqual({ ok: true });
  });

  it('delivers the pending commitment to a rejoining player and never the seed', async () => {
    const t = setup();
    const w = t.manager.create({ mode: 'pvp', displayName: 'A', color: 'w' }, 'cw');
    if (!w.ok) throw new Error();
    t.manager.join({ gameId: w.data.gameId, displayName: 'B' }, 'cb');
    await flush();
    t.manager.disconnect(w.data.gameId, 'w', 'cw');
    const back = t.manager.rejoin({ gameId: w.data.gameId, playerToken: w.data.playerToken }, 'cw2');
    expect(back.ok && back.data.session.pendingCommitment).toBe(t.started()[0]?.commitment);
    expect(JSON.stringify(back)).not.toContain(t.store.get(w.data.gameId)!.turnSeeds.get(1)!);
  });

  it('keeps the committed seed when a submission is rejected', async () => {
    const t = setup();
    const w = t.manager.create({ mode: 'pvp', displayName: 'A', color: 'w' }, 'cw');
    if (!w.ok) throw new Error();
    t.manager.join({ gameId: w.data.gameId, displayName: 'B' }, 'cb');
    await flush();
    const before = t.store.get(w.data.gameId)!.turnSeeds.get(1);
    t.manager.submit('w', { gameId: w.data.gameId, turnNumber: 1, clientSubmissionId: 'bad', moveA: m('e2e4'), moveB: m('e2e4') });
    expect(t.store.get(w.data.gameId)!.turnSeeds.get(1)).toBe(before);
  });
});

describe('commit-reveal tosses (sockets)', () => {
  let app: App;
  let url: string;
  const clients: Socket<ServerToClientEvents, ClientToServerEvents>[] = [];
  beforeEach(async () => {
    app = createApp();
    await new Promise<void>((r) => app.http.listen(0, r));
    url = `http://localhost:${(app.http.address() as AddressInfo).port}`;
  });
  afterEach(async () => {
    clients.splice(0).forEach((c) => c.disconnect());
    await app.close();
  });

  it('every resolved turn verifies against the commitment announced before it', async () => {
    const c = await connectTo(url);
    clients.push(c);
    const commitments = new Map<number, string>();
    const results: TurnResult[] = [];
    c.on('turn_started', (p) => p.commitment && commitments.set(p.turnNumber, p.commitment));
    c.on('turn_resolved', (r) => results.push(r));
    const created = await new Promise<{ ok: boolean; data?: { gameId: string } }>((r) =>
      c.emit('create_game', { mode: 'bot', displayName: 'A', color: 'w' }, r as never),
    );
    const gameId = created.data!.gameId;
    await new Promise((r) => setTimeout(r, 20));
    await new Promise((r) => c.emit('submit_moves', { gameId, turnNumber: 1, clientSubmissionId: 'x', moveA: m('e2e4'), moveB: m('d2d4'), extras: { clientSeed: 'feedfacecafebeef' } }, r as never));
    while (results.length < 2) await new Promise((r) => setTimeout(r, 50));
    for (const r of results) {
      expect(r.coin?.commitment).toBe(commitments.get(r.turnNumber));
      expect(verifyToss(r)).toEqual({ ok: true });
    }
  }, 10_000);
});
