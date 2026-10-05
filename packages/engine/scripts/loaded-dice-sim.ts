/**
 * Loaded Dice balance check: bot-vs-bot self-play, reporting the chips each
 * player spends on stakes per game as a share of the starting stack.
 * Design target: 40–70%. Run: pnpm --filter @risky-chess/engine sim:dice [games]
 */
import { ECONOMY, START_FEN, type GameRules } from '@risky-chess/shared';
import { pickBotSubmission, resolveTurn, seededRng, startingWallet } from '../src';

const GAMES = Number(process.argv[2] ?? 300);
const MAX_PLIES = 300;
const rules: GameRules = { modes: ['loaded_dice'] };
const rng = seededRng(2026);

let spent = 0;
let earned = 0;
let plies = 0;
let staked = 0;
let broke = 0;
for (let g = 0; g < GAMES; g++) {
  let fen = START_FEN;
  let wallet = startingWallet(rules)!;
  const fens: string[] = [];
  for (let ply = 1; ply <= MAX_PLIES; ply++) {
    const pick = pickBotSubmission(fen, { rules, wallet, modeState: {}, history: [], fen, turnNumber: ply }, rng);
    const r = resolveTurn({ gameId: 'sim', turnNumber: ply, fen, previousFens: fens, ...pick, rules, wallet }, { rng, method: 'local' });
    if (!r.ok) throw new Error(r.message);
    for (const e of r.result.effects) {
      if (e.kind !== 'chips') continue;
      if (e.reason === 'stake') (spent -= e.delta), staked++;
      if (e.reason === 'capture') earned += e.delta;
    }
    fens.push(fen);
    fen = r.result.fenAfter;
    wallet = r.result.walletAfter!;
    plies++;
    if (r.result.outcome) break;
  }
  if (wallet.w < 10 || wallet.b < 10) broke++;
}
const perPlayer = spent / (GAMES * 2);
console.log(`games=${GAMES} avgPlies=${(plies / GAMES).toFixed(0)} stakesPerPlayer=${(staked / GAMES / 2).toFixed(1)}`);
console.log(`spent/player/game=${perPlayer.toFixed(1)} chips = ${((perPlayer / ECONOMY.START_CHIPS) * 100).toFixed(0)}% of stack (target 40–70%)`);
console.log(`capture income/player/game=${(earned / GAMES / 2).toFixed(1)}  games ending with a player under 10 chips: ${broke}`);
