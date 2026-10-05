import { afterEach, describe, expect, it } from 'vitest';
import { START_FEN, type GameRules, type MoveInput, type TurnResult } from '@risky-chess/shared';
import {
  applyEffects,
  applyModeEffects,
  clampOdds,
  MODE_REGISTRY,
  pickBotPair,
  pickBotSubmission,
  previewOdds,
  resolveTurn,
  seededRng,
  sideToMove,
  startingWallet,
  type ModeModule,
  type Rng,
} from '..';

const m = (lan: string): MoveInput => ({
  from: lan.slice(0, 2) as MoveInput['from'],
  to: lan.slice(2, 4) as MoveInput['to'],
  ...(lan[4] ? { promotion: lan[4] as NonNullable<MoveInput['promotion']> } : {}),
});
const base = { gameId: 'g1', turnNumber: 1, previousFens: [] as string[] };
const fixed = (n: number): Rng => ({ int: () => n });
const ALL: GameRules = { modes: ['loaded_dice', 'odds_market', 'all_in', 'side_bets'] };

/** Plays a scripted game (Move A always) and returns every result. */
function play(pairs: [string, string][], deps: Parameters<typeof resolveTurn>[1], rules?: GameRules) {
  const out: TurnResult[] = [];
  let fen = START_FEN;
  let wallet = rules ? startingWallet(rules) : undefined;
  for (const [i, [a, b]] of pairs.entries()) {
    const r = resolveTurn(
      { ...base, turnNumber: i + 1, fen, previousFens: out.map((h) => h.fenBefore), moveA: m(a), moveB: m(b), ...(rules ? { rules } : {}), ...(wallet ? { wallet } : {}) },
      deps,
    );
    if (!r.ok) throw new Error(r.message);
    out.push(r.result);
    fen = r.result.fenAfter;
    wallet = r.result.walletAfter;
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
      expect(r.walletAfter).toBeUndefined();
    }
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
    expect(go({ stake: 4, favor: 'A' })).toMatchObject({ ok: false, error: 'MODE_DISABLED' });
    expect(go({ allIn: true })).toMatchObject({ ok: false, error: 'MODE_DISABLED' });
    expect(go({ clientSeed: 'abcdef0123' })).toMatchObject({ ok: true });
  });

  it('needs a wallet when a chip mode is on', () => {
    expect(() => resolveTurn({ ...base, fen: START_FEN, moveA: m('e2e4'), moveB: m('d2d4'), rules: ALL }, { forceSlot: 'A' })).toThrow();
  });
});

describe('economy', () => {
  it('starts both seats with 100 chips only when a chip mode is on', () => {
    expect(startingWallet({ modes: [] })).toBeUndefined();
    expect(startingWallet({ modes: ['side_bets'] })).toEqual({ w: 100, b: 100 });
  });

  it('pays capture income equal to the captured piece value', () => {
    const results = play(SCRIPT, { forceSlot: 'A' }, { modes: ['loaded_dice'] });
    // exd5 takes a pawn (+1 w), Qxd5 takes a pawn (+1 b).
    expect(results[2]?.effects).toEqual([{ kind: 'chips', color: 'w', delta: 1, reason: 'capture' }]);
    expect(results[3]?.walletAfter).toEqual({ w: 101, b: 101 });
  });

  it('never lets a wallet go negative', () => {
    expect(() => applyEffects({ w: 3, b: 0 }, [{ kind: 'chips', color: 'w', delta: -4, reason: 'stake' }])).toThrow();
    expect(applyEffects({ w: 3, b: 0 }, [{ kind: 'chips', color: 'w', delta: -3, reason: 'stake' }])).toEqual({ w: 0, b: 0 });
  });

  it('derives mode state from effects', () => {
    const bet = { id: 'x', kind: 'opp_promotes' as const, params: {}, stake: 5, payoutX100: 300, placedAtTurn: 1, status: 'open' as const };
    const s = applyModeEffects({ bets: { w: [bet] } }, [
      { kind: 'all_in', color: 'b', won: false, piece: 'n', square: 'c6', bonusPly: false },
      { kind: 'bet_settled', color: 'w', betId: 'x', result: 'won', payout: 15 },
    ]);
    expect(s.allInsUsed).toEqual({ w: [], b: ['n'] });
    expect(s.bets?.w).toEqual([{ ...bet, status: 'won' }]);
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

  it('composes the market before stakes, clamps, and records the breakdown', () => {
    const seen: string[] = [];
    MODE_REGISTRY.odds_market = { id: 'odds_market', adjustOdds: (_c, o) => (seen.push(`market@${o.A}`), { A: o.A - 1500 }) } satisfies ModeModule;
    MODE_REGISTRY.loaded_dice = { id: 'loaded_dice', adjustOdds: (_c, o) => (seen.push(`dice@${o.A}`), { A: o.A - 3000 }) } satisfies ModeModule;
    const input = { ...base, fen: START_FEN, moveA: m('e2e4'), moveB: m('d2d4'), rules: ALL, wallet: { w: 100, b: 100 } };

    expect(previewOdds(input)).toMatchObject({ ok: true, odds: { A: 1000 } });
    expect(seen).toEqual(['market@5000', 'dice@3500']);

    const r = resolveTurn(input, { rng: fixed(999), method: 'local' });
    expect(r.ok && r.result.odds).toEqual({ A: 1000 });
    expect(r.ok && r.result.coin?.chosen).toBe('A');
    expect(r.ok && r.result.effects[0]).toEqual({
      kind: 'odds_breakdown',
      steps: [
        { source: 'base', A: 5000 },
        { source: 'odds_market', A: 3500 },
        { source: 'loaded_dice', A: 500 },
      ],
    });
  });

  it('keeps forced turns fair and untossed', () => {
    MODE_REGISTRY.loaded_dice = { id: 'loaded_dice', adjustOdds: () => ({ A: 9000 }) } satisfies ModeModule;
    const r = resolveTurn(
      { ...base, fen: 'k7/8/8/8/8/8/1q6/K7 w - - 0 1', moveA: m('a1b2'), moveB: null, rules: ALL, wallet: { w: 100, b: 100 } },
      { rng: fixed(0), method: 'local' },
    );
    expect(r.ok && r.result).toMatchObject({ forced: true, coin: null, odds: { A: 5000 } });
  });
});

describe('bot submissions', () => {
  it('match the classic pair when every mode is a stub', () => {
    const fen = START_FEN;
    const state = { rules: ALL, wallet: { w: 100, b: 100 }, modeState: {}, history: [], fen, turnNumber: 1 };
    expect(pickBotSubmission(fen, state, seededRng(9))).toEqual(pickBotPair(fen, seededRng(9)));
  });
});
