import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { START_FEN, type GameRules, type ModeState, type MoveInput, type TurnResult } from '@risky-chess/shared';
import {
  applyModeEffects,
  assertLegalPosition,
  deriveOutcome,
  pickBotSubmission,
  positionKey,
  resolveTurn,
  seededRng,
  sideToMove,
  startingWallet,
  type Rng,
} from '../..';

const m = (lan: string): MoveInput => ({ from: lan.slice(0, 2), to: lan.slice(2, 4), ...(lan[4] ? { promotion: lan[4] } : {}) }) as MoveInput;
const RULES: GameRules = { modes: ['all_in'] };
const WIN: Rng = { int: () => 0 };
const LOSE: Rng = { int: () => 9999 };

function go(fen: string, lan: string, rng: Rng, opts: { modeState?: ModeState; rules?: GameRules; moveB?: string; extras?: object; history?: TurnResult[] } = {}) {
  const rules = opts.rules ?? RULES;
  return resolveTurn(
    {
      gameId: 'g',
      turnNumber: 3,
      fen,
      previousFens: [],
      moveA: m(lan),
      moveB: opts.moveB ? m(opts.moveB) : null,
      rules,
      wallet: startingWallet(rules)!,
      modeState: opts.modeState ?? {},
      extras: { allIn: true, ...opts.extras },
      ...(opts.history ? { history: opts.history } : {}),
    },
    { rng, method: 'local' },
  );
}
const ok = (r: ReturnType<typeof go>) => {
  if (!r.ok) throw new Error(`${r.error}: ${r.message}`);
  return r.result;
};

/** White exd5 is available; black just played d7d5. */
const EXD5 = 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2';
/** Black exd4 is available. */
const EXD4 = 'rnbqkbnr/pppp1ppp/8/4p3/3P4/8/PPP1PPPP/RNBQKBNR b KQkq d3 0 2';

describe('the coin', () => {
  it('is a fair 50/50 untouched by the market or stakes', () => {
    const r = ok(go(EXD5, 'e4d5', WIN, { rules: { modes: ['all_in', 'odds_market', 'loaded_dice'] } }));
    expect(r.odds).toEqual({ A: 5000 });
    expect(r.coin?.chosen).toBe('A');
    expect(r.effects.some((e) => e.kind === 'odds_breakdown')).toBe(false);
  });

  it('rejects a stake on an All-In', () => {
    expect(go(EXD5, 'e4d5', WIN, { rules: { modes: ['all_in', 'loaded_dice'] }, extras: { stake: 4, favor: 'A' } })).toMatchObject({ ok: false, error: 'INVALID_STAKE' });
  });
});

describe('win', () => {
  it('plays the capture and grants a bonus ply (White)', () => {
    const r = ok(go(EXD5, 'e4d5', WIN));
    expect(r.fenAfter).toBe('rnbqkbnr/ppp1pppp/8/3P4/8/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2');
    expect(sideToMove(r.fenAfter)).toBe('w');
    expect(r.executed.san).toBe('exd5');
    expect(r.effects).toEqual([
      { kind: 'chips', color: 'w', delta: 1, reason: 'capture' },
      { kind: 'all_in', color: 'w', won: true, piece: 'p', square: 'e4', bonusPly: true },
    ]);
  });

  it('keeps the move numbers right when Black takes a bonus ply', () => {
    const r = ok(go(EXD4, 'e5d4', WIN));
    // Black moves again at move 2; the halfmove clock was reset by the capture.
    expect(r.fenAfter).toBe('rnbqkbnr/pppp1ppp/8/8/3p4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 2');
    const bonus = resolveTurn(
      { gameId: 'g', turnNumber: 4, fen: r.fenAfter, previousFens: [EXD4], moveA: m('g8f6'), moveB: m('b8c6'), rules: RULES, wallet: r.walletAfter!, modeState: {} },
      { rng: WIN, method: 'local' },
    );
    expect(bonus.ok && bonus.result.fenAfter).toBe('rnbqkb1r/pppp1ppp/5n2/8/3p4/8/PPP1PPPP/RNBQKBNR w KQkq - 1 3');
  });

  it('gives no bonus when the capture checks', () => {
    const r = ok(go('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', 'a1a8', WIN));
    expect(r.inCheck).toBe(true);
    expect(sideToMove(r.fenAfter)).toBe('b');
    expect(r.effects.at(-1)).toMatchObject({ kind: 'all_in', won: true, bonusPly: false });
    // Capturing the a8 rook revokes Black's queenside castling; White's a1 rook moved too.
    expect(r.fenAfter.split(' ')[2]).toBe('Kk');
  });

  it('gives no bonus when the capture mates, and the game ends', () => {
    const r = ok(go('4r1k1/5ppp/8/8/8/8/8/4R1K1 w - - 0 1', 'e1e8', WIN));
    expect(r.outcome).toEqual({ kind: 'checkmate', winner: 'w' });
    expect(r.effects.at(-1)).toMatchObject({ won: true, bonusPly: false });
  });

  it('keeps the promotion on a promoting capture', () => {
    const r = ok(go('1r6/P7/8/7k/8/8/8/4K3 w - - 0 1', 'a7b8q', WIN));
    expect(r.fenAfter).toBe('1Q6/8/8/7k/8/8/8/4K3 w - - 0 1');
    expect(r.executed).toMatchObject({ promotion: 'q', captured: 'r' });
    expect(r.effects).toContainEqual({ kind: 'chips', color: 'w', delta: 5, reason: 'capture' });
  });

  it('handles en passant', () => {
    const fen = 'rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3';
    const won = ok(go(fen, 'e5f6', WIN));
    expect(won.fenAfter).toBe('rnbqkbnr/ppp1p1pp/5P2/3p4/8/8/PPPP1PPP/RNBQKBNR w KQkq - 0 3');
    const lost = ok(go(fen, 'e5f6', LOSE));
    expect(lost.fenAfter).toBe('rnbqkbnr/ppp1p1pp/8/3p1p2/8/8/PPPP1PPP/RNBQKBNR b KQkq - 0 3');
  });
});

