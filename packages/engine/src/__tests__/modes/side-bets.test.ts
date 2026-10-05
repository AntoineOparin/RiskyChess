import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import {
  START_FEN,
  type Color,
  type GameOutcome,
  type GameRules,
  type ModeState,
  type MoveInput,
  type PropBet,
  type PropBetKind,
  type TurnResult,
} from '@risky-chess/shared';
import {
  applyEffects,
  applyModeEffects,
  BET_CATALOG,
  BET_KINDS,
  BET_RULES,
  betPrice,
  botBets,
  gameOverEffects,
  payoutX100For,
  pickBotSubmission,
  placeBet,
  previewOdds,
  resolveTurn,
  seededRng,
  settleBets,
  startingWallet,
  validateBet,
  type BetEvalCtx,
  type SessionLike,
} from '../..';

const m = (lan: string): MoveInput => ({ from: lan.slice(0, 2), to: lan.slice(2, 4), ...(lan[4] ? { promotion: lan[4] } : {}) }) as MoveInput;
const HIGH: GameRules = { modes: ['loaded_dice', 'odds_market', 'all_in', 'side_bets'] };
const BETS_ONLY: GameRules = { modes: ['side_bets'] };

/** A minimal resolved turn with just the fields the predicates read. */
function t(n: number, mover: Color, o: { flags?: string; promotion?: 'q'; oddsA?: number; chosen?: 'A' | 'B'; single?: boolean; bust?: boolean; castling?: string } = {}): TurnResult {
  const move = { from: 'a2', to: 'a3', san: 'x', lan: 'a2a3', piece: 'p', flags: o.flags ?? 'n', ...(o.promotion ? { promotion: o.promotion } : {}) };
  return {
    gameId: 'g',
    turnNumber: n,
    mover,
    fenBefore: START_FEN,
    moveA: move,
    moveB: o.single ? null : move,
    forced: false,
    coin: { chosen: o.chosen ?? 'A', method: 'local' },
    odds: { A: o.oddsA ?? 5000 },
    executed: move,
    fenAfter: `8/8/8/8/8/8/8/8 w ${o.castling ?? 'KQkq'} - 0 1`,
    inCheck: false,
    status: 'awaiting_submission',
    effects: o.bust !== undefined ? [{ kind: 'all_in', color: mover, won: !o.bust, piece: 'p', square: 'a2', bonusPly: false }] : [],
    resolvedAt: 0,
  } as TurnResult;
}
/** Alternating plies starting with White; `special` replaces given ply numbers. */
function plies(count: number, special: Record<number, TurnResult> = {}): TurnResult[] {
  return Array.from({ length: count }, (_, i) => special[i + 1] ?? t(i + 1, i % 2 === 0 ? 'w' : 'b'));
}
const bet = (kind: PropBetKind, placedAtTurn = 1): PropBet => ({ id: kind, kind, params: BET_CATALOG[kind].params, stake: 10, payoutX100: 300, placedAtTurn, status: 'open' });
const evalBet = (kind: PropBetKind, history: TurnResult[], end?: GameOutcome, bettor: Color = 'w', placedAtTurn = 1) => {
  const ctx: BetEvalCtx = { bet: bet(kind, placedAtTurn), bettor, history, ...(end ? { end: { outcome: end } } : {}) };
  return BET_CATALOG[kind].evaluate(ctx);
};
const MATE_W: GameOutcome = { kind: 'checkmate', winner: 'w' };

describe('catalog', () => {
  it('has a control audit on every entry', () => {
    for (const k of BET_KINDS) {
      expect(BET_CATALOG[k].audit.length).toBeGreaterThan(20);
      expect(BET_CATALOG[k].control.length).toBeGreaterThan(0);
    }
  });

  it('prices every offered kind within 1.2×–10×', () => {
    for (const rules of [BETS_ONLY, HIGH]) {
      for (const k of BET_KINDS) {
        const price = betPrice(rules, k);
        if (!BET_CATALOG[k].available(rules)) expect(price).toBeUndefined();
        else {
          expect(price).toBeDefined();
          expect(price!.payoutX100).toBeGreaterThanOrEqual(120);
          expect(price!.payoutX100).toBeLessThanOrEqual(1000);
        }
      }
    }
    expect(payoutX100For(0.5)).toBe(184);
    expect(payoutX100For(0.99)).toBe(120);
    expect(payoutX100For(0.01)).toBe(1000);
  });

  it('gates kinds by mode', () => {
    expect(BET_CATALOG.opp_all_in_bust.available(BETS_ONLY)).toBe(false);
    expect(BET_CATALOG.opp_toss_upset.available(BETS_ONLY)).toBe(false);
    expect(BET_CATALOG.opp_all_in_bust.available(HIGH)).toBe(true);
    expect(BET_CATALOG.opp_toss_upset.available({ modes: ['loaded_dice', 'side_bets'] })).toBe(true);
  });
});

