import { describe, expect, it } from 'vitest';
import { RAKE_BPS, SPORTSBOOK, START_FEN, formatCents, parseMoney } from '@risky-chess/shared';
import { materialBalance, matchPayout, matchProbabilities, priceMatch } from '../pricing';
import { settleTable } from '../settlement';

describe('settleTable', () => {
  it('returns null on a free table', () => {
    expect(settleTable({ buyInCents: 0, outcome: { kind: 'checkmate', winner: 'w' } })).toBeNull();
  });

  it('pays the winner the pot minus the rake', () => {
    const s = settleTable({ buyInCents: 5_000, outcome: { kind: 'resign', winner: 'b' }, wallet: { w: 140, b: 60 } })!;
    expect(s.potCents).toBe(10_000);
    expect(s.rakeCents).toBe((10_000 * RAKE_BPS) / 10_000);
    expect(s.payouts).toEqual({ w: 0, b: 10_000 - s.rakeCents });
    expect(s.payouts.w + s.payouts.b + s.rakeCents).toBe(s.potCents);
  });

  it('splits a draw pro-rata by final stacks, remainder to the house', () => {
    const s = settleTable({ buyInCents: 1_000, outcome: { kind: 'stalemate' }, wallet: { w: 130, b: 71 } })!;
    expect(s.payouts.w).toBe(Math.floor((2_000 * 130) / 201));
    expect(s.payouts.b).toBe(Math.floor((2_000 * 71) / 201));
    expect(s.payouts.w + s.payouts.b + s.rakeCents).toBe(2_000);
    expect(s.rakeCents).toBeLessThan(2);
  });

  it('refunds a classic draw evenly', () => {
    const s = settleTable({ buyInCents: 25_000, outcome: { kind: 'draw', reason: 'threefold' } })!;
    expect(s.payouts).toEqual({ w: 25_000, b: 25_000 });
    expect(s.rakeCents).toBe(0);
  });
});

describe('priceMatch', () => {
  it('reads material off the FEN', () => {
    expect(materialBalance(START_FEN)).toBe(0);
    expect(materialBalance('rnb1kbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')).toBe(9);
  });

  it('prices the start position close to even with the book margin', () => {
    const line = priceMatch(START_FEN, 0, 1);
    const implied = 100 / line.w + 100 / line.b + 100 / line.d;
    expect(implied).toBeGreaterThan(1 + SPORTSBOOK.MARGIN - 0.02);
    expect(implied).toBeLessThan(1 + SPORTSBOOK.MARGIN + 0.03);
    expect(Math.abs(line.w - line.b)).toBeLessThan(25);
    expect(line.asOfTurn).toBe(1);
  });

  it('leans toward the side with more material', () => {
    const up = matchProbabilities('rnb1kbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 10);
    expect(up.w).toBeGreaterThan(0.85);
    const line = priceMatch('rnb1kbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 10, 11);
    expect(line.w).toBeLessThan(line.b);
    expect(line.w).toBeGreaterThanOrEqual(SPORTSBOOK.MIN_ODDS_X100);
    expect(line.b).toBeLessThanOrEqual(SPORTSBOOK.MAX_ODDS_X100);
  });

  it('pays stake × odds', () => {
    expect(matchPayout(1_000, 215)).toBe(2_150);
    expect(matchPayout(333, 150)).toBe(499);
  });
});

describe('money', () => {
  it('formats and parses cents', () => {
    expect(formatCents(125_000)).toBe('◎ 1,250.00');
    expect(formatCents(-1_250)).toBe('−◎ 12.50');
    expect(formatCents(500, { sign: true })).toBe('+◎ 5.00');
    expect(parseMoney('12.5')).toBe(1_250);
    expect(parseMoney('1,250')).toBe(125_000);
    expect(parseMoney('◎ 3')).toBe(300);
    expect(parseMoney('-3')).toBeNull();
    expect(parseMoney('1.234')).toBeNull();
  });
});
