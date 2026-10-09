import type { Color } from './moves';

/** A platform account. Balances are integer cents of ◎ (play money, no real-money value). */
export interface User {
  id: string;
  username: string;
  balanceCents: number;
  createdAt: number;
}

/** Every reason a balance changes. One ledger row per change. */
export type TxKind =
  | 'bonus'
  | 'deposit'
  | 'withdraw'
  | 'buy_in'
  | 'refund'
  | 'cashout'
  | 'rake'
  | 'bet_stake'
  | 'bet_payout'
  | 'bet_refund'
  | 'original_stake'
  | 'original_payout';

export interface Transaction {
  id: string;
  kind: TxKind;
  /** Signed: debits are negative. */
  amountCents: number;
  balanceAfterCents: number;
  /** What the change was for: a game, a bet, a round. */
  ref?: { type: 'game' | 'match_bet' | 'round'; id: string } | undefined;
  createdAt: number;
}

/** How a table's pot was paid out when the game ended. Absent on free tables. */
export interface Settlement {
  buyInCents: number;
  potCents: number;
  rakeCents: number;
  /** Cents returned to each seat. */
  payouts: Record<Color, number>;
}

export interface UserStats {
  games: number;
  wins: number;
  losses: number;
  draws: number;
  /** Lifetime cashouts minus buy-ins, in cents. */
  tableNetCents: number;
  /** Lifetime bet and original payouts minus stakes, in cents. */
  betNetCents: number;
}

export interface LeaderboardRow {
  userId: string;
  username: string;
  /** Lifetime net across tables, bets and originals. */
  netCents: number;
  games: number;
}

/** A finished game as the history screen lists it. */
export interface GameSummary {
  gameId: string;
  color: Color;
  opponent: string;
  modes: string[];
  buyInCents: number;
  /** 'win' | 'loss' | 'draw' from this player's side. */
  result: 'win' | 'loss' | 'draw';
  payoutCents: number;
  finishedAt: number;
}
