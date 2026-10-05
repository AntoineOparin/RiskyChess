import {
  BET_ODDS,
  hasMode,
  MODE_IDS,
  type Color,
  type GameOutcome,
  type GameRules,
  type ModeState,
  type PropBet,
  type PropBetKind,
  type PropBetStatus,
  type TurnEffect,
  type TurnResult,
} from '@risky-chess/shared';
import type { Rng } from '../rng';
import type { ModeModule, SessionLike, ValidationFailure } from './types';

/*
 * Side Bets: sealed prop bets on the opponent and on chance.
 *
 * Integrity rule: a bet is allowed only if the bettor cannot make it happen
 * unilaterally through their own executed moves (with or without their own
 * Loaded Dice stakes). Every catalog entry carries a control audit:
 * - opponent: decided by the opponent's choices (and the opponent's coin);
 * - chance: decided by coin outcomes the bettor can't weight;
 * - mixed: needs void rules (and a lower payout) to close the bettor's levers.
 */

export const BET_RULES = {
  MAX_BETS: 3,
  MIN_STAKE: 5,
  MAX_STAKE: 25,
  /** Bets may be placed while the session's turnNumber is at most this. */
  WINDOW_LAST_TURN: 4,
  HOUSE_MARGIN: 0.08,
  MIN_X100: 120,
  MAX_X100: 1000,
} as const;

export type BetControl = 'opponent' | 'chance' | 'mixed';

export interface BetEvalCtx {
  bet: PropBet;
  bettor: Color;
  /** Every resolved turn so far, oldest first. */
  history: readonly TurnResult[];
  /** Set once the game is over. */
  end?: { outcome: GameOutcome };
}

export interface BetSpec {
  kind: PropBetKind;
  /** The only params v1 accepts (prices were simulated for these). */
  params: Record<string, number>;
  control: BetControl[];
  /** Why the bettor can't force a win. Required for every entry. */
  audit: string;
  /** Whether the kind is on offer under these rules. */
  available(rules: GameRules): boolean;
  /** 'open' until decided. Pure over the history. */
  evaluate(ctx: BetEvalCtx): PropBetStatus;
}

const other = (c: Color): Color => (c === 'w' ? 'b' : 'w');
/** A busted All-In reports its declared move as executed, but nothing was played. */
export const played = (r: TurnResult) => !r.effects?.some((e) => e.kind === 'all_in' && !e.won);
const since = (ctx: BetEvalCtx) => ctx.history.filter((r) => r.turnNumber >= ctx.bet.placedAtTurn);
/** The lower-probability slot executed. Fair (50/50) tosses have no underdog. */
export const isUpset = (r: TurnResult) => !!r.coin && !!r.moveB && r.odds.A !== 5000 && (r.coin.chosen === 'A') === r.odds.A < 5000;
/** Who walked away: resign, abandon and timeout all end the game against `who`. */
const quit = (outcome: GameOutcome, who: Color) =>
  (outcome.kind === 'resign' || outcome.kind === 'abandon' || outcome.kind === 'timeout') && outcome.winner !== who;
const castlingRights = (fen: string, c: Color) => (fen.split(' ')[2] ?? '-').split('').filter((x) => (c === 'w' ? /[KQ]/ : /[kq]/).test(x)).length;