describe('lose', () => {
  it('removes the capturing piece and passes the turn', () => {
    const r = ok(go(EXD5, 'e4d5', LOSE));
    expect(r.fenAfter).toBe('rnbqkbnr/ppp1pppp/8/3p4/8/8/PPPP1PPP/RNBQKBNR b KQkq - 0 2');
    expect(r.executed.lan).toBe('e4d5');
    expect(r.effects).toEqual([{ kind: 'all_in', color: 'w', won: false, piece: 'p', square: 'e4', bonusPly: false }]);
    expect(r.walletAfter).toEqual({ w: 100, b: 100 }); // no capture income on a bust
  });

  it('advances the move number after a Black bust', () => {
    expect(ok(go(EXD4, 'e5d4', LOSE)).fenAfter).toBe('rnbqkbnr/pppp1ppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR w KQkq - 0 3');
  });

  it('revokes castling when a home-square rook is lost', () => {
    const r = ok(go('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', 'a1a8', LOSE));
    expect(r.fenAfter).toBe('r3k2r/8/8/8/8/8/8/4K2R b Kkq - 0 1');
  });

  it('lets the end conditions see the new position', () => {
    // White's last piece goes: king against king and knight is a draw.
    const r = ok(go('4k3/8/8/8/3n4/8/8/3RK3 w - - 0 1', 'd1d4', LOSE));
    expect(r.outcome).toEqual({ kind: 'draw', reason: 'insufficient_material' });
  });
});

describe('limits', () => {
  it('rejects a king capture', () => {
    expect(go('k7/8/8/8/8/8/3p4/4K3 w - - 0 1', 'e1d2', WIN)).toMatchObject({ ok: false, error: 'ALL_IN_INVALID' });
  });

  it('allows each piece type once per player', () => {
    const first = ok(go(EXD5, 'e4d5', LOSE));
    const used = applyModeEffects({}, first.effects);
    expect(used.allInsUsed).toEqual({ w: ['p'], b: [] });
    expect(go(EXD5, 'e4d5', WIN, { modeState: used })).toMatchObject({ ok: false, error: 'ALL_IN_USED' });
    // Black may still use a pawn.
    expect(go(EXD4, 'e5d4', WIN, { modeState: used }).ok).toBe(true);
  });

  it('needs at least two legal moves', () => {
    expect(go('k7/8/8/8/8/8/1q6/K7 w - - 0 1', 'a1b2', WIN)).toMatchObject({ ok: false, error: 'ALL_IN_INVALID' });
  });

  it('must be a capture', () => {
    expect(go(START_FEN, 'e2e4', WIN)).toMatchObject({ ok: false, error: 'ALL_IN_INVALID' });
  });

  it('declares a single move', () => {
    expect(go(EXD5, 'e4d5', WIN, { moveB: 'd2d4' })).toMatchObject({ ok: false, error: 'ALL_IN_INVALID' });
  });

  it('rejects a pinned capturer whose removal would expose the king', () => {
    expect(go('k3r3/8/8/8/8/8/4R3/4K3 w - - 0 1', 'e2e8', WIN)).toMatchObject({ ok: false, error: 'ALL_IN_INVALID' });
  });

  it('rejects a capture that only answers check, since losing it leaves the king in check', () => {
    // The knight on c2 checks; Qxc2 would be legal but a bust would leave the check standing.
    expect(go('4k3/8/8/8/8/8/2n5/3QK3 w - - 0 1', 'd1c2', WIN)).toMatchObject({ ok: false, error: 'ALL_IN_INVALID' });
  });
});

