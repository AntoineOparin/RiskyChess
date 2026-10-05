/**
 * Side Bets pricing: bot-vs-bot self-play per rule profile, evaluating every
 * catalog bet (as if placed at turn 1, for both colors) with the same
 * predicates the engine settles with. Writes packages/shared/src/betOdds.ts.
 *
 *   pnpm --filter @risky-chess/engine price:bets [games=2000]
 *
 * Profiles run in parallel child processes (one per rule set).
 */
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { START_FEN, type GameOutcome, type GameRules, type ModeId, type PropBetKind, type TurnResult } from '@risky-chess/shared';
import { applyModeEffects, BET_CATALOG, BET_KINDS, betProfile, payoutX100For, pickBotSubmission, resolveTurn, seededRng, startingWallet } from '../src';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '../../shared/src/betOdds.ts');
const MAX_PLIES = 300;
const OTHER: ModeId[] = ['loaded_dice', 'odds_market', 'all_in'];

type Tally = Partial<Record<PropBetKind, { won: number; lost: number; void: number }>>;

function simulate(rules: GameRules, games: number, seed: number): Tally {
  const rng = seededRng(seed);
  const tally: Tally = {};
  const kinds = BET_KINDS.filter((k) => BET_CATALOG[k].available(rules));
  for (const k of kinds) tally[k] = { won: 0, lost: 0, void: 0 };
  for (let g = 0; g < games; g++) {
    let fen = START_FEN;
    let wallet = startingWallet(rules)!;
    let modeState = {};
    const history: TurnResult[] = [];
    let outcome: GameOutcome | undefined;
    for (let ply = 1; ply <= MAX_PLIES && !outcome; ply++) {
      const pick = pickBotSubmission(fen, { rules, wallet, modeState, history, fen, turnNumber: ply }, rng);
      const r = resolveTurn(
        { gameId: 'sim', turnNumber: ply, fen, previousFens: history.map((h) => h.fenBefore), ...pick, rules, wallet, modeState, history },
        { rng, method: 'local' },
      );
      if (!r.ok) throw new Error(r.message);
      history.push(r.result);
      fen = r.result.fenAfter;
      wallet = r.result.walletAfter!;
      modeState = applyModeEffects(modeState, r.result.effects);
      outcome = r.result.outcome;
    }
    // A capped game ends as an agreed draw.
    const end = { outcome: outcome ?? ({ kind: 'draw', reason: 'agreement' } as const) };
    for (const kind of kinds) {
      const spec = BET_CATALOG[kind];
      for (const bettor of ['w', 'b'] as const) {
        const bet = { id: 'x', kind, params: spec.params, stake: 5, payoutX100: 100, placedAtTurn: 1, status: 'open' as const };
        const status = spec.evaluate({ bet, bettor, history, end });
        if (status !== 'open') tally[kind]![status]++;
      }
    }
  }
  return tally;
}

const [mode, arg1, arg2] = process.argv.slice(2);
if (mode === '--worker') {
  // Child: one profile, prints its tally as JSON.
  const modes = arg1 === 'base' ? [] : (arg1!.split('+') as ModeId[]);
  const rules: GameRules = { modes: [...modes, 'side_bets'] };
  process.stdout.write(JSON.stringify(simulate(rules, Number(arg2), 1000 + modes.length * 97 + arg1!.length)));
} else {
  const games = Number(mode ?? 2000);
  const profiles = Array.from({ length: 1 << OTHER.length }, (_, mask) => OTHER.filter((_, i) => mask & (1 << i)))
    .map((modes) => betProfile({ modes }));
  const self = fileURLToPath(import.meta.url);
  const started = Date.now();
  const results = await Promise.all(
    profiles.map(
      (profile) =>
        new Promise<[string, Tally]>((resolve, reject) => {
          const child = spawn(process.execPath, [...process.execArgv, self, '--worker', profile, String(games)], { stdio: ['ignore', 'pipe', 'inherit'] });
          let out = '';
          child.stdout.on('data', (d) => (out += d));
          child.on('exit', (code) => {
            if (code !== 0) return reject(new Error(`${profile} exited ${code}`));
            console.error(`  ${profile} done in ${((Date.now() - started) / 60000).toFixed(1)} min`);
            resolve([profile, JSON.parse(out) as Tally]);
          });
        }),
    ),
  );

  const lines: string[] = [];
  for (const [profile, tally] of results) {
    const entries: string[] = [];
    for (const [kind, t] of Object.entries(tally) as [PropBetKind, { won: number; lost: number; void: number }][]) {
      const n = t.won + t.lost;
      // Never price off a zero: a bet that never won in simulation pays the 10× cap.
      const p = Math.max(t.won, 0.5) / Math.max(n, 1);
      entries.push(`    ${kind}: { p: ${p.toFixed(4)}, payoutX100: ${payoutX100For(p)}, n: ${n} }, // won ${t.won}, lost ${t.lost}, void ${t.void}`);
      console.log(`${profile.padEnd(32)} ${kind.padEnd(18)} p=${p.toFixed(3)} ×${(payoutX100For(p) / 100).toFixed(2)} (won ${t.won} / lost ${t.lost} / void ${t.void})`);
    }
    lines.push(`  '${profile}': {\n${entries.join('\n')}\n  },`);
  }
  const header = readFileSync(OUT, 'utf8').split('/** Profile key')[0]!.replace(/^\/\/.*\n/gm, '');
  const commit = (() => {
    try {
      return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
    } catch {
      return 'unknown';
    }
  })();
  writeFileSync(
    OUT,
    `// GENERATED by packages/engine/scripts/price-bets.ts — do not edit by hand.\n` +
      `// ${games} bot-vs-bot games per profile (each bet sampled for both colors, placed at turn 1),\n` +
      `// payoutX100 = clamp(floor(100 × (1 − 0.08) / p), 120, 1000). Generated at ${commit}.\n` +
      header.trimStart() +
      `/** Profile key (the active non-bet modes, e.g. "loaded_dice+all_in", or "base") → price per available kind. */\n` +
      `export const BET_ODDS: Record<string, Partial<Record<PropBetKind, BetPrice>>> = {\n${lines.join('\n')}\n};\n`,
  );
  console.error(`wrote ${OUT}`);
}
