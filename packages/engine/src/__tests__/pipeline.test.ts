import { afterEach, describe, expect, it } from 'vitest';
import { ALL_IN_RULES, START_FEN, type GameRules, type MoveInput, type TurnResult } from '@risky-chess/shared';
import { applyModeEffects, clampOdds, MODE_REGISTRY, pickBotPair, pickBotSubmission, previewOdds, resolveTurn, seededRng, sideToMove, type ModeModule, type Rng } from '..';

const m = (lan: string): MoveInput => ({
  from: lan.slice(0, 2) as MoveInput['from'],
  to: lan.slice(2, 4) as MoveInput['to'],
  ...(lan[4] ? { promotion: lan[4] as NonNullable<MoveInput['promotion']> } : {}),
});
const base = { gameId: 'g1', turnNumber: 1, previousFens: [] as string[] };
const fixed = (n: number): Rng => ({ int: () => n });

/** Plays a scripted game (Move A always) and returns every result. */
function play(pairs: [string, string][], deps: Parameters<typeof resolveTurn>[1], rules?: GameRules) {
  const out: TurnResult[] = [];
  let fen = START_FEN;
  for (const [i, [a, b]] of pairs.entries()) {
    const r = resolveTurn({ ...base, turnNumber: i + 1, fen, previousFens: out.map((h) => h.fenBefore), moveA: m(a), moveB: m(b), ...(rules ? { rules } : {}) }, deps);
    if (!r.ok) throw new Error(r.message);
    out.push(r.result);
    fen = r.result.fenAfter;
  }
  return out;
}

const SCRIPT: [string, string][] = [
  ['e2e4', 'd2d4'],
  ['d7d5', 'a7a6'],
  ['e4d5', 'a2a3'],
  ['d8d5', 'a7a5'],
  ['b1c3', 'h2h3'],
];

describe('classic parity', () => {
  it('a forced slot reproduces the legacy tosser exactly', () => {
    const legacy = play(SCRIPT, () => ({ chosen: 'A', method: 'local' }));
    const forced = play(SCRIPT, { forceSlot: 'A', method: 'local' });
    const strip = (r: TurnResult) => ({ ...r, resolvedAt: 0 });
    expect(forced.map(strip)).toEqual(legacy.map(strip));
    for (const r of forced) {
      expect(r.odds).toEqual({ A: 5000 });
      expect(r.effects).toEqual([]);
    }
  });

  it('plays the same with All-In on when nobody declares', () => {
    const classic = play(SCRIPT, { forceSlot: 'A', method: 'local' });
    const allIn = play(SCRIPT, { forceSlot: 'A', method: 'local' }, ALL_IN_RULES);
    expect(allIn.map((r) => r.fenAfter)).toEqual(classic.map((r) => r.fenAfter));
  });

  it('rolls A below the odds and B at or above them', () => {
    const at = (roll: number) => resolveTurn({ ...base, fen: START_FEN, moveA: m('e2e4'), moveB: m('d2d4') }, { rng: fixed(roll), method: 'local' });
    expect(at(4999)).toMatchObject({ ok: true, result: { executed: { lan: 'e2e4' }, coin: { chosen: 'A', roll: 4999 } } });
    expect(at(5000)).toMatchObject({ ok: true, result: { executed: { lan: 'd2d4' }, coin: { chosen: 'B', roll: 5000 } } });
  });

  it('derives the next side to move from the FEN, which is always the other color in classic', () => {
    const rng = seededRng(11);
    let fen = START_FEN;
    const fens: string[] = [];
    for (let ply = 1; ply <= 120; ply++) {
      const r = resolveTurn({ ...base, turnNumber: ply, fen, previousFens: fens, ...pickBotPair(fen, rng) }, { rng, method: 'local' });
      if (!r.ok) throw new Error(r.message);
      expect(sideToMove(r.result.fenAfter)).toBe(r.result.mover === 'w' ? 'b' : 'w');
      fens.push(fen);
      fen = r.result.fenAfter;
      if (r.result.outcome) break;
    }
  });

  it('keeps the coin fair at 50/50', () => {
    const rng = seededRng(5);
    let a = 0;
    const n = 4000;
    for (let i = 0; i < n; i++) {
      const r = resolveTurn({ ...base, fen: START_FEN, moveA: m('e2e4'), moveB: m('d2d4') }, { rng, method: 'local' });
      if (r.ok && r.result.coin?.chosen === 'A') a++;
    }
    expect(Math.abs(a / n - 0.5)).toBeLessThan(0.03);
  });
});

describe('mode gating', () => {
  it('rejects extras for modes that are off', () => {
    const go = (extras: object) => resolveTurn({ ...base, fen: START_FEN, moveA: m('e2e4'), moveB: m('d2d4'), extras }, { forceSlot: 'A' });
    expect(go({ allIn: true })).toMatchObject({ ok: false, error: 'MODE_DISABLED' });
    expect(go({ clientSeed: 'abcdef0123' })).toMatchObject({ ok: true });
  });

  it('derives mode state from effects', () => {
    const s = applyModeEffects({}, [{ kind: 'all_in', color: 'b', won: false, piece: 'n', square: 'c6', bonusPly: false }]);
    expect(s.allInsUsed).toEqual({ w: [], b: ['n'] });
  });
});

describe('odds pipeline', () => {
  const saved = { ...MODE_REGISTRY };
  afterEach(() => Object.assign(MODE_REGISTRY, saved));

  it('clamps to 10–90%', () => {
    expect(clampOdds({ A: 9900 })).toEqual({ A: 9000 });
    expect(clampOdds({ A: 12 })).toEqual({ A: 1000 });
    expect(clampOdds({ A: 6200 })).toEqual({ A: 6200 });
  });

  it('previews a fair line for every pair', () => {
    expect(previewOdds({ ...base, fen: START_FEN, moveA: m('e2e4'), moveB: m('d2d4'), rules: ALL_IN_RULES })).toMatchObject({ ok: true, odds: { A: 5000 }, steps: [] });
  });

  it('keeps forced turns fair and untossed', () => {
    MODE_REGISTRY.all_in = { id: 'all_in', adjustOdds: () => ({ A: 9000 }) } satisfies ModeModule;
    const r = resolveTurn({ ...base, fen: 'k7/8/8/8/8/8/1q6/K7 w - - 0 1', moveA: m('a1b2'), moveB: null, rules: ALL_IN_RULES }, { rng: fixed(0), method: 'local' });
    expect(r.ok && r.result).toMatchObject({ forced: true, coin: null, odds: { A: 5000 } });
  });
});

describe('bot submissions', () => {
  it('match the classic pair when the mode adds nothing', () => {
    const fen = START_FEN;
    const state = { rules: ALL_IN_RULES, modeState: {}, history: [], fen, turnNumber: 1 };
    expect(pickBotSubmission(fen, state, seededRng(9))).toEqual(pickBotPair(fen, seededRng(9)));
  });
});
