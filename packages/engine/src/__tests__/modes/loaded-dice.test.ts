import { afterEach, describe, expect, it } from 'vitest';
import { START_FEN, type GameRules, type MoveInput, type TurnExtras, type Wallet } from '@risky-chess/shared';
import { MODE_REGISTRY, pickBotSubmission, previewOdds, resolveTurn, seededRng, startingWallet, type ModeModule, type Rng } from '../..';
import { BOT_STAKE, LOADED_DICE_TIERS } from '../../modes/loaded-dice';

const m = (lan: string): MoveInput => ({ from: lan.slice(0, 2), to: lan.slice(2, 4) }) as MoveInput;
const RULES: GameRules = { modes: ['loaded_dice'] };
const fixed = (n: number): Rng => ({ int: () => n });

function turn(extras: TurnExtras, opts: { wallet?: Wallet; fen?: string; moveB?: string | null; rules?: GameRules; roll?: number } = {}) {
  return resolveTurn(
    {
      gameId: 'g',
      turnNumber: 1,
      fen: opts.fen ?? START_FEN,
      previousFens: [],
      moveA: m('e2e4'),
      moveB: opts.moveB === null ? null : m(opts.moveB ?? 'd2d4'),
      rules: opts.rules ?? RULES,
      wallet: opts.wallet ?? { w: 100, b: 100 },
      extras,
    },
    { rng: fixed(opts.roll ?? 0), method: 'local' },
  );
}

describe('tiers', () => {
  it('exports 0 · 4 · 10 · 20 for +0 / +10 / +20 / +30 points', () => {
    expect(LOADED_DICE_TIERS.map((t) => [t.stake, t.shift])).toEqual([
      [0, 0],
      [4, 1000],
      [10, 2000],
      [20, 3000],
    ]);
  });

  it.each([
    [{ stake: 4, favor: 'A' }, 6000],
    [{ stake: 10, favor: 'A' }, 7000],
    [{ stake: 20, favor: 'A' }, 8000],
    [{ stake: 20, favor: 'B' }, 2000],
    [{ stake: 0, favor: 'B' }, 5000],
    [{}, 5000],
  ] as const)('%o tilts A to %i', (extras, A) => {
    const r = turn(extras);
    expect(r.ok && r.result.odds).toEqual({ A });
  });
});

describe('validation', () => {
  it('rejects stakes that are not a tier', () => {
    expect(turn({ stake: 5, favor: 'A' })).toMatchObject({ ok: false, error: 'INVALID_STAKE' });
  });

  it('requires a favored slot when staking', () => {
    expect(turn({ stake: 4 })).toMatchObject({ ok: false, error: 'INVALID_STAKE' });
  });

  it('rejects stakes above the wallet', () => {
    expect(turn({ stake: 20, favor: 'A' }, { wallet: { w: 19, b: 100 } })).toMatchObject({ ok: false, error: 'INSUFFICIENT_CHIPS' });
    expect(turn({ stake: 20, favor: 'A' }, { wallet: { w: 20, b: 0 } })).toMatchObject({ ok: true });
  });

  it('rejects a stake on a forced turn', () => {
    const fen = 'k7/8/8/8/8/8/1q6/K7 w - - 0 1';
    const r = resolveTurn(
      { gameId: 'g', turnNumber: 1, fen, previousFens: [], moveA: m('a1b2'), moveB: null, rules: RULES, wallet: { w: 100, b: 100 }, extras: { stake: 4, favor: 'A' } },
      { rng: fixed(0) },
    );
    expect(r).toMatchObject({ ok: false, error: 'INVALID_STAKE' });
  });

  it('rejects a stake on an All-In', () => {
    const fen = 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
    const r = resolveTurn(
      {
        gameId: 'g',
        turnNumber: 3,
        fen,
        previousFens: [],
        moveA: m('e4d5'),
        moveB: null,
        rules: { modes: ['loaded_dice', 'all_in'] },
        wallet: { w: 100, b: 100 },
        extras: { allIn: true, stake: 4, favor: 'A' },
      },
      { rng: fixed(0) },
    );
    expect(r).toMatchObject({ ok: false, error: 'INVALID_STAKE' });
  });
});

