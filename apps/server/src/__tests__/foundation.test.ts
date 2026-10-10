import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ALL_IN_RULES, type Color, type GameRules, type MoveInput, type ServerToClientEvents } from '@risky-chess/shared';
import { MODE_REGISTRY, seededRng, type ModeModule, type Rng } from '@risky-chess/engine';
import { GameManager, type Emit } from '../game/GameManager';
import { InMemoryGameStore } from '../game/GameStore';

type Event = { event: keyof ServerToClientEvents; payload: unknown };

const m = (lan: string): MoveInput => ({ from: lan.slice(0, 2), to: lan.slice(2, 4) }) as MoveInput;
const flush = () => Promise.resolve();
let n = 0;

function setup(tossRng: Rng = seededRng(1)) {
  const events: Event[] = [];
  const emit: Emit = (_g, event, ...args) => events.push({ event, payload: args[0] });
  const store = new InMemoryGameStore();
  const manager = new GameManager(store, emit, { tossRng, rng: seededRng(3), botThinkMs: { min: 10, max: 10 } });
  const state = (id: string) => {
    const r = manager.getState(id);
    if (!r.ok) throw new Error(r.message);
    return r.data.session;
  };
  const submit = (id: string, color: Color, a: string, b: string | null, extras?: object) =>
    manager.submit(color, { gameId: id, turnNumber: state(id).turnNumber, clientSubmissionId: `f${++n}`, moveA: m(a), moveB: b ? m(b) : null, ...(extras ? { extras } : {}) });
  return { manager, store, events, state, submit };
}

async function pvp(t: ReturnType<typeof setup>, rules?: GameRules) {
  const w = t.manager.create({ mode: 'pvp', displayName: 'Ann', color: 'w', ...(rules ? { rules } : {}) }, 'cw');
  if (!w.ok) throw new Error();
  const b = t.manager.join({ gameId: w.data.gameId, displayName: 'Bo' }, 'cb');
  if (!b.ok) throw new Error();
  await flush();
  return w.data.gameId;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('rules', () => {
  it('defaults to classic', async () => {
    const t = setup();
    const id = await pvp(t);
    expect(t.state(id)).toMatchObject({ rules: { modes: [] }, modeState: {} });
  });

  it('creates an All-In game and announces it to the room', async () => {
    const t = setup();
    const id = await pvp(t, ALL_IN_RULES);
    expect(t.state(id)).toMatchObject({ rules: ALL_IN_RULES });
    expect(t.events.filter((e) => e.event === 'game_started')).toHaveLength(1);
  });

  it('rejects an All-In declaration in a classic game', async () => {
    const t = setup();
    const id = await pvp(t);
    expect(t.submit(id, 'w', 'e2e4', null, { allIn: true })).toMatchObject({ ok: false, error: 'MODE_DISABLED' });
    expect(t.state(id).turnNumber).toBe(1);
  });
});

describe('classic parity', () => {
  it('rolls 0–9999 with the injected rng and plays the slot it lands on', async () => {
    const rolls = [7000, 1200];
    const t = setup({ int: (max) => (max === 10_000 ? rolls.shift()! : 0) });
    const id = await pvp(t);
    t.submit(id, 'w', 'e2e4', 'd2d4');
    t.submit(id, 'b', 'e7e5', 'd7d5');
    const [h1, h2] = t.state(id).history;
    expect(h1).toMatchObject({ odds: { A: 5000 }, coin: { chosen: 'B', roll: 7000, method: 'crypto.randomInt' }, executed: { lan: 'd2d4' }, effects: [] });
    expect(h2).toMatchObject({ coin: { chosen: 'A', roll: 1200 }, executed: { lan: 'e7e5' } });
    expect(t.state(id)).toMatchObject({ turn: 'w', turnNumber: 3 });
  });
});

describe('turn order', () => {
  const saved = { ...MODE_REGISTRY };
  afterEach(() => Object.assign(MODE_REGISTRY, saved));

  it('derives the side to move from the resulting FEN, never by flipping', async () => {
    // A stand-in module that hands the mover a bonus ply: same position, same side to move.
    MODE_REGISTRY.all_in = { id: 'all_in', apply: (ctx) => ({ executed: ctx.moveA, fenAfter: ctx.fen.replace(' w ', ' w ') }) } satisfies ModeModule;
    const t = setup();
    const id = await pvp(t, ALL_IN_RULES);
    expect(t.submit(id, 'w', 'e2e4', 'd2d4').ok).toBe(true);
    expect(t.state(id)).toMatchObject({ turn: 'w', turnNumber: 2 });
    expect(t.submit(id, 'b', 'e7e5', 'd7d5')).toMatchObject({ error: 'NOT_YOUR_TURN' });
    expect(t.submit(id, 'w', 'g1f3', 'b1c3').ok).toBe(true);
  });
});

describe('bot', () => {
  it('plays an All-In game without errors', async () => {
    const t = setup(seededRng(8));
    const res = t.manager.create({ mode: 'bot', displayName: 'Ann', color: 'w', rules: ALL_IN_RULES }, 'c');
    if (!res.ok) throw new Error();
    await flush();
    const id = res.data.gameId;
    t.submit(id, 'w', 'e2e4', 'd2d4');
    vi.advanceTimersByTime(10);
    expect(t.state(id)).toMatchObject({ turn: 'w', turnNumber: 3 });
  });
});