describe('predicates', () => {
  it('opp_castles_by: won on their castle by move 10, lost when rights go or move 10 passes', () => {
    expect(evalBet('opp_castles_by', plies(8, { 8: t(8, 'b', { flags: 'k' }) }))).toBe('won');
    expect(evalBet('opp_castles_by', plies(8, { 7: t(7, 'w', { flags: 'k' }) }))).toBe('open'); // the bettor castling is irrelevant
    expect(evalBet('opp_castles_by', plies(20))).toBe('lost'); // Black's 10th move passed
    expect(evalBet('opp_castles_by', plies(19))).toBe('open');
    expect(evalBet('opp_castles_by', plies(6, { 6: t(6, 'b', { castling: 'KQ' }) }))).toBe('lost');
    expect(evalBet('opp_castles_by', plies(6), MATE_W)).toBe('lost');
    // A busted All-In never played its move.
    expect(evalBet('opp_castles_by', plies(6, { 6: t(6, 'b', { flags: 'k', bust: true }) }))).toBe('open');
  });

  it('opp_promotes: won on their promotion, lost at game end', () => {
    expect(evalBet('opp_promotes', plies(30, { 30: t(30, 'b', { promotion: 'q' }) }))).toBe('won');
    expect(evalBet('opp_promotes', plies(30, { 29: t(29, 'w', { promotion: 'q' }) }))).toBe('open');
    expect(evalBet('opp_promotes', plies(30), MATE_W)).toBe('lost');
    expect(evalBet('opp_promotes', plies(30, { 30: t(30, 'b', { promotion: 'q', bust: true }) }))).toBe('open');
  });

  it('opp_toss_upset: won when their underdog lands in their next 5 tosses, void if the game ends first', () => {
    const upset = t(4, 'b', { oddsA: 3500, chosen: 'A' });
    expect(evalBet('opp_toss_upset', plies(6, { 4: upset }))).toBe('won');
    expect(evalBet('opp_toss_upset', plies(6, { 4: t(4, 'b', { oddsA: 3500, chosen: 'B' }) }))).toBe('open');
    expect(evalBet('opp_toss_upset', plies(10))).toBe('lost'); // five fair Black tosses, no underdog
    expect(evalBet('opp_toss_upset', plies(12, { 12: t(12, 'b', { oddsA: 7000, chosen: 'B' }) }))).toBe('lost'); // sixth toss is outside the window
    expect(evalBet('opp_toss_upset', plies(6), MATE_W)).toBe('void');
    // The bettor's own upsets and All-In coins don't count.
    expect(evalBet('opp_toss_upset', plies(6, { 3: t(3, 'w', { oddsA: 3500, chosen: 'A' }), 4: t(4, 'b', { single: true, oddsA: 5000 }) }))).toBe('open');
  });

  it('opp_all_in_bust: won on their bust, lost at game end', () => {
    expect(evalBet('opp_all_in_bust', plies(10, { 10: t(10, 'b', { single: true, bust: true }) }))).toBe('won');
    expect(evalBet('opp_all_in_bust', plies(10, { 10: t(10, 'b', { single: true, bust: false }) }))).toBe('open');
    expect(evalBet('opp_all_in_bust', plies(10, { 9: t(9, 'w', { single: true, bust: true }) }))).toBe('open');
    expect(evalBet('opp_all_in_bust', plies(10), MATE_W)).toBe('lost');
  });

  it('game_length_under: won on an early finish, lost at ply 60, void if the bettor quits', () => {
    expect(evalBet('game_length_under', plies(59))).toBe('open');
    expect(evalBet('game_length_under', plies(59), MATE_W)).toBe('won');
    expect(evalBet('game_length_under', plies(60))).toBe('lost');
    expect(evalBet('game_length_under', plies(20), { kind: 'resign', winner: 'b' })).toBe('void');
    expect(evalBet('game_length_under', plies(20), { kind: 'abandon', winner: 'b' })).toBe('void');
    expect(evalBet('game_length_under', plies(20), { kind: 'timeout', winner: 'b' })).toBe('void');
    expect(evalBet('game_length_under', plies(20), { kind: 'resign', winner: 'w' })).toBe('won'); // the opponent quit
  });

  it('game_length_over: won at ply 81, lost on an earlier finish, void if the opponent quits', () => {
    expect(evalBet('game_length_over', plies(80))).toBe('open');
    expect(evalBet('game_length_over', plies(81))).toBe('won');
    expect(evalBet('game_length_over', plies(40), MATE_W)).toBe('lost');
    expect(evalBet('game_length_over', plies(40), { kind: 'resign', winner: 'w' })).toBe('void');
    expect(evalBet('game_length_over', plies(40), { kind: 'resign', winner: 'b' })).toBe('lost'); // the bettor quit
  });

  it('only counts turns after placement for opponent events', () => {
    expect(evalBet('opp_promotes', plies(6, { 2: t(2, 'b', { promotion: 'q' }) }), undefined, 'w', 3)).toBe('open');
  });
});

