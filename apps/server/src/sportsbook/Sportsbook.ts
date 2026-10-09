import { matchPayout, sideFor, winnerOf } from '@risky-chess/engine';
import { SPORTSBOOK, type Ack, type ErrorCode, type GameOutcome, type MatchBet, type MatchLine, type PlaceMatchBetPayload } from '@risky-chess/shared';
import { newId } from '../crypto/coin';
import { tx } from '../db/db';
import { HOUSE_USER_ID, InsufficientFunds } from '../db/ledger';
import type { GameManager } from '../game/GameManager';
import type { GameRecord } from '../game/GameStore';
import { isLive, lineFor, type Lobby } from '../lobby/Lobby';
import { logger } from '../log';
import type { Services } from '../platform';

const log = logger('sportsbook');

/** How settlements reach the bettor; app.ts binds it to the account's room. */
export interface SportsbookTransport {
  balance(userId: string, balanceCents: number): void;
  settled(userId: string, p: { bet: MatchBet; balanceCents: number }): void;
}

export interface Bettor {
  id: string;
  username: string;
}

const fail = <T>(error: ErrorCode, message: string, details?: unknown): Ack<T> => ({ ok: false, error, message, ...(details !== undefined ? { details } : {}) });

/**
 * Spectator bets on public games. Stakes go to the house when placed and
 * payouts come back out of it, so the sum of all balances never changes
 * on a bet; the house is a mock bankroll that tops itself up if a run of
 * winners ever empties it.
 */
export class Sportsbook {
  constructor(
    private readonly manager: GameManager,
    private readonly services: Services,
    private readonly transport: SportsbookTransport,
    private readonly lobby: Lobby,
  ) {}

  line(record: GameRecord): MatchLine {
    return lineFor(record);
  }

  place(user: Bettor, p: PlaceMatchBetPayload): Ack<{ bet: MatchBet; balanceCents: number }> {
    const { bets, ledger, db } = this.services;
    const idemKey = `mbet:${user.id}:${p.clientBetId}`;
    const prior = bets.matchBetByIdem(idemKey);
    if (prior) {
      const { userId: _u, ...bet } = prior;
      return { ok: true, data: { bet, balanceCents: ledger.balance(user.id) } };
    }

    const record = this.manager.record(p.gameId);
    if (!record) return fail('GAME_NOT_FOUND', 'No game with that code');
    const s = record.session;
    if (!isLive(record)) return fail('GAME_NOT_ACTIVE', 'Betting is only open on public games in progress');
    if (this.manager.authenticate(s.id, user.id)) return fail('OWN_GAME', 'You cannot bet on your own game');
    if (p.stakeCents < SPORTSBOOK.MIN_STAKE_CENTS || p.stakeCents > SPORTSBOOK.MAX_STAKE_CENTS) {
      return fail('INVALID_STAKE', `Stake must be between ${SPORTSBOOK.MIN_STAKE_CENTS} and ${SPORTSBOOK.MAX_STAKE_CENTS} cents`);
    }
    const line = lineFor(record);
    const oddsX100 = line[p.side];
    if (Math.abs(p.oddsX100 - oddsX100) > SPORTSBOOK.ODDS_TOLERANCE_X100) return fail('ODDS_CHANGED', 'The line moved', { line });
    if (bets.exposure(s.id, user.id) + p.stakeCents > SPORTSBOOK.MAX_EXPOSURE_CENTS) {
      return fail('EXPOSURE_LIMIT', `At most ${SPORTSBOOK.MAX_EXPOSURE_CENTS} cents open on one game`);
    }

    const id = newId();
    const placedAt = Date.now();
    let balanceCents: number;
    try {
      balanceCents = tx(db, () => {
        const posted = ledger.transfer(user.id, HOUSE_USER_ID, p.stakeCents, { debit: 'bet_stake', credit: 'bet_stake' }, idemKey, { type: 'match_bet', id });
        bets.insertMatchBet({ id, gameId: s.id, userId: user.id, side: p.side, stakeCents: p.stakeCents, oddsX100, idemKey, placedAt });
        return posted.balanceCents;
      });
    } catch (e) {
      if (e instanceof InsufficientFunds) return fail('INSUFFICIENT_FUNDS', 'Not enough in your balance');
      throw e;
    }
    const bet: MatchBet = { id, gameId: s.id, side: p.side, stakeCents: p.stakeCents, oddsX100, status: 'open', payoutCents: 0, placedAt };
    log.info('bet placed', { gameId: s.id, userId: user.id, side: p.side, stakeCents: p.stakeCents, oddsX100 });
    this.transport.balance(user.id, balanceCents);
    this.lobby.turn(record); // re-publishes the market with the new handle
    return { ok: true, data: { bet, balanceCents } };
  }

  /** The game ended with a result: every open bet on it wins, loses or (unpriced results aside) pays out. */
  onFinished(record: GameRecord, outcome: GameOutcome): void {
    const s = record.session;
    const at = Date.now();
    if (s.settlement) {
      for (const c of ['w', 'b'] as const) {
        const seat = s.players[c];
        if (!seat?.userId) continue;
        this.services.archive.pushFeed({ userId: seat.userId, username: seat.displayName, game: 'table', stakeCents: s.buyInCents, payoutCents: s.settlement.payouts[c], at });
      }
    }
    const winning = sideFor(winnerOf(outcome));
    for (const bet of this.services.bets.openMatchBets(s.id)) {
      const won = bet.side === winning;
      this.close(bet, won ? 'won' : 'lost', won ? matchPayout(bet.stakeCents, bet.oddsX100) : 0, at);
    }
    this.lobby.markDirty();
  }

  /** The game died without a result: stakes go back. */
  voidAll(gameId: string): void {
    const at = Date.now();
    for (const bet of this.services.bets.openMatchBets(gameId)) this.close(bet, 'void', bet.stakeCents, at);
    this.lobby.markDirty();
  }

  private close(bet: MatchBet & { userId: string }, status: 'won' | 'lost' | 'void', payoutCents: number, at: number): void {
    const { bets, ledger, db, users } = this.services;
    const balanceCents = tx(db, () => {
      if (!bets.settleMatchBet(bet.id, status, payoutCents, at)) return null;
      if (payoutCents <= 0) return ledger.balance(bet.userId);
      const kind = status === 'void' ? 'bet_refund' : 'bet_payout';
      const short = payoutCents - ledger.balance(HOUSE_USER_ID);
      if (short > 0) {
        log.error('house bankroll short; topping up', { betId: bet.id, short });
        ledger.post({ userId: HOUSE_USER_ID, kind: 'bonus', amountCents: short, idemKey: `house-topup:${bet.id}` });
      }
      ledger.transfer(HOUSE_USER_ID, bet.userId, payoutCents, { debit: kind, credit: kind }, `mbet-${status}:${bet.id}`, { type: 'match_bet', id: bet.id });
      return ledger.balance(bet.userId);
    });
    if (balanceCents === null) return;
    const settled: MatchBet = { ...bet, status, payoutCents, settledAt: at };
    const { userId: _u, ...pub } = settled as MatchBet & { userId?: string };
    const username = users.byId(bet.userId)?.username ?? '?';
    if (status !== 'void') this.services.archive.pushFeed({ userId: bet.userId, username, game: 'sportsbook', stakeCents: bet.stakeCents, payoutCents, at });
    log.info('bet settled', { betId: bet.id, gameId: bet.gameId, userId: bet.userId, status, payoutCents });
    this.transport.balance(bet.userId, balanceCents);
    this.transport.settled(bet.userId, { bet: pub, balanceCents });
  }
}
