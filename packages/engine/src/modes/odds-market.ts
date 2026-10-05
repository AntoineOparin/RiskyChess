import { Chess, type Move } from 'chess.js';
import type { MoveInput, MoveSlot, Odds } from '@risky-chess/shared';
import type { BotPair } from '../bot';
import { lanOf, toInput } from '../legal';
import { scoreMove } from '../score';
import type { ModeModule, RankedMove } from './types';

/**
 * Odds Market: the house prices every pair against its stronger move.
 * gap = score(A) − score(B) on the one-ply heuristic; the line leans
 * edge = min(1500, round(|gap| × 300)) bps against the stronger move. Equal
 * moves stay 50/50; a strong move paired with junk sits near 35/65. If the
 * stronger move plays anyway, the mover beats the line and is paid
 * round(edge / 100) chips. The line is deterministic, so a client's preview
 * always matches the server.
 */
export const MARKET = { BPS_PER_POINT: 300, MAX_EDGE: 1500 } as const;

export interface MarketLine {
  /** Bps the line leans against the stronger move (0 when even). */
  edge: number;
  /** The slot the house leans against; null on an even pair. */
  stronger: MoveSlot | null;
  /** Odds after the market alone (before stakes and the clamp). */
  odds: Odds;
  /** Chips paid if the stronger move executes. */
  payout: number;
}

export const edgeForGap = (gap: number) => Math.min(MARKET.MAX_EDGE, Math.round(Math.abs(gap) * MARKET.BPS_PER_POINT));

function lineFromScores(scoreA: number, scoreB: number): MarketLine {
  const gap = scoreA - scoreB;
  const edge = edgeForGap(gap);
  if (edge === 0) return { edge: 0, stronger: null, odds: { A: 5000 }, payout: 0 };
  const stronger: MoveSlot = gap > 0 ? 'A' : 'B';
  return { edge, stronger, odds: { A: stronger === 'A' ? 5000 - edge : 5000 + edge }, payout: Math.round(edge / 100) };
}

/** The house line for a pair in this position. Throws on an illegal move. */
export function marketLine(fen: string, moveA: MoveInput, moveB: MoveInput): MarketLine {
  const legal = new Chess(fen).moves({ verbose: true });
  const find = (m: MoveInput) => {
    const hit = legal.find((x) => x.lan === lanOf(m));
    if (!hit) throw new Error(`marketLine: ${lanOf(m)} is not legal in ${fen}`);
    return hit;
  };
  return lineFromScores(scoreMove(fen, find(moveA)), scoreMove(fen, find(moveB)));
}

/**
 * marketLine for UI previews: null instead of throwing when either move isn't
 * legal in `fen` (e.g. a view holding slots from a different position).
 */
export function tryMarketLine(fen: string, moveA: MoveInput, moveB: MoveInput): MarketLine | null {
  const legal = new Set(new Chess(fen).moves({ verbose: true }).map((x) => x.lan));
  if (!legal.has(lanOf(moveA)) || !legal.has(lanOf(moveB))) return null;
  return marketLine(fen, moveA, moveB);
}

/** How many of the bot's best moves it considers pairing against a market. */
const POLICY_TOP = 5;
/** Expected-score slack (in pawns) the bot gives up to get a more balanced line. */
const POLICY_SLACK = 0.75;

/**
 * The bot's pair against a market. Pure expected value always keeps the two
 * best moves (a 15-point lean never outweighs them), so instead: of the pairs
 * among its top candidates whose expected one-ply score (line priced in, plus
 * a little for the payout) is within POLICY_SLACK of the best, take the one
 * the house leans against least. Balanced pairs, no thrown-away material.
 */
export function preferBalancedPair(fen: string, ranked: readonly RankedMove[]): BotPair | null {
  if (ranked.length < 2) return null;
  const top = ranked.slice(0, POLICY_TOP).map((r) => ({ move: r.move, raw: scoreMove(fen, r.move) }));
  const pairs: { a: Move; b: Move; ev: number; edge: number }[] = [];
  for (let i = 0; i < top.length; i++) {
    for (let j = i + 1; j < top.length; j++) {
      const x = top[i]!;
      const y = top[j]!;
      const line = lineFromScores(x.raw, y.raw);
      const pA = line.odds.A / 10_000;
      const pStrong = line.stronger === 'A' ? pA : line.stronger === 'B' ? 1 - pA : 0;
      pairs.push({ a: x.move, b: y.move, ev: pA * x.raw + (1 - pA) * y.raw + (pStrong * line.payout) / 10, edge: line.edge });
    }
  }
  const bestEv = Math.max(...pairs.map((p) => p.ev));
  const pick = pairs.filter((p) => p.ev >= bestEv - POLICY_SLACK).sort((p, q) => p.edge - q.edge || q.ev - p.ev)[0]!;
  return { moveA: toInput(pick.a), moveB: toInput(pick.b) };
}

export const oddsMarket: ModeModule = {
  id: 'odds_market',

  adjustOdds(ctx, odds) {
    if (!ctx.moveB) return odds;
    const line = marketLine(ctx.fen, ctx.moveA, ctx.moveB);
    return { A: odds.A + (line.odds.A - 5000) };
  },

  effects(ctx, applied) {
    if (!ctx.moveB || !applied.roll) return [];
    const line = marketLine(ctx.fen, ctx.moveA, ctx.moveB);
    if (!line.stronger || applied.roll.chosen !== line.stronger || !line.payout) return [];
    return [{ kind: 'chips', color: ctx.mover, delta: line.payout, reason: 'market_payout' }];
  },

  pairPolicy: (fen, ranked) => preferBalancedPair(fen, ranked),
};
