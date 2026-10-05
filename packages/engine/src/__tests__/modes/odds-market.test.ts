import { describe, expect, it } from 'vitest';
import { START_FEN, type GameRules, type MoveInput } from '@risky-chess/shared';
import { Chess } from 'chess.js';
import { edgeForGap, marketLine, tryMarketLine, pickBotPair, pickBotSubmission, previewOdds, rankBotMoves, resolveTurn, scoreMove, seededRng, startingWallet, type Rng } from '../..';

const m = (lan: string): MoveInput => ({ from: lan.slice(0, 2), to: lan.slice(2, 4), ...(lan[4] ? { promotion: lan[4] } : {}) }) as MoveInput;
const RULES: GameRules = { modes: ['odds_market'] };
const fixed = (n: number): Rng => ({ int: () => n });
/** White to move; Black's queen hangs on d5 to exd5. */
const HANGING_Q = 'rnb1kbnr/pppp1ppp/8/3q4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 3';

function resolve(fen: string, a: string, b: string, roll: number, rules: GameRules = RULES) {
  return resolveTurn(
    { gameId: 'g', turnNumber: 5, fen, previousFens: [], moveA: m(a), moveB: m(b), rules, wallet: { w: 50, b: 50 } },
    { rng: fixed(roll), method: 'local' },
  );
}

