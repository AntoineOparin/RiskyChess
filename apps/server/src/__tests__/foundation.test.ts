import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Color, GameRules, GameSession, MoveInput, PropBet, ServerToClientEvents } from '@risky-chess/shared';
import { MODE_REGISTRY, seededRng, type ModeModule, type Rng } from '@risky-chess/engine';
import { GameManager, type Emit, type EmitTo } from '../game/GameManager';
import { InMemoryGameStore } from '../game/GameStore';
import { viewFor } from '../game/redact';

type Event = { event: keyof ServerToClientEvents; payload: unknown; to?: Color };

const m = (lan: string): MoveInput => ({ from: lan.slice(0, 2), to: lan.slice(2, 4) }) as MoveInput;
const flush = () => Promise.resolve();
const HIGH_ROLLER: GameRules = { modes: ['loaded_dice', 'odds_market', 'all_in', 'side_bets'] };
let n = 0;

function setup(tossRng: Rng = seededRng(1)) {
  const events: Event[] = [];
  const emit: Emit = (_g, event, ...args) => events.push({ event, payload: args[0] });
  const emitTo: EmitTo = (_g, to, event, ...args) => events.push({ event, payload: args[0], to });
  const store = new InMemoryGameStore();
  const manager = new GameManager(store, emit, { tossRng, rng: seededRng(3), botThinkMs: { min: 10, max: 10 } }, emitTo);
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

describe('rules and wallet', () => {
  it('defaults to classic with no wallet', async () => {
    const t = setup();
    const id = await pvp(t);
    expect(t.state(id)).toMatchObject({ rules: { modes: [] }, modeState: {} });
    expect(t.state(id).wallet).toBeUndefined();
  });

  it('creates a High Roller game with 100 chips each', async () => {
    const t = setup();
    const id = await pvp(t, HIGH_ROLLER);
    expect(t.state(id)).toMatchObject({ rules: HIGH_ROLLER, wallet: { w: 100, b: 100 } });
    const started = t.events.filter((e) => e.event === 'game_started');
    expect(started.map((e) => [e.to, (e.payload as GameSession).wallet])).toEqual([
      ['w', { w: 100, b: 100 }],
      ['b', { w: 100, b: 100 }],
    ]);
  });

  it('credits capture income and reports walletAfter', async () => {
    const t = setup({ int: () => 0 }); // every roll lands on A
    const id = await pvp(t, { modes: ['loaded_dice'] });
    t.submit(id, 'w', 'e2e4', 'd2d4');
    t.submit(id, 'b', 'd7d5', 'a7a6');
    expect(t.submit(id, 'w', 'e4d5', 'a2a3').ok).toBe(true);
    const last = t.state(id).history.at(-1)!;
    expect(last.walletAfter).toEqual({ w: 101, b: 100 });
    expect(t.state(id).wallet).toEqual({ w: 101, b: 100 });
  });

  it('rejects mode extras in a classic game', async () => {
    const t = setup();
    const id = await pvp(t);
    expect(t.submit(id, 'w', 'e2e4', 'd2d4', { stake: 4, favor: 'A' })).toMatchObject({ ok: false, error: 'MODE_DISABLED' });
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
    const id = await pvp(t, { modes: ['all_in'] });
    expect(t.submit(id, 'w', 'e2e4', 'd2d4').ok).toBe(true);
    expect(t.state(id)).toMatchObject({ turn: 'w', turnNumber: 2 });
    expect(t.submit(id, 'b', 'e7e5', 'd7d5')).toMatchObject({ error: 'NOT_YOUR_TURN' });
    expect(t.submit(id, 'w', 'g1f3', 'b1c3').ok).toBe(true);
  });
});

describe('redaction', () => {
  const bet: PropBet = { id: 'b1', kind: 'opp_promotes', params: {}, stake: 5, payoutX100: 400, placedAtTurn: 1, status: 'open' };

  it("seals the opponent's bets in every view until game over", async () => {
    const t = setup();
    const id = await pvp(t, HIGH_ROLLER);
    t.store.get(id)!.session.modeState = { bets: { w: [bet], b: [] } };

    const forB = t.manager.getState(id, 'b');
    const forW = t.manager.getState(id, 'w');
    expect(forB.ok && forB.data.session.modeState.bets).toEqual({ w: { count: 1 }, b: [] });
    expect(forW.ok && forW.data.session.modeState.bets).toEqual({ w: [bet], b: { count: 0 } });
    expect(JSON.stringify(forB)).not.toContain('opp_promotes');

    const rejoined = t.manager.rejoin({ gameId: id, playerToken: t.store.get(id)!.tokens.b! }, 'cb2');
    expect(JSON.stringify(rejoined)).not.toContain('opp_promotes');
    // The stored session itself is untouched.
    expect(t.state(id).modeState.bets?.w).toEqual([bet]);

    t.manager.resign(id, 'b');
    const after = t.manager.getState(id, 'b');
    // Unsealed at game over (and settled: nobody promoted).
    expect(after.ok && after.data.session.modeState.bets?.w).toEqual([{ ...bet, status: 'lost' }]);
  });

  it('is a deep copy', () => {
    const s = { status: 'awaiting_submission', modeState: { bets: { w: [bet] } } } as unknown as GameSession;
    const v = viewFor(s, 'w');
    (v.modeState.bets!.w as PropBet[])[0]!.stake = 99;
    expect((s.modeState.bets!.w as PropBet[])[0]!.stake).toBe(5);
  });
});

describe('side bets gating', () => {
  it('rejects place_bet with MODE_DISABLED unless Side Bets is on', async () => {
    const t = setup();
    const classic = await pvp(t);
    expect(t.manager.placeBet('w', { gameId: classic, clientBetId: 'x', kind: 'opp_promotes', stake: 5 })).toMatchObject({ ok: false, error: 'MODE_DISABLED' });
    const high = await pvp(t, HIGH_ROLLER);
    expect(t.manager.placeBet('w', { gameId: high, clientBetId: 'x', kind: 'opp_promotes', stake: 5 }).ok).toBe(true);
  });
});

describe('bot under every mode', () => {
  it('plays High Roller games against itself without errors', async () => {
    const t = setup(seededRng(8));
    const res = t.manager.create({ mode: 'bot', displayName: 'Ann', color: 'w', rules: HIGH_ROLLER }, 'c');
    if (!res.ok) throw new Error();
    await flush();
    const id = res.data.gameId;
    expect(t.events.filter((e) => e.event === 'game_started').map((e) => e.to)).toEqual(['w']);
    t.submit(id, 'w', 'e2e4', 'd2d4');
    vi.advanceTimersByTime(10);
    expect(t.state(id)).toMatchObject({ turn: 'w', turnNumber: 3 });
  });
});
