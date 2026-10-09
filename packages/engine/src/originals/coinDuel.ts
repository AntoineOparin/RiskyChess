import { Chess } from 'chess.js';
import { ORIGINALS, START_FEN, type MoveSlot, type Odds, type ResolvedMove } from '@risky-chess/shared';
import { rankBotMoves } from '../bot';
import { rollFromMessage } from '../fairness';
import { toInput, toResolved } from '../legal';
import { marketLine, type MarketLine } from '../modes/odds-market';
import { clampOdds } from '../odds';
import { seededRng } from '../rng';

/*
 * Coin Duel: the house deals a middlegame and the bot's two best moves; the
 * player backs one and the coin decides which plays. Everything about the
 * round, the plies that build the position, the bot's tie-breaking noise and
 * the coin itself, is drawn from one committed seed pair, so the server
 * cannot steer the deal toward a pair that suits it and anyone holding the
 * revealed seed can rebuild the whole round.
 */

/** What round `nonce` of a seed pair hashes; `tag` derives extra rolls from the same commitment. Must match the server's Fairness. */
export const roundMessage = (clientSeed: string, nonce: number, tag?: string) => `${clientSeed}:${nonce}${tag ? `:${tag}` : ''}`;

/** One 0–9999 roll per tag, all bound to the same round. */
export type RoundRolls = (tag: string) => number;

export interface CoinDuelDealt {
  fen: string;
  moveA: ResolvedMove;
  moveB: ResolvedMove;
  /** The house line against the stronger move, as Odds Market prices it. */
  line: MarketLine;
  /** Probability (bps) that A plays, after the clamp. */
  odds: Odds;
  /** Total returned per 1 staked, ×100, for backing each slot. */
  payoutX100: Record<MoveSlot, number>;
}

const { DEAL_PLIES, EDGE } = ORIGINALS.COIN_DUEL;

/** Moves that keep the game going with a real choice left: no game-ending moves, no forced replies. */
function playable(chess: Chess) {
  return chess.moves({ verbose: true }).filter((m) => {
    const next = new Chess(chess.fen());
    next.move({ from: m.from, to: m.to, ...(m.promotion ? { promotion: m.promotion } : {}) });
    return !next.isGameOver() && next.moves().length >= 2;
  });
}

/** Total returned per 1 staked, ×100, for a slot with probability `p`, after the house edge. */
export const coinDuelPayout = (p: number): number => Math.floor((100 * (1 - EDGE)) / p);

/** Deals a round from its rolls. Deterministic: the same rolls always give the same deal. */
export function dealCoinDuel(rolls: RoundRolls): CoinDuelDealt {
  const plies = DEAL_PLIES.min + (rolls('plies') % (DEAL_PLIES.max - DEAL_PLIES.min + 1));
  const chess = new Chess(START_FEN);
  for (let k = 0; k < plies; k++) {
    const options = playable(chess);
    if (options.length === 0) break;
    const m = options[rolls(`ply:${k}`) % options.length]!;
    chess.move({ from: m.from, to: m.to, ...(m.promotion ? { promotion: m.promotion } : {}) });
  }
  const fen = chess.fen();
  const ranked = rankBotMoves(fen, seededRng(rolls('pair')), 'greedy');
  if (ranked.length < 2) throw new Error(`dealCoinDuel: no pair in ${fen}`);
  const moveA = toResolved(ranked[0]!.move);
  const moveB = toResolved(ranked[1]!.move);
  const line = marketLine(fen, toInput(ranked[0]!.move), toInput(ranked[1]!.move));
  const odds = clampOdds(line.odds);
  const pA = odds.A / 10_000;
  return { fen, moveA, moveB, line, odds, payoutX100: { A: coinDuelPayout(pA), B: coinDuelPayout(1 - pA) } };
}

export interface CoinDuelResolved {
  chosen: MoveSlot;
  executed: ResolvedMove;
  fenAfter: string;
}

/** Lands the coin: slot A plays when the roll is below its odds. */
export function resolveCoinDuel(deal: Pick<CoinDuelDealt, 'fen' | 'moveA' | 'moveB' | 'odds'>, roll: number): CoinDuelResolved {
  const chosen: MoveSlot = roll < deal.odds.A ? 'A' : 'B';
  const executed = chosen === 'A' ? deal.moveA : deal.moveB;
  const chess = new Chess(deal.fen);
  chess.move({ from: executed.from, to: executed.to, ...(executed.promotion ? { promotion: executed.promotion } : {}) });
  return { chosen, executed, fenAfter: chess.fen() };
}

/** The rolls of a round, from a revealed server seed. */
export const roundRolls =
  (serverSeed: string, clientSeed: string, nonce: number): RoundRolls =>
  (tag) =>
    rollFromMessage(serverSeed, roundMessage(clientSeed, nonce, tag));

/** The coin roll of a round (no tag). */
export const roundCoin = (serverSeed: string, clientSeed: string, nonce: number): number => rollFromMessage(serverSeed, roundMessage(clientSeed, nonce));

/** Rebuilds a whole round from a revealed seed pair, so a player can check what they were dealt and how the coin fell. */
export function verifyCoinDuelRound(serverSeed: string, clientSeed: string, nonce: number): { deal: CoinDuelDealt; roll: number; result: CoinDuelResolved } {
  const deal = dealCoinDuel(roundRolls(serverSeed, clientSeed, nonce));
  const roll = roundCoin(serverSeed, clientSeed, nonce);
  return { deal, roll, result: resolveCoinDuel(deal, roll) };
}