describe('repetition', () => {
  it('counts bonus positions as their own executed positions', () => {
    const bonus = ok(go(EXD5, 'e4d5', WIN)).fenAfter;
    const normal = new Chess(EXD5);
    normal.move('exd5');
    expect(positionKey(bonus)).not.toBe(positionKey(normal.fen()));
    // Reached for the third time: threefold, side to move included.
    expect(deriveOutcome(new Chess(bonus), [bonus, START_FEN, bonus])).toEqual({ kind: 'draw', reason: 'threefold' });
    expect(deriveOutcome(new Chess(bonus), [normal.fen(), normal.fen()])).toBeUndefined();
  });
});

describe('positions', () => {
  it('rejects a FEN whose side not to move is in check', () => {
    expect(() => assertLegalPosition('4k3/4R3/8/8/8/8/8/4K3 w - - 0 1')).toThrow();
    expect(assertLegalPosition(START_FEN)).toBe(START_FEN);
  });
});

describe('bot', () => {
  it('goes All-In only on an even-or-better capture with an unused piece', () => {
    // Black's queen hangs to exd5: a pawn taking a queen is worth the risk.
    const fen = 'rnb1kbnr/pppp1ppp/8/3q4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 3';
    const state = (modeState: ModeState) => ({ rules: RULES, wallet: { w: 100, b: 100 }, modeState, history: [], fen, turnNumber: 3 });
    const always: Rng = { int: () => 0 };
    expect(pickBotSubmission(fen, state({}), always)).toMatchObject({ moveA: m('e4d5'), moveB: null, extras: { allIn: true } });
    expect(pickBotSubmission(fen, state({ allInsUsed: { w: ['p'], b: [] } }), always).extras).toBeUndefined();
    // Otherwise only one time in four.
    expect(pickBotSubmission(fen, state({}), { int: (n) => (n === 4 ? 1 : 0) }).extras).toBeUndefined();
  });

  it('plays full self-play games with only legal positions and the same seat moving after a won bonus', () => {
    const rng = seededRng(77);
    let bonuses = 0;
    let busts = 0;
    for (let game = 0; game < 6; game++) {
      let fen = START_FEN;
      let wallet = startingWallet(RULES)!;
      let modeState: ModeState = {};
      const history: TurnResult[] = [];
      for (let ply = 1; ply <= 200; ply++) {
        const pick = pickBotSubmission(fen, { rules: RULES, wallet, modeState, history, fen, turnNumber: ply }, rng);
        const r = resolveTurn(
          { gameId: 'g', turnNumber: ply, fen, previousFens: history.map((h) => h.fenBefore), ...pick, rules: RULES, wallet, modeState, history },
          { rng, method: 'local' },
        );
        if (!r.ok) throw new Error(`${r.error}: ${r.message}`);
        const res = r.result;
        assertLegalPosition(res.fenAfter);
        const ai = res.effects.find((e) => e.kind === 'all_in');
        if (ai?.kind === 'all_in') {
          if (ai.bonusPly) bonuses++;
          if (!ai.won) busts++;
          expect(sideToMove(res.fenAfter)).toBe(ai.bonusPly ? res.mover : res.mover === 'w' ? 'b' : 'w');
        }
        history.push(res);
        fen = res.fenAfter;
        wallet = res.walletAfter!;
        modeState = applyModeEffects(modeState, res.effects);
        if (res.outcome) break;
      }
    }
    expect(bonuses + busts).toBeGreaterThan(0);
  }, 60_000);
});