export const BET_CATALOG: Record<PropBetKind, BetSpec> = {
  opp_castles_by: {
    kind: 'opp_castles_by',
    params: { by: 10 },
    control: ['opponent'],
    audit: 'Only the opponent can castle their own king; the bettor’s moves can at most take their rights away, which loses the bet.',
    available: () => true,
    evaluate(ctx) {
      const opp = other(ctx.bettor);
      const by = ctx.bet.params.by ?? 10;
      let n = 0;
      for (const r of ctx.history) {
        if (r.mover !== opp) continue;
        n++;
        if (played(r) && /[kq]/.test(r.executed.flags)) return n <= by ? 'won' : 'lost';
        if (n >= by) return 'lost';
      }
      const fen = ctx.history.at(-1)?.fenAfter;
      if (fen && castlingRights(fen, opp) === 0) return 'lost';
      return ctx.end ? 'lost' : 'open';
    },
  },
  opp_promotes: {
    kind: 'opp_promotes',
    params: {},
    control: ['opponent'],
    audit: 'Only the opponent can promote their own pawn.',
    available: () => true,
    evaluate(ctx) {
      const opp = other(ctx.bettor);
      if (since(ctx).some((r) => r.mover === opp && played(r) && r.executed.promotion)) return 'won';
      return ctx.end ? 'lost' : 'open';
    },
  },
  opp_toss_upset: {
    kind: 'opp_toss_upset',
    params: { tosses: 5 },
    control: ['chance', 'opponent'],
    audit: 'Decided by the opponent’s own coin and the line on the opponent’s pair; the bettor’s stakes only tilt the bettor’s tosses.',
    // Without a market or stakes every toss is 50/50 and there is no underdog to back.
    available: (rules) => hasMode(rules, 'odds_market') || hasMode(rules, 'loaded_dice'),
    evaluate(ctx) {
      const opp = other(ctx.bettor);
      const want = ctx.bet.params.tosses ?? 5;
      const tosses = since(ctx).filter((r) => r.mover === opp && r.coin && r.moveB);
      const window = tosses.slice(0, want);
      if (window.some(isUpset)) return 'won';
      if (window.length >= want) return 'lost';
      return ctx.end ? 'void' : 'open';
    },
  },
  opp_all_in_bust: {
    kind: 'opp_all_in_bust',
    params: {},
    control: ['opponent', 'chance'],
    audit: 'Only the opponent can declare their All-In, on a fair coin nobody can weight.',
    available: (rules) => hasMode(rules, 'all_in'),
    evaluate(ctx) {
      const opp = other(ctx.bettor);
      const bust = since(ctx).some((r) => r.effects?.some((e) => e.kind === 'all_in' && e.color === opp && !e.won));
      if (bust) return 'won';
      return ctx.end ? 'lost' : 'open';
    },
  },
  game_length_under: {
    kind: 'game_length_under',
    params: { plies: 60 },
    control: ['mixed'],
    audit: 'The bettor’s only lever to end early is to quit: resigning, abandoning or timing out voids the bet. Ending it on the board needs the opponent’s moves and coins.',
    available: () => true,
    evaluate(ctx) {
      const plies = ctx.bet.params.plies ?? 60;
      if (ctx.history.length >= plies) return 'lost';
      if (!ctx.end) return 'open';
      return quit(ctx.end.outcome, ctx.bettor) ? 'void' : 'won';
    },
  },
  game_length_over: {
    kind: 'game_length_over',
    params: { plies: 80 },
    control: ['mixed'],
    audit: 'The bettor can’t stop the opponent from ending the game on the board; an opponent quitting early voids it instead of punishing the bettor.',
    available: () => true,
    evaluate(ctx) {
      const plies = ctx.bet.params.plies ?? 80;
      if (ctx.history.length > plies) return 'won';
      if (!ctx.end) return 'open';
      return quit(ctx.end.outcome, other(ctx.bettor)) ? 'void' : 'lost';
    },
  },
};

export const BET_KINDS = Object.keys(BET_CATALOG) as PropBetKind[];

/** Price-table key: the active modes other than side bets, in MODE_IDS order ("base" for none). */
export function betProfile(rules: GameRules): string {
  const on = MODE_IDS.filter((m) => m !== 'side_bets' && rules.modes.includes(m));
  return on.length ? on.join('+') : 'base';
}

export const payoutX100For = (p: number) =>
  Math.min(BET_RULES.MAX_X100, Math.max(BET_RULES.MIN_X100, Math.floor((100 * (1 - BET_RULES.HOUSE_MARGIN)) / p)));

/** The simulated price for a kind under these rules, or undefined if it isn't offered. */
export function betPrice(rules: GameRules, kind: PropBetKind) {
  if (!BET_CATALOG[kind].available(rules)) return undefined;
  return BET_ODDS[betProfile(rules)]?.[kind];
}

export interface BetRequest {
  kind: PropBetKind;
  params?: Record<string, number>;
  stake: number;
}

const own = (state: { modeState: ModeState }, color: Color): PropBet[] => {
  const b = state.modeState.bets?.[color];
  return Array.isArray(b) ? b : [];
};

