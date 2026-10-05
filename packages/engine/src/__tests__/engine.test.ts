import { describe, expect, it } from 'vitest';
import { START_FEN, type CoinToss, type MoveInput } from '@gamble/shared';
import {
  isForcedTurn,
  pickBotPair,
  resolveTurn,
  rngTosser,
  seededRng,
  validateSubmission,
  type Tosser,
} from '..';

const m = (lan: string): MoveInput => ({
  from: lan.slice(0, 2) as MoveInput['from'],
  to: lan.slice(2, 4) as MoveInput['to'],
  ...(lan[4] ? { promotion: lan[4] as NonNullable<MoveInput['promotion']> } : {}),
});
const always = (chosen: CoinToss['chosen']): Tosser => () => ({ chosen, method: 'local' });
const base = { gameId: 'g1', turnNumber: 1, previousFens: [] as string[] };

describe('validateSubmission', () => {
  it('validates both moves against the same snapshot even when Move A gives check', () => {
    const fen = '4k3/8/8/8/8/8/8/R3K3 w - - 0 1';
    const v = validateSubmission(fen, m('a1a8'), m('a1a2'));
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.moveA.san).toBe('Ra8+');
      expect(v.moveB?.san).toBe('Ra2');
    }
  });

  it('rejects identical moves', () => {
    expect(validateSubmission(START_FEN, m('e2e4'), m('e2e4'))).toMatchObject({ ok: false, error: 'DUPLICATE_MOVES' });
  });

  it('rejects illegal moves in either slot', () => {
    expect(validateSubmission(START_FEN, m('e2e5'), m('d2d4'))).toMatchObject({ ok: false, error: 'ILLEGAL_MOVE' });
    expect(validateSubmission(START_FEN, m('e2e4'), m('d1d4'))).toMatchObject({ ok: false, error: 'ILLEGAL_MOVE' });
  });

  it('requires a pair unless the turn is forced', () => {
    expect(validateSubmission(START_FEN, m('e2e4'), null)).toMatchObject({ ok: false, error: 'PAIR_REQUIRED' });
  });

  it('accepts a single move on a forced turn', () => {
    const fen = 'k7/8/8/8/8/8/1q6/K7 w - - 0 1';
    expect(isForcedTurn(fen)).toBe(true);
    expect(validateSubmission(fen, m('a1b2'), null)).toMatchObject({ ok: true, forced: true, moveB: null });
  });

  it('treats different promotion pieces as distinct moves and requires the piece', () => {
    const fen = '8/4P3/8/8/8/8/k7/4K3 w - - 0 1';
    expect(validateSubmission(fen, m('e7e8q'), m('e7e8n'))).toMatchObject({ ok: true });
    expect(validateSubmission(fen, m('e7e8'), m('e1d1'))).toMatchObject({ ok: false, error: 'ILLEGAL_MOVE' });
  });
});

describe('resolveTurn', () => {
  const mateFen = '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1';

  it('ends the game when the toss picks the mating move', () => {
    const r = resolveTurn({ ...base, fen: mateFen, moveA: m('a1a8'), moveB: m('a1a2') }, always('A'));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result.executed.san).toBe('Ra8#');
    expect(r.result.status).toBe('finished');
    expect(r.result.outcome).toEqual({ kind: 'checkmate', winner: 'w' });
  });

  it('continues when the toss picks the other move', () => {
    const r = resolveTurn({ ...base, fen: mateFen, moveA: m('a1a8'), moveB: m('a1a2') }, always('B'));
    expect(r.ok && r.result.executed.lan).toBe('a1a2');
    expect(r.ok && r.result.status).toBe('awaiting_submission');
    expect(r.ok && r.result.outcome).toBeUndefined();
  });

  it('detects stalemate after resolution', () => {
    const fen = '7k/5Q2/6K1/8/8/8/8/8 w - - 0 1';
    const r = resolveTurn({ ...base, fen, moveA: m('g6h6'), moveB: m('f7g7') }, always('A'));
    expect(r.ok && r.result.outcome).toEqual({ kind: 'stalemate' });
  });

  it('detects threefold repetition from executed history only', () => {
    const shuffle = ['g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', 'f3g1', 'f6g8'];
    const fens: string[] = [START_FEN];
    let last: ReturnType<typeof resolveTurn> | undefined;
    shuffle.forEach((lan, i) => {
      // Move B (a quiet pawn push) is offered but never played, so it must not affect repetition.
      const alt = i % 2 === 0 ? 'a2a3' : 'a7a6';
      last = resolveTurn({ ...base, fen: fens.at(-1)!, previousFens: fens.slice(0, -1), moveA: m(lan), moveB: m(alt) }, always('A'));
      if (last.ok) fens.push(last.result.fenAfter);
    });
    expect(last?.ok && last.result.outcome).toEqual({ kind: 'draw', reason: 'threefold' });
  });

  it('does not toss on a forced turn', () => {
    let tossed = false;
    const r = resolveTurn({ ...base, fen: 'k7/8/8/8/8/8/1q6/K7 w - - 0 1', moveA: m('a1b2'), moveB: null }, () => {
      tossed = true;
      return { chosen: 'B', method: 'local' };
    });
    expect(tossed).toBe(false);
    expect(r.ok && r.result).toMatchObject({ forced: true, coin: null });
  });

  it('flips a fair coin', () => {
    const toss = rngTosser(seededRng(42), 'local');
    const v = validateSubmission(START_FEN, m('e2e4'), m('d2d4'));
    if (!v.ok || !v.moveB) throw new Error('setup');
    let a = 0;
    const n = 10_000;
    for (let i = 0; i < n; i++) if (toss(v.moveA, v.moveB).chosen === 'A') a++;
    expect(Math.abs(a / n - 0.5)).toBeLessThan(0.015);
  });
});

describe('pickBotPair', () => {
  it('includes a mate in one', () => {
    const pair = pickBotPair('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', seededRng(1));
    expect(pair.moveA).toEqual(m('a1a8'));
  });

  it('returns a single move on forced turns', () => {
    expect(pickBotPair('k7/8/8/8/8/8/1q6/K7 w - - 0 1', seededRng(1))).toEqual({ moveA: m('a1b2'), moveB: null });
  });

  it.each(['greedy', 'random'] as const)('always submits valid pairs through full %s games', (difficulty) => {
    const rng = seededRng(7);
    const toss = rngTosser(rng, 'local');
    for (let game = 0; game < 5; game++) {
      const fens = [START_FEN];
      for (let ply = 1; ply <= 200; ply++) {
        const fen = fens.at(-1)!;
        const pair = pickBotPair(fen, rng, difficulty);
        const r = resolveTurn({ ...base, turnNumber: ply, fen, previousFens: fens.slice(0, -1), ...pair }, toss);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        fens.push(r.result.fenAfter);
        if (r.result.outcome) break;
      }
    }
  }, 60_000);
});

