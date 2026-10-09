import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { ORIGINALS, PUZZLES } from '@risky-chess/shared';
import { coinDuelPayout, dealCoinDuel, resolveCoinDuel, roundRolls, verifyCoinDuelRound } from '../originals/coinDuel';
import { isMateIn1, isMateIn2, mateIn2Keys, matingMoves, solvePuzzle, verifyPuzzle } from '../originals/puzzles';
import { commitmentOf } from '../fairness';
import { toInput } from '../legal';

const SEED = 'ab'.repeat(32);

describe('Coin Duel', () => {
  it('deals deterministically from the round rolls', () => {
    const a = dealCoinDuel(roundRolls(SEED, 'client', 3));
    const b = dealCoinDuel(roundRolls(SEED, 'client', 3));
    expect(a).toEqual(b);
    expect(dealCoinDuel(roundRolls(SEED, 'client', 4)).fen).not.toBe(a.fen);
  });

  it('deals a live middlegame with two distinct legal moves', () => {
    for (let nonce = 0; nonce < 25; nonce++) {
      const d = dealCoinDuel(roundRolls(SEED, 'c', nonce));
      const chess = new Chess(d.fen);
      expect(chess.isGameOver()).toBe(false);
      const plies = chess.moveNumber() * 2 - (chess.turn() === 'w' ? 2 : 1);
      expect(plies).toBeGreaterThanOrEqual(ORIGINALS.COIN_DUEL.DEAL_PLIES.min - 1);
      const legal = chess.moves({ verbose: true }).map((m) => m.lan);
      expect(legal).toContain(d.moveA.lan);
      expect(legal).toContain(d.moveB.lan);
      expect(d.moveA.lan).not.toBe(d.moveB.lan);
      expect(d.odds.A).toBeGreaterThanOrEqual(1000);
      expect(d.odds.A).toBeLessThanOrEqual(9000);
    }
  });

  it('prices each slot at its fair payout less the house edge', () => {
    const d = dealCoinDuel(roundRolls(SEED, 'c', 7));
    const pA = d.odds.A / 10_000;
    expect(d.payoutX100.A).toBe(Math.floor((100 * (1 - ORIGINALS.COIN_DUEL.EDGE)) / pA));
    expect(d.payoutX100.B).toBe(Math.floor((100 * (1 - ORIGINALS.COIN_DUEL.EDGE)) / (1 - pA)));
    // Expected return on either slot sits just under even money.
    const ev = (pA * d.payoutX100.A) / 100;
    expect(ev).toBeLessThan(1);
    expect(ev).toBeGreaterThan(1 - ORIGINALS.COIN_DUEL.EDGE - 0.01);
    expect(coinDuelPayout(0.5)).toBe(194);
  });

  it('resolves the coin and re-verifies from the revealed seed', () => {
    const { deal, roll, result } = verifyCoinDuelRound(SEED, 'c', 11);
    expect(roll).toBeGreaterThanOrEqual(0);
    expect(roll).toBeLessThan(10_000);
    expect(result.chosen).toBe(roll < deal.odds.A ? 'A' : 'B');
    expect(result.executed.lan).toBe(result.chosen === 'A' ? deal.moveA.lan : deal.moveB.lan);
    expect(new Chess(result.fenAfter).turn()).not.toBe(new Chess(deal.fen).turn());
    expect(resolveCoinDuel(deal, 0).chosen).toBe('A');
    expect(resolveCoinDuel(deal, 9999).chosen).toBe('B');
    expect(commitmentOf(SEED)).toHaveLength(64);
  });
});

describe('puzzle verification', () => {
  const backRank = '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1';

  it('checks mate in one', () => {
    expect(isMateIn1(backRank, { from: 'a1', to: 'a8' })).toBe(true);
    expect(isMateIn1(backRank, { from: 'a1', to: 'a7' })).toBe(false);
    expect(isMateIn1(backRank, { from: 'a1', to: 'h8' })).toBe(false); // illegal
    expect(matingMoves(backRank).map((m) => m.san)).toEqual(['Ra8#']);
    expect(verifyPuzzle('mate1', backRank, { from: 'a1', to: 'a8' })).toBe(true);
  });

  it('checks mate in two', () => {
    // Two rooks ladder: Rb7 then Ra8# whatever Black does.
    const ladder = '7k/8/8/8/8/8/R7/1R4K1 w - - 0 1';
    const keys = mateIn2Keys(ladder).map((m) => m.san);
    expect(keys).toContain('Rb7');
    expect(isMateIn2(ladder, { from: 'b1', to: 'b7' })).toBe(true);
    expect(isMateIn2(ladder, { from: 'a2', to: 'a3' })).toBe(false);
    expect(verifyPuzzle('mate2', ladder, { from: 'b1', to: 'b7' })).toBe(true);
    // A quicker mate still solves a mate-in-2.
    expect(isMateIn2(backRank, { from: 'a1', to: 'a8' })).toBe(true);
  });

  it('ships a non-empty set in which every puzzle has a verifying solution', () => {
    expect(PUZZLES.length).toBeGreaterThan(50);
    expect(PUZZLES.some((p) => p.tier === 'mate2')).toBe(true);
    const fens = new Set(PUZZLES.map((p) => p.fen));
    expect(fens.size).toBe(PUZZLES.length);
    for (const p of PUZZLES) {
      // The generator only admits checking keys for mate-in-2, so the cheap search is enough here.
      const key = p.tier === 'mate1' ? matingMoves(p.fen)[0] : mateIn2Keys(p.fen, true)[0];
      expect(key, `${p.tier} ${p.fen}`).toBeDefined();
      expect(verifyPuzzle(p.tier, p.fen, toInput(key!))).toBe(true);
      if (p.tier === 'mate2') expect(matingMoves(p.fen)).toHaveLength(0);
    }
    expect(solvePuzzle('mate1', PUZZLES.find((p) => p.tier === 'mate1')!.fen)).not.toBeNull();
  }, 30_000);
});