/** Whether `color` may place this bet now. Checked by the server (and the offline engine) before any chips move. */
export function validateBet(state: SessionLike, color: Color, req: BetRequest, finished = false): ValidationFailure | null {
  if (!hasMode(state.rules, 'side_bets')) return { error: 'MODE_DISABLED', message: 'Side bets are not on in this game' };
  if (finished || state.turnNumber > BET_RULES.WINDOW_LAST_TURN) return { error: 'BETTING_CLOSED', message: 'Betting is closed' };
  const spec = BET_CATALOG[req.kind];
  const price = betPrice(state.rules, req.kind);
  if (!spec || !price) return { error: 'BET_INVALID', message: 'That bet isn’t offered at this table' };
  for (const [k, v] of Object.entries(req.params ?? {})) {
    if (spec.params[k] !== v) return { error: 'BET_INVALID', message: `Unsupported ${k} for this bet` };
  }
  const mine = own(state, color);
  if (mine.length >= BET_RULES.MAX_BETS) return { error: 'BET_LIMIT', message: `At most ${BET_RULES.MAX_BETS} bets` };
  if (mine.some((b) => b.kind === req.kind)) return { error: 'BET_INVALID', message: 'You already hold that bet' };
  if (!Number.isInteger(req.stake) || req.stake < BET_RULES.MIN_STAKE || req.stake > BET_RULES.MAX_STAKE) {
    return { error: 'INVALID_STAKE', message: `Stake ${BET_RULES.MIN_STAKE}–${BET_RULES.MAX_STAKE} chips` };
  }
  if ((state.wallet?.[color] ?? 0) < req.stake) return { error: 'INSUFFICIENT_CHIPS', message: `You have ${state.wallet?.[color] ?? 0} chips` };
  // A bet already decided at placement would be free money (or a free loss).
  const probe: PropBet = { id: 'probe', kind: req.kind, params: spec.params, stake: req.stake, payoutX100: price.payoutX100, placedAtTurn: state.turnNumber, status: 'open' };
  if (spec.evaluate({ bet: probe, bettor: color, history: state.history }) !== 'open') {
    return { error: 'BET_INVALID', message: 'That bet is already decided' };
  }
  return null;
}

/** The bet as stored, plus the stake debit. Call only after validateBet passed. */
export function placeBet(state: SessionLike, color: Color, req: BetRequest, id: string): { bet: PropBet; effects: TurnEffect[]; modeState: ModeState } {
  const spec = BET_CATALOG[req.kind];
  const bet: PropBet = {
    id,
    kind: req.kind,
    params: { ...spec.params },
    stake: req.stake,
    payoutX100: betPrice(state.rules, req.kind)!.payoutX100,
    placedAtTurn: state.turnNumber,
    status: 'open',
  };
  const modeState: ModeState = { ...state.modeState, bets: { ...state.modeState.bets, [color]: [...own(state, color), bet] } };
  return { bet, effects: [{ kind: 'chips', color, delta: -req.stake, reason: 'bet_stake' }], modeState };
}

/** Settlement effects for every open bet the history (and ending) now decides. */
export function settleBets(state: SessionLike, end?: { outcome: GameOutcome }): TurnEffect[] {
  const out: TurnEffect[] = [];
  for (const color of ['w', 'b'] as const) {
    for (const bet of own(state, color)) {
      if (bet.status !== 'open') continue;
      const status = BET_CATALOG[bet.kind].evaluate({ bet, bettor: color, history: state.history, ...(end ? { end } : {}) });
      if (status === 'open') continue;
      const payout = status === 'won' ? Math.floor((bet.stake * bet.payoutX100) / 100) : status === 'void' ? bet.stake : 0;
      out.push({ kind: 'bet_settled', color, betId: bet.id, result: status, payout });
      if (payout) out.push({ kind: 'chips', color, delta: payout, reason: status === 'won' ? 'bet_payout' : 'bet_refund' });
    }
  }
  return out;
}

/** The bot's opening bets: one or two random kinds on offer, at the minimum stake. */
export function botBets(state: SessionLike, color: Color, rng: Rng): BetRequest[] {
  const offered = BET_KINDS.filter((k) => betPrice(state.rules, k));
  const want = 1 + rng.int(2);
  const picks: BetRequest[] = [];
  const pool = [...offered];
  while (picks.length < want && pool.length) {
    const kind = pool.splice(rng.int(pool.length), 1)[0]!;
    picks.push({ kind, stake: BET_RULES.MIN_STAKE });
  }
  return picks;
}

export const sideBets: ModeModule = {
  id: 'side_bets',
  afterTurn: (state, result) => settleBets(state, result.outcome ? { outcome: result.outcome } : undefined),
  onGameOver: (state, outcome) => settleBets(state, { outcome }),
};