describe('placement', () => {
  const state = (o: Partial<SessionLike> = {}): SessionLike => ({ rules: HIGH, wallet: { w: 100, b: 100 }, modeState: {}, history: [], fen: START_FEN, turnNumber: 1, ...o });

  it('accepts a valid bet and debits the stake', () => {
    expect(validateBet(state(), 'w', { kind: 'opp_promotes', stake: 10 })).toBeNull();
    const placed = placeBet(state(), 'w', { kind: 'opp_promotes', stake: 10 }, 'id1');
    expect(placed.bet).toMatchObject({ id: 'id1', kind: 'opp_promotes', stake: 10, placedAtTurn: 1, status: 'open', payoutX100: betPrice(HIGH, 'opp_promotes')!.payoutX100 });
    expect(placed.effects).toEqual([{ kind: 'chips', color: 'w', delta: -10, reason: 'bet_stake' }]);
    expect(placed.modeState.bets?.w).toEqual([placed.bet]);
  });

  it('enforces the window, the limit, stakes, chips, modes and params', () => {
    expect(validateBet(state({ rules: { modes: ['loaded_dice'] } }), 'w', { kind: 'opp_promotes', stake: 10 })).toMatchObject({ error: 'MODE_DISABLED' });
    expect(validateBet(state({ turnNumber: 5 }), 'w', { kind: 'opp_promotes', stake: 10 })).toMatchObject({ error: 'BETTING_CLOSED' });
    expect(validateBet(state(), 'w', { kind: 'opp_promotes', stake: 10 }, true)).toMatchObject({ error: 'BETTING_CLOSED' });
    expect(validateBet(state({ turnNumber: 4 }), 'w', { kind: 'opp_promotes', stake: 10 })).toBeNull();
    expect(validateBet(state(), 'w', { kind: 'opp_promotes', stake: 4 })).toMatchObject({ error: 'INVALID_STAKE' });
    expect(validateBet(state(), 'w', { kind: 'opp_promotes', stake: 26 })).toMatchObject({ error: 'INVALID_STAKE' });
    expect(validateBet(state({ wallet: { w: 7, b: 100 } }), 'w', { kind: 'opp_promotes', stake: 10 })).toMatchObject({ error: 'INSUFFICIENT_CHIPS' });
    expect(validateBet(state({ rules: BETS_ONLY }), 'w', { kind: 'opp_all_in_bust', stake: 10 })).toMatchObject({ error: 'BET_INVALID' });
    expect(validateBet(state(), 'w', { kind: 'game_length_under', params: { plies: 20 }, stake: 10 })).toMatchObject({ error: 'BET_INVALID' });
    expect(validateBet(state(), 'w', { kind: 'game_length_under', params: { plies: 60 }, stake: 10 })).toBeNull();

    let s = state();
    for (const kind of ['opp_promotes', 'game_length_under', 'game_length_over'] as const) s = { ...s, modeState: placeBet(s, 'w', { kind, stake: 5 }, kind).modeState };
    expect(validateBet(s, 'w', { kind: 'opp_castles_by', stake: 5 })).toMatchObject({ error: 'BET_LIMIT' });
    expect(validateBet(s, 'b', { kind: 'opp_castles_by', stake: 5 })).toBeNull();
    expect(validateBet({ ...state(), modeState: placeBet(state(), 'w', { kind: 'opp_promotes', stake: 5 }, 'x').modeState }, 'w', { kind: 'opp_promotes', stake: 5 })).toMatchObject({
      error: 'BET_INVALID',
    });
  });

  it('refuses a bet that is already decided', () => {
    // Black already gave up both castling rights.
    const history = plies(2, { 2: t(2, 'b', { castling: 'KQ' }) });
    expect(validateBet(state({ history, turnNumber: 3 }), 'w', { kind: 'opp_castles_by', stake: 5 })).toMatchObject({ error: 'BET_INVALID' });
  });
});