describe('wallet', () => {
  it('debits the stake whether the favored slot wins or loses', () => {
    const won = turn({ stake: 10, favor: 'A' }, { roll: 0 });
    const lost = turn({ stake: 10, favor: 'A' }, { roll: 9999 });
    expect(won.ok && won.result.coin?.chosen).toBe('A');
    expect(lost.ok && lost.result.coin?.chosen).toBe('B');
    for (const r of [won, lost]) {
      expect(r.ok && r.result.walletAfter).toEqual({ w: 90, b: 100 });
      expect(r.ok && r.result.effects).toContainEqual({ kind: 'chips', color: 'w', delta: -10, reason: 'stake' });
    }
  });
});

describe('composition', () => {
  const saved = { ...MODE_REGISTRY };
  afterEach(() => Object.assign(MODE_REGISTRY, saved));

  it('moves the line after the market has set it, and the clamp holds at 90%', () => {
    MODE_REGISTRY.odds_market = { id: 'odds_market', adjustOdds: (_c, o) => ({ A: o.A + 1500 }) } satisfies ModeModule;
    const rules: GameRules = { modes: ['odds_market', 'loaded_dice'] };
    const input = { gameId: 'g', turnNumber: 1, fen: START_FEN, previousFens: [], moveA: m('e2e4'), moveB: m('d2d4'), rules, wallet: { w: 100, b: 100 } };
    expect(previewOdds({ ...input, extras: { stake: 10, favor: 'B' } })).toMatchObject({ ok: true, odds: { A: 4500 } });
    const capped = previewOdds({ ...input, extras: { stake: 20, favor: 'A' } });
    expect(capped).toMatchObject({ ok: true, odds: { A: 9000 } });
    expect(capped.ok && capped.steps).toEqual([
      { source: 'base', A: 5000 },
      { source: 'odds_market', A: 6500 },
      { source: 'loaded_dice', A: 9500 },
    ]);
  });
});

describe('bot', () => {
  it('stakes toward the stronger move only on a clear gap, and never above its wallet', () => {
    // White can take a hanging queen (Qxd8 style gap) — e4xd5 vs a quiet move: here a free queen on d5.
    const fen = 'rnb1kbnr/pppp1ppp/8/3q4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 3';
    const rich = { rules: RULES, wallet: { w: 100, b: 100 }, modeState: {}, history: [], fen, turnNumber: 5 };
    const pick = pickBotSubmission(fen, rich, seededRng(1));
    expect(pick.moveA).toEqual(m('e4d5'));
    expect(pick.extras).toEqual({ favor: 'A', stake: 10 });

    const poor = { ...rich, wallet: { w: BOT_STAKE.minWallet, b: 100 } };
    expect(pickBotSubmission(fen, poor, seededRng(1)).extras).toBeUndefined();
  });

  it('never submits a stake the engine rejects through full self-play games', () => {
    const rng = seededRng(21);
    for (let game = 0; game < 4; game++) {
      let fen = START_FEN;
      let wallet = startingWallet(RULES)!;
      const fens: string[] = [];
      for (let ply = 1; ply <= 160; ply++) {
        const pick = pickBotSubmission(fen, { rules: RULES, wallet, modeState: {}, history: [], fen, turnNumber: ply }, rng);
        if (pick.extras?.stake) expect(pick.extras.stake).toBeLessThanOrEqual(wallet[fen.split(' ')[1] as 'w' | 'b']);
        const r = resolveTurn({ gameId: 'g', turnNumber: ply, fen, previousFens: fens, ...pick, rules: RULES, wallet }, { rng, method: 'local' });
        if (!r.ok) throw new Error(`${r.error}: ${r.message}`);
        fens.push(fen);
        fen = r.result.fenAfter;
        wallet = r.result.walletAfter!;
        if (r.result.outcome) break;
      }
    }
  }, 60_000);
});
