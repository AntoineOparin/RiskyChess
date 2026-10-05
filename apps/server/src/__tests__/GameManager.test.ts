import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Color, MoveInput, MoveSubmission, ServerToClientEvents } from '@risky-chess/shared';
import { seededRng } from '@risky-chess/engine';
import { GameManager, type Emit, type EmitTo, type GameManagerOptions } from '../game/GameManager';
import { InMemoryGameStore } from '../game/GameStore';

/** `to` is set for events sent to one seat's private channel. */
type Event = { gameId: string; event: keyof ServerToClientEvents; payload: unknown; to?: Color };

const m = (lan: string): MoveInput => ({ from: lan.slice(0, 2), to: lan.slice(2, 4) }) as MoveInput;
const flush = () => Promise.resolve();
let subCounter = 0;

function setup(opts: Partial<GameManagerOptions> = {}) {
  const events: Event[] = [];
  const emit: Emit = (gameId, event, ...args) => events.push({ gameId, event, payload: args[0] });
  const emitTo: EmitTo = (gameId, to, event, ...args) => events.push({ gameId, event, payload: args[0], to });
  const store = new InMemoryGameStore();
  const manager = new GameManager(
    store,
    emit,
    {
      tosser: () => ({ chosen: 'A', method: 'local' }),
      rng: seededRng(3),
      botThinkMs: { min: 10, max: 10 },
      ...opts,
    },
    emitTo,
  );
  const of = (name: keyof ServerToClientEvents) => events.filter((e) => e.event === name);
  const state = (id: string) => {
    const r = manager.getState(id);
    if (!r.ok) throw new Error(r.message);
    return r.data.session;
  };
  const sub = (gameId: string, turnNumber: number, a: string, b: string | null, id = `s${++subCounter}`): MoveSubmission => ({
    gameId,
    turnNumber,
    clientSubmissionId: id,
    moveA: m(a),
    moveB: b ? m(b) : null,
  });
  return { manager, store, events, of, state, sub };
}

