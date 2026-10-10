import { Chess, validateFen } from 'chess.js';
import { PIECE_VALUES, type Color, type ModeState, type MoveInput, type PieceSymbol, type ResolvedMove } from '@risky-chess/shared';
import { legalMoves, lanOf, toResolved } from '../legal';
import { deriveOutcome } from '../status';
import type { ModeModule, ValidationFailure } from './types';

/*
 * All-In: instead of a pair, the mover declares one capture double-or-nothing
 * on a fair 50/50 coin (slot A = win), still provably fair online.
 *
 * Win: the capture plays and the mover gets a bonus ply (a normal pair turn),
 * unless the capture gives check, ends the game, or leaves the mover without
 * a legal move: then it just plays.
 * Lose: nothing is played, the capturing piece is removed, the turn passes.
 *
 * Every FEN written here is round-tripped through chess.js and checked so the
 * side not to move is never in check.
 */

const other = (c: Color): Color => (c === 'w' ? 'b' : 'w');

function setField(fen: string, i: number, value: string): string {
  const f = fen.split(' ');
  f[i] = value;
  return f.join(' ');
}

/** Throws unless `fen` is a position chess.js accepts with the side not to move out of check. */
export function assertLegalPosition(fen: string): string {
  const v = validateFen(fen);
  if (!v.ok) throw new Error(`All-In produced an invalid FEN (${v.error}): ${fen}`);
  const flipped = setField(setField(fen, 1, fen.split(' ')[1] === 'w' ? 'b' : 'w'), 3, '-');
  if (new Chess(flipped).inCheck()) throw new Error(`All-In left the side not to move in check: ${fen}`);
  return new Chess(fen).fen();
}

/**
 * After a won All-In with no check: the mover moves again. En passant is
 * cleared (the opponent made no double push), the halfmove clock is already
 * 0 (it was a capture), and the fullmove number is the one before the
 * capture, so a Black bonus ply doesn't skip a White move number.
 */
export function bonusFen(fenBefore: string, fenAfterCapture: string): string {
  const before = fenBefore.split(' ');
  let fen = setField(fenAfterCapture, 1, before[1]!);
  fen = setField(fen, 3, '-');
  fen = setField(fen, 5, before[5]!);
  return assertLegalPosition(fen);
}

/**
 * After a lost All-In: the capturing piece leaves the board and the turn
 * passes. chess.js revokes castling for a rook removed from its home square.
 * The removal is irreversible, so the halfmove clock resets; the fullmove
 * number advances after Black, as for any ply.
 */
export function bustFen(fenBefore: string, from: ResolvedMove['from']): string {
  const chess = new Chess(fenBefore);
  const mover = chess.turn();
  chess.remove(from);
  let fen = setField(chess.fen(), 1, other(mover));
  fen = setField(fen, 3, '-');
  fen = setField(fen, 4, '0');
  if (mover === 'b') fen = setField(fen, 5, String(Number(fenBefore.split(' ')[5]) + 1));
  return assertLegalPosition(fen);
}

/** Why `move` can't be declared All-In here, or null if it can. */
export function allInProblem(fen: string, move: MoveInput, modeState: ModeState): ValidationFailure | null {
  const legal = legalMoves(fen);
  const m = legal.find((x) => x.lan === lanOf(move));
  if (!m) return { error: 'ILLEGAL_MOVE', message: `${lanOf(move)} is not legal` };
  if (legal.length < 2) return { error: 'ALL_IN_INVALID', message: 'All-In needs at least two legal moves' };
  if (!m.captured) return { error: 'ALL_IN_INVALID', message: 'All-In must be a capture' };
  if (m.piece === 'k') return { error: 'ALL_IN_INVALID', message: 'The king can’t go All-In' };
  if (modeState.allInsUsed?.[m.color]?.includes(m.piece)) {
    return { error: 'ALL_IN_USED', message: `You already went All-In with this piece type` };
  }
  // Losing removes the piece: that must not expose the mover's own king.
  const removed = new Chess(fen);
  removed.remove(m.from);
  if (removed.inCheck()) return { error: 'ALL_IN_INVALID', message: 'Losing would leave your king in check' };
  return null;
}

export const allIn: ModeModule = {
  id: 'all_in',

  validate(ctx) {
    if (!ctx.extras.allIn) return null;
    return allInProblem(ctx.fen, ctx.moveA, ctx.modeState);
  },

  apply(ctx, roll) {
    if (!ctx.extras.allIn || !roll) return null;
    if (roll.chosen === 'B') return { executed: ctx.moveA, fenAfter: bustFen(ctx.fen, ctx.moveA.from) };

    const chess = new Chess(ctx.fen);
    const played = chess.move({ from: ctx.moveA.from, to: ctx.moveA.to, ...(ctx.moveA.promotion ? { promotion: ctx.moveA.promotion } : {}) });
    const executed = toResolved(played);
    const captured = executed.captured;
    const ended = deriveOutcome(chess, [...ctx.history.map((h) => h.fenBefore), ctx.fen]);
    const noBonus = chess.inCheck() || !!ended;
    if (!noBonus) {
      const fen = bonusFen(ctx.fen, chess.fen());
      // A bonus with nothing to play would only be a stalemate the mover walked into.
      if (new Chess(fen).moves().length > 0) return { executed, fenAfter: fen, ...(captured ? { captured } : {}) };
    }
    return { executed, fenAfter: chess.fen(), ...(captured ? { captured } : {}) };
  },

  effects(ctx, applied) {
    if (!ctx.extras.allIn || !applied.roll) return [];
    const won = applied.roll.chosen === 'A';
    const bonusPly = won && applied.fenAfter.split(' ')[1] === ctx.mover;
    return [{ kind: 'all_in', color: ctx.mover, won, piece: ctx.moveA.piece, square: ctx.moveA.from, bonusPly }];
  },

  botExtras(fen, pair, state, rng) {
    const legal = new Chess(fen).moves({ verbose: true });
    const m = legal.find((x) => x.lan === lanOf(pair.moveA));
    if (!m?.captured || m.piece === 'k') return {};
    if (PIECE_VALUES[m.captured] < PIECE_VALUES[m.piece]) return {};
    if (allInProblem(fen, pair.moveA, state.modeState)) return {};
    return rng.int(4) === 0 ? { allIn: true } : {};
  },
};

/** Piece types this player may still declare All-In with. */
export const allInsLeft = (state: ModeState, color: Color): PieceSymbol[] =>
  (['p', 'n', 'b', 'r', 'q'] as const).filter((p) => !state.allInsUsed?.[color]?.includes(p));
