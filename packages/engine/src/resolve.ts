import { Chess } from 'chess.js';
import {
  CLASSIC_RULES,
  ECONOMY,
  hasMode,
  usesChips,
  type CoinToss,
  type GameRules,
  type ModeState,
  type MoveInput,
  type MoveSlot,
  type TurnEffect,
  type TurnExtras,
  type TurnResult,
  type Wallet,
} from '@risky-chess/shared';
import { applyEffects, applyModeEffects } from './economy';
import { activeModules, type Applied, type ModeModule, type ApplyResult, type SessionLike, type TossRoll, type TurnCtx, type ValidationFailure } from './modes';
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
  /** Required when a chip mode is on. */
  wallet?: Wallet;
  modeState?: ModeState;
  extras?: TurnExtras;
  /** Resolved turns so far; mode hooks (bet settlement) read it. */
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
  if ((extras.stake || extras.favor) && !hasMode(rules, 'loaded_dice')) {
    return { error: 'MODE_DISABLED', message: 'Loaded Dice is not on in this game' };
  }
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
  if (usesChips(rules) && !input.wallet) throw new Error('resolveTurn: a chip mode is on but no wallet was given');

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
    ...(input.wallet ? { wallet: input.wallet } : {}),
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
 * The turn pipeline: base validation → mode validation → odds (base → modules
 * → clamp) → roll → apply (module override or the default move) → effects
 * (capture income, then modules) → end conditions → after-turn hooks.
 * Pure apart from the coin source in `deps`.
 */
export function resolveTurn(input: ResolveInput, depsOrTosser: ResolveDeps | Tosser): ResolveOutput {
  const deps: ResolveDeps = typeof depsOrTosser === 'function' ? { tosser: depsOrTosser } : depsOrTosser;
  const prepared = prepareTurn(input);
  if (!prepared.ok) return prepared;
  const { ctx, modules } = prepared;
  const { rules, mover, modeState, history } = ctx;
  const chips = usesChips(rules);

  const tossed = toss(ctx, deps);
  const odds = tossed?.roll.odds ?? FAIR_ODDS;
  const breakdown = tossed?.steps ?? [];

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
  if (breakdown.length) effects.push({ kind: 'odds_breakdown', steps: breakdown });
  if (chips && full.captured) {
    effects.push({ kind: 'chips', color: mover, delta: ECONOMY.CAPTURE_INCOME[full.captured], reason: 'capture' });
  }
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

  // After-turn hooks see the session as it stands with this turn applied.
  let wallet = input.wallet ? applyEffects(input.wallet, effects) : undefined;
  const after: SessionLike = {
    rules,
    ...(wallet ? { wallet } : {}),
    modeState: applyModeEffects(modeState, effects),
    history: [...history, result],
    fen: result.fenAfter,
    turnNumber: input.turnNumber + 1,
  };
  const late = modules.flatMap((m) => m.afterTurn?.(after, result) ?? []);
  if (late.length) {
    effects.push(...late);
    if (wallet) wallet = applyEffects(wallet, late);
  }
  if (wallet) result.walletAfter = wallet;
  return { ok: true, result };
}

/** Applies a resolved turn's effects to a session's wallet and mode state. */
export function commitEffects<S extends { wallet?: Wallet; modeState: ModeState }>(state: S, effects: readonly TurnEffect[], walletAfter?: Wallet): S {
  return {
    ...state,
    ...(walletAfter ? { wallet: walletAfter } : state.wallet ? { wallet: applyEffects(state.wallet, effects) } : {}),
    modeState: applyModeEffects(state.modeState, effects),
  };
}

/** Effects for a game that ended off the board (resign, abandon, timeout): open bets settle or void. */
export function gameOverEffects(state: SessionLike, outcome: NonNullable<TurnResult['outcome']>): TurnEffect[] {
  return activeModules(state.rules).flatMap((m) => m.onGameOver?.(state, outcome) ?? []);
}