describe('marketLine', () => {
  it('stays 50/50 on an even pair', () => {
    expect(marketLine(START_FEN, m('e2e4'), m('d2d4'))).toEqual({ edge: 0, stronger: null, odds: { A: 5000 }, payout: 0 });
  });

  it('leans against a strong move paired with junk, capped at 35/65', () => {
    const line = marketLine(HANGING_Q, m('e4d5'), m('a2a3'));
    expect(line).toEqual({ edge: 1500, stronger: 'A', odds: { A: 3500 }, payout: 15 });
  });

  it('is symmetric: swapping A and B mirrors the odds', () => {
    const fens = [START_FEN, HANGING_Q, 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3'];
    for (const fen of fens) {
      const legal = new Chess(fen).moves({ verbose: true }).slice(0, 12);
      for (const x of legal) {
        for (const y of legal) {
          if (x.lan === y.lan) continue;
          const ab = marketLine(fen, m(x.lan), m(y.lan));
          const ba = marketLine(fen, m(y.lan), m(x.lan));
          expect(ab.odds.A).toBe(10_000 - ba.odds.A);
          expect(ab.edge).toBe(ba.edge);
        }
      }
    }
  });

  it('grows monotonically with the gap up to the cap', () => {
    let last = -1;
    for (let gap = 0; gap <= 8; gap += 0.25) {
      const e = edgeForGap(gap);
      expect(e).toBeGreaterThanOrEqual(last);
      expect(e).toBeLessThanOrEqual(1500);
      expect(edgeForGap(-gap)).toBe(e);
      last = e;
    }
    expect(edgeForGap(1)).toBe(300);
    expect(edgeForGap(5)).toBe(1500);
    expect(edgeForGap(1000)).toBe(1500);
  });

  it('prices from the one-ply heuristic', () => {
    const legal = new Chess(HANGING_Q).moves({ verbose: true });
    const a = legal.find((x) => x.lan === 'g1f3')!;
    const b = legal.find((x) => x.lan === 'b1c3')!;
    const gap = scoreMove(HANGING_Q, a) - scoreMove(HANGING_Q, b);
    expect(marketLine(HANGING_Q, m('g1f3'), m('b1c3')).edge).toBe(edgeForGap(gap));
  });
});

describe('stale slots', () => {
  // A view once paired the previous turn's slots (White's d2d4) with Black's position.
  const afterD4 = 'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1';

  it('tryMarketLine returns null instead of throwing for moves from another position', () => {
    expect(tryMarketLine(afterD4, m('e2e4'), m('d2d4'))).toBeNull();
    expect(tryMarketLine(afterD4, m('e7e5'), m('d7d5'))).toEqual(marketLine(afterD4, m('e7e5'), m('d7d5')));
  });

  it('marketLine names the position when a move is illegal', () => {
    expect(() => marketLine(afterD4, m('e2e4'), m('d2d4'))).toThrow(`e2e4 is not legal in ${afterD4}`);
  });
});

describe('beat the line', () => {
  it('pays the mover only when the stronger move executes', () => {
    const won = resolve(HANGING_Q, 'e4d5', 'a2a3', 0); // A (stronger) plays
    expect(won.ok && won.result.effects).toContainEqual({ kind: 'chips', color: 'w', delta: 15, reason: 'market_payout' });
    expect(won.ok && won.result.walletAfter).toEqual({ w: 50 + 9 + 15, b: 50 }); // queen capture + payout

    const lost = resolve(HANGING_Q, 'e4d5', 'a2a3', 9999); // B plays
    expect(lost.ok && lost.result.effects.some((e) => e.kind === 'chips' && e.reason === 'market_payout')).toBe(false);
  });

  it('pays when the stronger move sits in slot B', () => {
    const r = resolve(HANGING_Q, 'a2a3', 'e4d5', 9999);
    expect(r.ok && r.result.odds).toEqual({ A: 6500 });
    expect(r.ok && r.result.effects).toContainEqual({ kind: 'chips', color: 'w', delta: 15, reason: 'market_payout' });
  });

  it('pays nothing on an even pair', () => {
    const r = resolve(START_FEN, 'e2e4', 'd2d4', 0);
    expect(r.ok && r.result.effects).toEqual([]);
  });

  it('records the line in the odds breakdown before stakes', () => {
    const r = resolveTurn(
      {
        gameId: 'g',
        turnNumber: 5,
        fen: HANGING_Q,
        previousFens: [],
        moveA: m('e4d5'),
        moveB: m('a2a3'),
        rules: { modes: ['odds_market', 'loaded_dice'] },
        wallet: { w: 50, b: 50 },
        extras: { favor: 'A', stake: 20 },
      },
      { rng: fixed(0), method: 'local' },
    );
    expect(r.ok && r.result.effects[0]).toEqual({
      kind: 'odds_breakdown',
      steps: [
        { source: 'base', A: 5000 },
        { source: 'odds_market', A: 3500 },
        { source: 'loaded_dice', A: 6500 },
      ],
    });
    expect(r.ok && r.result.odds).toEqual({ A: 6500 });
  });
});

describe('determinism', () => {
  it('client preview equals the server result for every pair', () => {
    const fen = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3';
    const legal = new Chess(fen).moves({ verbose: true });
    for (let i = 0; i + 1 < legal.length; i += 2) {
      const input = { gameId: 'g', turnNumber: 5, fen, previousFens: [], moveA: m(legal[i]!.lan), moveB: m(legal[i + 1]!.lan), rules: RULES, wallet: { w: 50, b: 50 } };
      const preview = previewOdds(input);
      const r = resolveTurn(input, { rng: fixed(5000), method: 'local' });
      expect(preview.ok && r.ok && preview.odds).toEqual(r.ok && r.result.odds);
    }
  });
});

describe('bot pair policy', () => {
  it('still offers a mate in one', () => {
    const fen = '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1';
    const pick = pickBotSubmission(fen, { rules: RULES, wallet: { w: 100, b: 100 }, modeState: {}, history: [], fen, turnNumber: 1 }, seededRng(1));
    expect([pick.moveA, pick.moveB]).toContainEqual(m('a1a8'));
  });

  it('prefers more balanced pairs than the classic bot', () => {
    const rng = seededRng(4);
    let classicEdge = 0;
    let marketEdge = 0;
    let fen = START_FEN;
    let wallet = startingWallet(RULES)!;
    const fens: string[] = [];
    for (let ply = 1; ply <= 120; ply++) {
      const ranked = rankBotMoves(fen, seededRng(ply));
      if (ranked.length > 1) {
        const classic = pickBotPair(fen, seededRng(ply));
        classicEdge += marketLine(fen, classic.moveA, classic.moveB!).edge;
      }
      const pick = pickBotSubmission(fen, { rules: RULES, wallet, modeState: {}, history: [], fen, turnNumber: ply }, seededRng(ply));
      if (pick.moveB) marketEdge += marketLine(fen, pick.moveA, pick.moveB).edge;
      const r = resolveTurn({ gameId: 'g', turnNumber: ply, fen, previousFens: fens, ...pick, rules: RULES, wallet }, { rng, method: 'local' });
      if (!r.ok) throw new Error(r.message);
      fens.push(fen);
      fen = r.result.fenAfter;
      wallet = r.result.walletAfter!;
      if (r.result.outcome) break;
    }
    expect(marketEdge).toBeLessThan(classicEdge);
  }, 60_000);
});
