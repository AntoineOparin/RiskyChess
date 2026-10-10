import { Chess } from 'chess.js';
import {
  CLASSIC_RULES,
  hasMode,
  type CoinToss,
  type GameRules,
  type ModeState,
  type MoveInput,
  type MoveSlot,
  type TurnEffect,
  type TurnExtras,
  type TurnResult,
} from '@risky-chess/shared';
import { activeModules, type Applied, type ModeModule, type ApplyResult, type TossRoll, type TurnCtx, type ValidationFailure } from './modes';
import { computeOdds, FAIR_ODDS, type OddsLine } from './odds';
import type { Rng, Tosser } from './rng';
import { deriveOutcome } from './status';
import { validateSubmission } from './validate';

export interface ResolveInput {
  gameId: string;
  turnNumber: number;
  /** Current authoritative position. */
  fen: string;
  /** Every position reached before `fen` (start position first), for repetition detection. */
  previousFens: readonly string[];
  moveA: MoveInput;
  moveB: MoveInput | null;
  now?: number;
  /** Defaults to classic. */
  rules?: GameRules;
  modeState?: ModeState;
  extras?: TurnExtras;
  /** Resolved turns so far, for mode hooks. */
  history?: readonly TurnResult[];
}

/** Where the coin comes from. Exactly one of `rng`, `forceSlot` or `tosser` drives it. */
export interface ResolveDeps {
  /** Draws the 0–9999 roll; slot A executes when roll < odds.A. */
  rng?: Rng;
  method?: CoinToss['method'];
  /** Commit-reveal fields copied onto the coin. */
  proof?: Pick<CoinToss, 'commitment' | 'serverSeed' | 'clientSeed'>;
  /** Test seam: skip the roll and land on this slot. */
  forceSlot?: MoveSlot;
  /** Legacy test seam: decides the slot from the two moves. */
  tosser?: Tosser;
}

export type ResolveOutput = { ok: true; result: TurnResult } | ({ ok: false } & ValidationFailure);

/** Side to move in a FEN. The session's turn is always derived from this, never flipped. */
export const sideToMove = (fen: string) => (fen.split(' ')[1] === 'b' ? ('b' as const) : ('w' as const));

/** Extras that need a mode which is off. */
function disabledExtras(rules: GameRules, extras: TurnExtras): ValidationFailure | null {
  if (extras.allIn && !hasMode(rules, 'all_in')) return { error: 'MODE_DISABLED', message: 'All-In is not on in this game' };
  return null;
}

function toss(ctx: TurnCtx, deps: ResolveDeps): { roll: TossRoll; coin: CoinToss; steps: OddsLine['steps'] } | null {
  if (ctx.forced) return null;
  const { odds, steps } = computeOdds(ctx);
  let chosen: MoveSlot;
  let roll: number | null = null;
  let method: CoinToss['method'] = deps.method ?? 'local';
  let extra: Partial<CoinToss> = {};
  if (deps.tosser) {
    const t = deps.tosser(ctx.moveA, ctx.moveB ?? ctx.moveA);
    ({ chosen, method } = t);
    extra = t;
  } else if (deps.forceSlot) {
    chosen = deps.forceSlot;
  } else if (deps.rng) {
    roll = deps.rng.int(10_000);
    chosen = roll < odds.A ? 'A' : 'B';
  } else {
    throw new Error('resolveTurn needs deps.rng, deps.forceSlot or deps.tosser');
  }
  const coin: CoinToss = { ...extra, ...deps.proof, chosen, method, ...(roll !== null ? { roll } : {}) };
  return { roll: { odds, roll, chosen }, coin, steps };
}

type Prepared = { ok: true; ctx: TurnCtx; modules: ModeModule[] } | ({ ok: false } & ValidationFailure);

