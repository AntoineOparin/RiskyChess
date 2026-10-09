import { findLegal, verifyPuzzle } from '@risky-chess/engine';
import { ORIGINALS, PUZZLES, type Ack, type ErrorCode, type PuzzleAnswerPayload, type PuzzleResult, type PuzzleRound, type PuzzleStartPayload, type PuzzleTier } from '@risky-chess/shared';
import { newId } from '../crypto/coin';
import { tx } from '../db/db';
import { HOUSE_USER_ID, InsufficientFunds } from '../db/ledger';
import { Timers } from '../game/timers';
import { logger } from '../log';
import type { Services } from '../platform';
import { coverHouse, type Bettor, type EmitToUser } from './CoinDuel';

const log = logger('originals');

interface PuzzleState {
  tier: PuzzleTier;
  puzzleIndex: number;
  fen: string;
  deadline: number;
  payoutX100: number;
}

const fail = <T>(error: ErrorCode, message: string): Ack<T> => ({ ok: false, error, message });

/**
 * Blitz Puzzle: the stake buys one timed attempt at a forced mate. The
 * puzzle is picked by the round's roll; the clock is the server's. Rounds
 * open when the process died are losses: their clocks are gone.
 */
export class BlitzPuzzle {
  private readonly timers = new Timers();

  constructor(
    private readonly services: Services,
    private readonly emit: EmitToUser,
  ) {
    for (const r of services.bets.openRounds('puzzle')) {
      services.bets.settleRound(r.id, 'lost', { payoutCents: 0, state: r.state, settledAt: Date.now() });
      log.warn('puzzle round lost to a restart', { roundId: r.id, userId: r.userId });
    }
  }

  start(user: Bettor, p: PuzzleStartPayload, now = Date.now()): Ack<PuzzleRound> {
    const { bets, fairness, ledger, db } = this.services;
    if (p.stakeCents < ORIGINALS.MIN_STAKE_CENTS || p.stakeCents > ORIGINALS.MAX_STAKE_CENTS) return fail('INVALID_STAKE', 'Stake out of range');
    const candidates = PUZZLES.map((z, i) => ({ ...z, i })).filter((z) => z.tier === p.tier);
    if (candidates.length === 0) return fail('INTERNAL', 'No puzzles of that tier');
    const tier = ORIGINALS.PUZZLE_TIERS[p.tier];
    const roundId = newId();
    let round: ReturnType<typeof fairness.openRound>;
    let state: PuzzleState;
    try {
      ({ round, state } = tx(db, () => {
        ledger.transfer(user.id, HOUSE_USER_ID, p.stakeCents, { debit: 'original_stake', credit: 'original_stake' }, `round:${roundId}:stake`, { type: 'round', id: roundId });
        const round = fairness.openRound(user.id);
        const pick = candidates[round.roll() % candidates.length]!;
        const state: PuzzleState = { tier: p.tier, puzzleIndex: pick.i, fen: pick.fen, deadline: now + tier.seconds * 1000, payoutX100: tier.payoutX100 };
        bets.insertRound({ id: roundId, userId: user.id, game: 'puzzle', serverSeedHash: round.serverSeedHash, clientSeed: round.clientSeed, nonce: round.nonce, stakeCents: p.stakeCents, state, createdAt: now });
        return { round, state };
      }));
    } catch (e) {
      if (e instanceof InsufficientFunds) return fail('INSUFFICIENT_FUNDS', 'Not enough in your balance');
      throw e;
    }
    this.timers.set(`puzzle:${roundId}`, tier.seconds * 1000, () => this.expire(user.id, roundId));
    log.info('puzzle started', { roundId, userId: user.id, tier: p.tier, stakeCents: p.stakeCents, nonce: round.nonce });
    return {
      ok: true,
      data: { roundId, serverSeedHash: round.serverSeedHash, clientSeed: round.clientSeed, nonce: round.nonce, tier: p.tier, puzzleIndex: state.puzzleIndex, fen: state.fen, stakeCents: p.stakeCents, payoutX100: state.payoutX100, deadline: state.deadline },
    };
  }

  answer(user: Bettor, p: PuzzleAnswerPayload, now = Date.now()): Ack<PuzzleResult> {
    const { bets } = this.services;
    const round = bets.round<PuzzleState>(p.roundId);
    if (!round || round.userId !== user.id) return fail('ROUND_NOT_FOUND', 'No such round');
    if (round.status !== 'open') return fail('ROUND_EXPIRED', 'That round is already settled');
    this.timers.clear(`puzzle:${p.roundId}`);
    const { state } = round;
    const move = findLegal(state.fen, p.move);
    if (now > state.deadline) {
      const balanceCents = this.settle(user.id, p.roundId, round.stakeCents, state, false, now);
      return { ok: true, data: { roundId: p.roundId, outcome: 'timeout', ...(move ? { move } : {}), payoutCents: 0, balanceCents } };
    }
    const solved = !!move && verifyPuzzle(state.tier, state.fen, p.move);
    const payoutCents = solved ? Math.floor((round.stakeCents * state.payoutX100) / 100) : 0;
    const balanceCents = this.settle(user.id, p.roundId, round.stakeCents, { ...state, answer: p.move }, solved, now);
    log.info('puzzle answered', { roundId: p.roundId, userId: user.id, tier: state.tier, solved, payoutCents });
    return { ok: true, data: { roundId: p.roundId, outcome: solved ? 'solved' : 'wrong', ...(move ? { move } : {}), payoutCents, balanceCents } };
  }

  dispose(): void {
    this.timers.clearAll();
  }

  /** The clock ran out with no answer. */
  private expire(userId: string, roundId: string): void {
    const round = this.services.bets.round<PuzzleState>(roundId);
    if (!round || round.status !== 'open') return;
    const balanceCents = this.settle(userId, roundId, round.stakeCents, round.state, false, Date.now());
    log.info('puzzle timed out', { roundId, userId });
    this.emit(userId, 'original_settled', { roundId, payoutCents: 0, balanceCents });
  }

  private settle(userId: string, roundId: string, stakeCents: number, state: object, solved: boolean, now: number): number {
    const { bets, ledger, db, users, archive } = this.services;
    const payoutCents = solved ? Math.floor((stakeCents * (state as PuzzleState).payoutX100) / 100) : 0;
    const balanceCents = tx(db, () => {
      if (payoutCents > 0) {
        coverHouse(this.services, payoutCents, `house-topup:${roundId}`);
        ledger.transfer(HOUSE_USER_ID, userId, payoutCents, { debit: 'original_payout', credit: 'original_payout' }, `round:${roundId}:payout`, { type: 'round', id: roundId });
      }
      bets.settleRound(roundId, solved ? 'won' : 'lost', { payoutCents, state, settledAt: now });
      return ledger.balance(userId);
    });
    archive.pushFeed({ userId, username: users.byId(userId)?.username ?? '?', game: 'puzzle', stakeCents, payoutCents, at: now });
    this.emit(userId, 'balance_updated', { balanceCents });
    return balanceCents;
  }
}