describe('settlement', () => {
  const withBets = (bets: PropBet[], color: Color = 'w'): SessionLike => ({
    rules: HIGH,
    wallet: { w: 100, b: 100 },
    modeState: { bets: { [color]: bets } },
    history: plies(81),
    fen: START_FEN,
    turnNumber: 82,
  });

  it('pays stake × multiplier on a win, nothing on a loss, the stake back on a void', () => {
    const won = { ...bet('game_length_over'), stake: 7, payoutX100: 345 };
    const lost = { ...bet('game_length_under'), id: 'u', stake: 10 };
    expect(settleBets(withBets([won, lost]))).toEqual([
      { kind: 'bet_settled', color: 'w', betId: 'game_length_over', result: 'won', payout: 24 },
      { kind: 'chips', color: 'w', delta: 24, reason: 'bet_payout' },
      { kind: 'bet_settled', color: 'w', betId: 'u', result: 'lost', payout: 0 },
    ]);
    const s = { ...withBets([bet('game_length_under')]), history: plies(10) };
    expect(gameOverEffects(s, { kind: 'resign', winner: 'b' })).toEqual([
      { kind: 'bet_settled', color: 'w', betId: 'game_length_under', result: 'void', payout: 10 },
      { kind: 'chips', color: 'w', delta: 10, reason: 'bet_refund' },
    ]);
  });

  it('never settles a bet twice', () => {
    const s = withBets([bet('game_length_over')]);
    const effects = settleBets(s);
    const after = { ...s, modeState: applyModeEffects(s.modeState, effects) };
    expect(settleBets(after)).toEqual([]);
  });
});

/**
 * Integrity: for every catalog entry, a scripted game in which the opponent
 * (and the coin, which the bettor can't weight) steer away from the event.
 * Whatever the bettor plays, the bet must never settle won.
 */