/** Base validation, then mode validation, producing the context every hook reads. */
function prepareTurn(input: ResolveInput): Prepared {
  const rules = input.rules ?? CLASSIC_RULES;
  const extras = input.extras ?? {};

  const disabled = disabledExtras(rules, extras);
  if (disabled) return { ok: false, ...disabled };

  const v = validateSubmission(input.fen, input.moveA, input.moveB, { single: !!extras.allIn });
  if (!v.ok) return v;

  const ctx: TurnCtx = {
    gameId: input.gameId,
    turnNumber: input.turnNumber,
    fen: input.fen,
    mover: sideToMove(input.fen),
    rules,
    modeState: input.modeState ?? {},
    extras,
    moveA: v.moveA,
    moveB: v.moveB,
    forced: v.forced,
    history: input.history ?? [],
  };
  const modules = activeModules(rules);
  for (const m of modules) {
    const bad = m.validate?.(ctx);
    if (bad) return { ok: false, ...bad };
  }
  return { ok: true, ctx, modules };
}

/**
 * The odds a submission would be tossed at, without tossing: what clients
 * preview while the player builds a pair. Identical to the server's line.
 */
export function previewOdds(input: ResolveInput): ({ ok: true } & OddsLine) | ({ ok: false } & ValidationFailure) {
  const prepared = prepareTurn(input);
  if (!prepared.ok) return prepared;
  if (prepared.ctx.forced) return { ok: true, odds: FAIR_ODDS, steps: [] };
  return { ok: true, ...computeOdds(prepared.ctx) };
}

/**
 * The turn pipeline: base validation → mode validation → odds → roll →
 * apply (module override or the default move) → effects → end conditions.
 * Pure apart from the coin source in `deps`.
 */
export function resolveTurn(input: ResolveInput, depsOrTosser: ResolveDeps | Tosser): ResolveOutput {
  const deps: ResolveDeps = typeof depsOrTosser === 'function' ? { tosser: depsOrTosser } : depsOrTosser;
  const prepared = prepareTurn(input);
  if (!prepared.ok) return prepared;
  const { ctx, modules } = prepared;
  const { mover } = ctx;

  const tossed = toss(ctx, deps);
  const odds = tossed?.roll.odds ?? FAIR_ODDS;

  let applied: ApplyResult | null = null;
  for (const m of modules) {
    applied = m.apply?.(ctx, tossed?.roll ?? null) ?? null;
    if (applied) break;
  }
  let chess: Chess;
  if (applied) {
    chess = new Chess(applied.fenAfter);
  } else {
    const executed = tossed?.roll.chosen === 'B' && ctx.moveB ? ctx.moveB : ctx.moveA;
    chess = new Chess(input.fen);
    chess.move({ from: executed.from, to: executed.to, ...(executed.promotion ? { promotion: executed.promotion } : {}) });
    applied = { executed, fenAfter: chess.fen(), ...(executed.captured ? { captured: executed.captured } : {}) };
  }
  const full: Applied = { ...applied, roll: tossed?.roll ?? null };

  const effects: TurnEffect[] = [];
  for (const m of modules) effects.push(...(m.effects?.(ctx, full) ?? []));

  const outcome = deriveOutcome(chess, [...input.previousFens, input.fen]);
  const result: TurnResult = {
    gameId: input.gameId,
    turnNumber: input.turnNumber,
    mover,
    fenBefore: input.fen,
    moveA: ctx.moveA,
    moveB: ctx.moveB,
    forced: ctx.forced,
    coin: tossed?.coin ?? null,
    odds,
    executed: full.executed,
    fenAfter: full.fenAfter,
    inCheck: chess.inCheck(),
    status: outcome ? 'finished' : 'awaiting_submission',
    effects,
    resolvedAt: input.now ?? Date.now(),
  };
  if (outcome) result.outcome = outcome;
  return { ok: true, result };
}

/** Mode state is derived from effects: an All-In declaration uses up that piece type. */
export function applyModeEffects(state: ModeState, effects: readonly TurnEffect[]): ModeState {
  let next = state;
  for (const e of effects) {
    if (e.kind === 'all_in') {
      const used = next.allInsUsed ?? { w: [], b: [] };
      next = { ...next, allInsUsed: { ...used, [e.color]: [...used[e.color], e.piece] } };
    }
  }
  return next;
}
