/** What a spectator can back: White wins, Black wins, or a draw. */
export type MatchSide = 'w' | 'b' | 'd';

/** Decimal odds ×100 (215 → 2.15×) for each side, priced from the position at `asOfTurn`. */
export interface MatchLine {
  w: number;
  b: number;
  d: number;
  asOfTurn: number;
}

export type MatchBetStatus = 'open' | 'won' | 'lost' | 'void';

export interface MatchBet {
  id: string;
  gameId: string;
  side: MatchSide;
  stakeCents: number;
  /** The odds the bet was taken at. */
  oddsX100: number;
  status: MatchBetStatus;
  /** Cents returned (stake × odds on a win, stake on a void, 0 on a loss). */
  payoutCents: number;
  placedAt: number;
  settledAt?: number;
}

export interface PlaceMatchBetPayload {
  gameId: string;
  /** Idempotency key: a retried placement never debits twice. */
  clientBetId: string;
  side: MatchSide;
  stakeCents: number;
  /** The odds the client saw; the server rejects with ODDS_CHANGED if the line moved. */
  oddsX100: number;
}