async function startPvp(t: ReturnType<typeof setup>) {
  const w = t.manager.create({ mode: 'pvp', displayName: 'Ann', color: 'w' }, 'conn-w');
  if (!w.ok) throw new Error('create failed');
  const b = t.manager.join({ gameId: w.data.gameId, displayName: 'Bo' }, 'conn-b');
  if (!b.ok) throw new Error('join failed');
  await flush();
  return { id: w.data.gameId, w: w.data, b: b.data };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('lobby', () => {
  it('starts a pvp game once the second player joins', async () => {
    const t = setup();
    const g = await startPvp(t);
    expect(g.b.color).toBe('b');
    expect(t.state(g.id).status).toBe('awaiting_submission');
    expect(t.of('game_started').map((e) => e.to)).toEqual(['w', 'b']);
    expect(t.of('turn_started')[0]?.payload).toMatchObject({ turnNumber: 1, turn: 'w' });
  });

  it('rejects a third player and unknown codes', async () => {
    const t = setup();
    const g = await startPvp(t);
    expect(t.manager.join({ gameId: g.id, displayName: 'Cy' }, 'c3')).toMatchObject({ ok: false, error: 'GAME_FULL' });
    expect(t.manager.join({ gameId: 'NOPE', displayName: 'Cy' }, 'c3')).toMatchObject({ ok: false, error: 'GAME_NOT_FOUND' });
  });
});

describe('submissions', () => {
  it('resolves a turn and hands the move to the opponent', async () => {
    const t = setup();
    const g = await startPvp(t);
    expect(t.manager.submit('w', t.sub(g.id, 1, 'e2e4', 'd2d4'))).toEqual({ ok: true, data: { accepted: true } });
    const s = t.state(g.id);
    expect(s).toMatchObject({ turn: 'b', turnNumber: 2 });
    expect(s.history[0]?.executed.lan).toBe('e2e4');
    expect(t.of('turn_resolved')).toHaveLength(1);
  });

  it('enforces turn order, turn number, and move rules', async () => {
    const t = setup();
    const g = await startPvp(t);
    expect(t.manager.submit('b', t.sub(g.id, 1, 'e7e5', 'd7d5'))).toMatchObject({ error: 'NOT_YOUR_TURN' });
    expect(t.manager.submit('w', t.sub(g.id, 2, 'e2e4', 'd2d4'))).toMatchObject({ error: 'STALE_TURN' });
    expect(t.manager.submit('w', t.sub(g.id, 1, 'e2e4', 'e2e4'))).toMatchObject({ error: 'DUPLICATE_MOVES' });
    expect(t.manager.submit('w', t.sub(g.id, 1, 'e2e4', null))).toMatchObject({ error: 'PAIR_REQUIRED' });
  });

  it('is idempotent per clientSubmissionId', async () => {
    const t = setup();
    const g = await startPvp(t);
    const s = t.sub(g.id, 1, 'e2e4', 'd2d4', 'retry-me');
    expect(t.manager.submit('w', s).ok).toBe(true);
    expect(t.manager.submit('w', s).ok).toBe(true);
    expect(t.state(g.id).history).toHaveLength(1);
    expect(t.of('turn_resolved')).toHaveLength(1);
  });

  it('ends the game on checkmate after the toss', async () => {
    const t = setup();
    const g = await startPvp(t);
    // Fool's mate; Move A always executes with this tosser.
    t.manager.submit('w', t.sub(g.id, 1, 'f2f3', 'a2a3'));
    t.manager.submit('b', t.sub(g.id, 2, 'e7e5', 'a7a6'));
    t.manager.submit('w', t.sub(g.id, 3, 'g2g4', 'a2a3'));
    t.manager.submit('b', t.sub(g.id, 4, 'd8h4', 'a7a6'));
    expect(t.state(g.id)).toMatchObject({ status: 'finished', outcome: { kind: 'checkmate', winner: 'b' } });
    expect(t.of('game_over')).toHaveLength(1);
    expect(t.manager.submit('w', t.sub(g.id, 5, 'a3a4', 'b2b3'))).toMatchObject({ error: 'GAME_OVER' });
  });

  it('handles resignation', async () => {
    const t = setup();
    const g = await startPvp(t);
    t.manager.resign(g.id, 'w');
    expect(t.state(g.id).outcome).toEqual({ kind: 'resign', winner: 'b' });
  });
});

describe('disconnections', () => {
  it('pauses when the mover drops and resumes on rejoin within grace', async () => {
    const t = setup();
    const g = await startPvp(t);
    t.manager.disconnect(g.id, 'w', 'conn-w');
    expect(t.state(g.id).status).toBe('paused_disconnect');
    expect(t.of('opponent_disconnected')[0]?.payload).toMatchObject({ color: 'w' });

    vi.advanceTimersByTime(30_000);
    expect(t.manager.rejoin({ gameId: g.id, playerToken: g.w.playerToken }, 'conn-w2').ok).toBe(true);
    expect(t.state(g.id).status).toBe('awaiting_submission');
    expect(t.of('opponent_reconnected')).toHaveLength(1);

    vi.advanceTimersByTime(60_000);
    expect(t.state(g.id).status).toBe('awaiting_submission');
  });

  it('forfeits by abandonment when grace expires', async () => {
    const t = setup();
    const g = await startPvp(t);
    t.manager.disconnect(g.id, 'w', 'conn-w');
    vi.advanceTimersByTime(60_001);
    expect(t.state(g.id)).toMatchObject({ status: 'finished', outcome: { kind: 'abandon', winner: 'b' } });
  });

  it('keeps playing when the waiting player drops, then pauses on their turn', async () => {
    const t = setup();
    const g = await startPvp(t);
    t.manager.disconnect(g.id, 'b', 'conn-b');
    expect(t.state(g.id).status).toBe('awaiting_submission');
    expect(t.manager.submit('w', t.sub(g.id, 1, 'e2e4', 'd2d4')).ok).toBe(true);
    const s = t.state(g.id);
    expect(s.status).toBe('paused_disconnect');
    expect(s.graceEndsAt).toBeGreaterThan(Date.now());
    vi.advanceTimersByTime(60_001);
    expect(t.state(g.id).outcome).toEqual({ kind: 'abandon', winner: 'w' });
  });

  it('awards the game against the mover when both players are gone', async () => {
    const t = setup();
    const g = await startPvp(t);
    t.manager.disconnect(g.id, 'b', 'conn-b');
    vi.advanceTimersByTime(1_000);
    t.manager.disconnect(g.id, 'w', 'conn-w');
    vi.advanceTimersByTime(60_001);
    expect(t.state(g.id).outcome).toEqual({ kind: 'abandon', winner: 'b' });
  });

  it('ignores a stale socket disconnecting after the player rebound', async () => {
    const t = setup();
    const g = await startPvp(t);
    t.manager.rejoin({ gameId: g.id, playerToken: g.w.playerToken }, 'conn-w2');
    t.manager.disconnect(g.id, 'w', 'conn-w');
    expect(t.state(g.id).players.w?.connected).toBe(true);
    expect(t.of('opponent_disconnected')).toHaveLength(0);
  });

  it('rejects rejoin with a bad token', async () => {
    const t = setup();
    const g = await startPvp(t);
    expect(t.manager.rejoin({ gameId: g.id, playerToken: 'nope' }, 'x')).toMatchObject({ error: 'UNAUTHORIZED' });
  });
});

describe('bot games', () => {
  it('responds to the human after thinking', async () => {
    const t = setup();
    const res = t.manager.create({ mode: 'bot', displayName: 'Ann', color: 'w' }, 'conn');
    if (!res.ok) throw new Error();
    await flush();
    t.manager.submit('w', t.sub(res.data.gameId, 1, 'e2e4', 'd2d4'));
    expect(t.state(res.data.gameId).turn).toBe('b');
    vi.advanceTimersByTime(10);
    expect(t.state(res.data.gameId)).toMatchObject({ turn: 'w', turnNumber: 3 });
  });

  it('moves first when playing white', async () => {
    const t = setup();
    const res = t.manager.create({ mode: 'bot', displayName: 'Ann', color: 'b' }, 'conn');
    if (!res.ok) throw new Error();
    await flush();
    vi.advanceTimersByTime(10);
    expect(t.state(res.data.gameId)).toMatchObject({ turn: 'b', turnNumber: 2 });
  });

  it('never forfeits on disconnect', async () => {
    const t = setup();
    const res = t.manager.create({ mode: 'bot', displayName: 'Ann', color: 'w' }, 'conn');
    if (!res.ok) throw new Error();
    await flush();
    t.manager.disconnect(res.data.gameId, 'w', 'conn');
    vi.advanceTimersByTime(10 * 60_000);
    expect(t.state(res.data.gameId).status).toBe('paused_disconnect');
  });
});
