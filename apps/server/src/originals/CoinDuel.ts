import { dealCoinDuel, resolveCoinDuel, roundCoin, type CoinDuelDealt } from '@risky-chess/engine';
import { ORIGINALS, type Ack, type CoinDuelBetPayload, type CoinDuelDeal, type CoinDuelResult, type ErrorCode, type ServerToClientEvents } from '@risky-chess/shared';
import { newId } from '../crypto/coin';
import { tx } from '../db/db';
import { HOUSE_USER_ID, InsufficientFunds } from '../db/ledger';
import { logger } from '../log';
import type { Services } from '../platform';

const log = logger('originals');

/** Sends an event to every socket an account has open. */
export type EmitToUser = <E extends keyof ServerToClientEvents>(userId: string, event: E, ...args: Parameters<ServerToClientEvents[E]>) => void;

export interface Bettor {
  id: string;
  username: string;
}

/** What a dealt round remembers until it is bet: the deal, and which seed pair it was drawn from. */
interface DealState extends CoinDuelDealt {
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  expiresAt: number;
}

const fail = <T>(error: ErrorCode, message: string): Ack<T> => ({ ok: false, error, message });

/**
 * Makes sure the house can pay `cents`. The house is a mock bankroll: when
 * players beat it, it is simply topped up (a deposit would be, too).
 */
export function coverHouse(services: Services, cents: number, idemKey: string): void {
  const short = cents - services.ledger.balance(HOUSE_USER_ID);
  if (short > 0) services.ledger.post({ userId: HOUSE_USER_ID, kind: 'bonus', amountCents: short, idemKey });
}

export class CoinDuel {
  constructor(
    private readonly services: Services,
    private readonly emit: EmitToUser,
  ) {}

  /** Opens a round: the next nonce of the player's seed pair decides the deal. */
  deal(user: Bettor, now = Date.now()): Ack<CoinDuelDeal> {
    const { bets, fairness } = this.services;
    const round = fairness.openRound(user.id);
    const dealt = dealCoinDuel(round.roll);
    const roundId = newId();
    const state: DealState = { ...dealt, serverSeedHash: round.serverSeedHash, clientSeed: round.clientSeed, nonce: round.nonce, expiresAt: now + ORIGINALS.COIN_DUEL.DEAL_TTL_MS };
    bets.insertRound({ id: roundId, userId: user.id, game: 'coin_duel', serverSeedHash: round.serverSeedHash, clientSeed: round.clientSeed, nonce: round.nonce, stakeCents: 0, state, createdAt: now });
    log.debug('coin duel dealt', { roundId, userId: user.id, nonce: round.nonce, fen: dealt.fen, odds: dealt.odds.A });
    return {
      ok: true,
      data: {
        roundId,
        serverSeedHash: round.serverSeedHash,
        clientSeed: round.clientSeed,
        nonce: round.nonce,
        fen: dealt.fen,
        moveA: dealt.moveA,
        moveB: dealt.moveB,
        odds: dealt.odds,
        payoutX100: dealt.payoutX100,
        expiresAt: state.expiresAt,
      },
    };
  }

  /** Stakes on a slot and lands the coin, all in one step. */
  bet(user: Bettor, p: CoinDuelBetPayload, now = Date.now()): Ack<CoinDuelResult> {
    const { bets, ledger, users, archive, db } = this.services;
    const round = bets.round<DealState>(p.roundId);
    if (!round || round.userId !== user.id) return fail('ROUND_NOT_FOUND', 'No such round');
    if (round.status !== 'open') return fail('ROUND_EXPIRED', 'That round is already settled');
    const { state } = round;
    // A rotated pair can no longer prove this deal: void it rather than roll on a stale seed.
    const pair = users.seedPair(user.id);
    if (now > state.expiresAt || !pair || pair.serverSeedHash !== state.serverSeedHash || pair.clientSeed !== state.clientSeed) {
      bets.settleRound(p.roundId, 'void', { payoutCents: 0, state, settledAt: now });
      return fail('ROUND_EXPIRED', 'That deal has expired; deal again');
    }
    if (p.stakeCents < ORIGINALS.MIN_STAKE_CENTS || p.stakeCents > ORIGINALS.MAX_STAKE_CENTS) return fail('INVALID_STAKE', 'Stake out of range');

    const roll = roundCoin(pair.serverSeed, state.clientSeed, state.nonce);
    const result = resolveCoinDuel(state, roll);
    const won = result.chosen === p.slot;
    const payoutCents = won ? Math.floor((p.stakeCents * state.payoutX100[p.slot]) / 100) : 0;
    let balanceCents: number;
    try {
      balanceCents = tx(db, () => {
        let { balanceCents: after } = ledger.transfer(user.id, HOUSE_USER_ID, p.stakeCents, { debit: 'original_stake', credit: 'original_stake' }, `round:${p.roundId}:stake`, { type: 'round', id: p.roundId });
        if (payoutCents > 0) {
          coverHouse(this.services, payoutCents, `house-topup:${p.roundId}`);
          ledger.transfer(HOUSE_USER_ID, user.id, payoutCents, { debit: 'original_payout', credit: 'original_payout' }, `round:${p.roundId}:payout`, { type: 'round', id: p.roundId });
          after = ledger.balance(user.id);
        }
        bets.settleRound(p.roundId, won ? 'won' : 'lost', { stakeCents: p.stakeCents, payoutCents, state: { ...state, backed: p.slot, roll, ...result }, settledAt: now });
        return after;
      });
    } catch (e) {
      if (e instanceof InsufficientFunds) return fail('INSUFFICIENT_FUNDS', 'Not enough in your balance');
      throw e;
    }
    archive.pushFeed({ userId: user.id, username: user.username, game: 'coin_duel', stakeCents: p.stakeCents, payoutCents, at: now });
    log.info('coin duel settled', { roundId: p.roundId, userId: user.id, backed: p.slot, chosen: result.chosen, roll, stakeCents: p.stakeCents, payoutCents });
    this.emit(user.id, 'balance_updated', { balanceCents });
    return {
      ok: true,
      data: { roundId: p.roundId, nonce: state.nonce, backed: p.slot, stakeCents: p.stakeCents, roll, chosen: result.chosen, executed: result.executed, fenAfter: result.fenAfter, won, payoutCents, balanceCents },
    };
  }
}