describe('integrity: the bettor alone cannot force a win', () => {
  /** The opponent's avoidant pair: never castles, never promotes, never goes All-In. */
  function avoidPair(fen: string): { moveA: MoveInput; moveB: MoveInput | null } {
    const legal = new Chess(fen).moves({ verbose: true });
    const safe = legal.filter((x) => !x.flags.includes('k') && !x.flags.includes('q') && !x.promotion);
    const pool = (safe.length ? safe : legal).map((x) => m(x.lan));
    return { moveA: pool[0]!, moveB: legal.length > 1 ? (pool[1] ?? m(legal.find((x) => x.lan !== legal[0]!.lan)!.lan)) : null };
  }

  /** The bettor plays the engine bot (stakes, All-Ins and all); the coin always lands on the favored slot. */
  function run(bettor: Color, rules: GameRules, kind: PropBetKind, maxPlies: number, quitAt?: { ply: number; outcome: GameOutcome }) {
    const rng = seededRng(5);
    let fen = START_FEN;
    let wallet = startingWallet(rules)!;
    let modeState: ModeState = {};
    const history: TurnResult[] = [];
    const placed = placeBet({ rules, wallet, modeState, history, fen, turnNumber: 1 }, bettor, { kind, stake: 5 }, 'b1');
    modeState = placed.modeState;
    wallet = applyEffects(wallet, placed.effects);
    const status = () => (modeState.bets?.[bettor] as PropBet[])[0]!.status;
    for (let ply = 1; ply <= maxPlies; ply++) {
      const mover = fen.split(' ')[1] as Color;
      const sub = mover === bettor ? pickBotSubmission(fen, { rules, wallet, modeState, history, fen, turnNumber: ply }, rng) : avoidPair(fen);
      const input = { gameId: 'g', turnNumber: ply, fen, previousFens: history.map((h) => h.fenBefore), ...sub, rules, wallet, modeState, history };
      const line = previewOdds(input);
      const r = resolveTurn(input, { forceSlot: line.ok && line.odds.A < 5000 ? 'B' : 'A' });
      if (!r.ok) throw new Error(`ply ${ply} (${mover}): ${r.message}`);
      history.push(r.result);
      fen = r.result.fenAfter;
      wallet = r.result.walletAfter!;
      modeState = applyModeEffects(modeState, r.result.effects);
      expect(status()).not.toBe('won');
      if (r.result.outcome) break;
      if (quitAt?.ply === ply) {
        modeState = applyModeEffects(modeState, gameOverEffects({ rules, wallet, modeState, history, fen, turnNumber: ply + 1 }, quitAt.outcome));
        break;
      }
    }
    return status();
  }

  it.each([
    ['opp_castles_by', 24],
    ['opp_promotes', 60],
    ['opp_toss_upset', 14],
    ['opp_all_in_bust', 60],
  ] as const)('%s: never won when the opponent avoids it', (kind, n) => {
    for (const bettor of ['w', 'b'] as const) {
      expect(run(bettor, HIGH, kind, n, { ply: n, outcome: { kind: 'resign', winner: bettor } })).not.toBe('won');
    }
  });

  it("game_length_under: the bettor's only unilateral lever, quitting, voids it", () => {
    for (const kind of ['resign', 'abandon', 'timeout'] as const) {
      expect(run('w', HIGH, 'game_length_under', 10, { ply: 10, outcome: { kind, winner: 'b' } })).toBe('void');
    }
  });

  it('game_length_over: an opponent who quits early voids it rather than paying it', () => {
    expect(run('w', HIGH, 'game_length_over', 30, { ply: 30, outcome: { kind: 'resign', winner: 'w' } })).toBe('void');
  });

  it('game_length_over: an opponent ending the game early on the board beats it', () => {
    // Fool's mate by the opponent, with the coin on their side.
    const rules = BETS_ONLY;
    let fen = START_FEN;
    let modeState = placeBet({ rules, wallet: { w: 100, b: 100 }, modeState: {}, history: [], fen, turnNumber: 1 }, 'w', { kind: 'game_length_over', stake: 5 }, 'o').modeState;
    const history: TurnResult[] = [];
    let wallet = { w: 95, b: 100 };
    for (const [i, [a, b]] of ([['f2f3', 'a2a3'], ['e7e5', 'a7a6'], ['g2g4', 'a2a3'], ['d8h4', 'a7a6']] as const).entries()) {
      const r = resolveTurn({ gameId: 'g', turnNumber: i + 1, fen, previousFens: [], moveA: m(a), moveB: m(b), rules, wallet, modeState, history }, { forceSlot: 'A' });
      if (!r.ok) throw new Error(r.message);
      history.push(r.result);
      fen = r.result.fenAfter;
      wallet = r.result.walletAfter!;
      modeState = applyModeEffects(modeState, r.result.effects);
    }
    expect((modeState.bets!.w as PropBet[])[0]!.status).toBe('lost');
  });
});

describe('bot bets', () => {
  it('places one or two valid minimum-stake bets on offer', () => {
    for (let seed = 0; seed < 20; seed++) {
      const s: SessionLike = { rules: HIGH, wallet: { w: 100, b: 100 }, modeState: {}, history: [], fen: START_FEN, turnNumber: 1 };
      const picks = botBets(s, 'b', seededRng(seed));
      expect(picks.length).toBeGreaterThanOrEqual(1);
      expect(picks.length).toBeLessThanOrEqual(2);
      let state = s;
      for (const p of picks) {
        expect(p.stake).toBe(BET_RULES.MIN_STAKE);
        expect(validateBet(state, 'b', p)).toBeNull();
        state = { ...state, modeState: placeBet(state, 'b', p, p.kind).modeState };
      }
    }
    const classicBets = botBets({ rules: BETS_ONLY, wallet: { w: 100, b: 100 }, modeState: {}, history: [], fen: START_FEN, turnNumber: 1 }, 'b', seededRng(1));
    for (const p of classicBets) expect(['opp_all_in_bust', 'opp_toss_upset']).not.toContain(p.kind);
  });
});
