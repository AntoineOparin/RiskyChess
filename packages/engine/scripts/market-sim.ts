/**
 * Odds Market pricing check: bot-vs-bot self-play reporting the mean house
 * edge per tossed pair and chips paid out for beating the line per game.
 * Run: pnpm --filter @risky-chess/engine sim:market [games]
 */
import { START_FEN, type GameRules } from '@risky-chess/shared';
import { marketLine, pickBotSubmission, resolveTurn, seededRng, startingWallet } from '../src';

const GAMES = Number(process.argv[2] ?? 500);
const MAX_PLIES = 300;
const rules: GameRules = { modes: ['odds_market'] };
const rng = seededRng(303);

let tosses = 0;
let edgeSum = 0;
let even = 0;
let payouts = 0;
let paidTurns = 0;
let plies = 0;
for (let g = 0; g < GAMES; g++) {
  let fen = START_FEN;
  let wallet = startingWallet(rules)!;
  const fens: string[] = [];
  for (let ply = 1; ply <= MAX_PLIES; ply++) {
    const pick = pickBotSubmission(fen, { rules, wallet, modeState: {}, history: [], fen, turnNumber: ply }, rng);
    if (pick.moveB) {
      const line = marketLine(fen, pick.moveA, pick.moveB);
      tosses++;
      edgeSum += line.edge;
      if (!line.edge) even++;
    }
    const r = resolveTurn({ gameId: 'sim', turnNumber: ply, fen, previousFens: fens, ...pick, rules, wallet }, { rng, method: 'local' });
    if (!r.ok) throw new Error(r.message);
    for (const e of r.result.effects) if (e.kind === 'chips' && e.reason === 'market_payout') (payouts += e.delta), paidTurns++;
    fens.push(fen);
    fen = r.result.fenAfter;
    wallet = r.result.walletAfter!;
    plies++;
    if (r.result.outcome) break;
  }
}
console.log(`games=${GAMES} avgPlies=${(plies / GAMES).toFixed(0)} tossedPairs=${tosses}`);
console.log(`mean edge=${(edgeSum / tosses).toFixed(0)} bps (${((edgeSum / tosses) / 100).toFixed(1)} pts); even lines=${((even / tosses) * 100).toFixed(0)}%`);
console.log(`payout/game=${(payouts / GAMES).toFixed(1)} chips (both players); beat-the-line turns/game=${(paidTurns / GAMES).toFixed(1)}`);
