import {
  applyEffects,
  applyModeEffects,
  botBets,
  placeBet as placeBetIn,
  validateBet,
  gameOverEffects,
  mathRng,
  pickBotSubmission,
  resolveTurn,
  sideToMove,
  startingWallet,
  type ResolveDeps,
  type Rng,
  type Tosser,
} from '@risky-chess/engine';
import {
  BOT_THINK_MS,
  CLASSIC_RULES,
  hasMode,
  DISCONNECT_GRACE_MS,
  GAME_TTL_MS,
  START_FEN,
  TURN_TIMEOUT_MS,
  type Ack,
  type Color,
  type CreateGamePayload,
  type ErrorCode,
  type GameOutcome,
  type GameSession,
  type JoinGamePayload,
  type MoveSubmission,
  type PlaceBetPayload,
  type PlayerSlot,
  type PropBet,
  type RejoinGamePayload,
  type SeatGrant,
  type ServerToClientEvents,
} from '@risky-chess/shared';
import { cryptoRng, hmacRngFor, newClientSeed, newGameCode, newId, newServerSeed, newToken } from '../crypto/coin';
import type { GameRecord, GameStore } from './GameStore';
import { viewFor } from './redact';
import { errorFields, logger } from '../log';

const log = logger('game');
import { Timers } from './timers';

/** Broadcasts an event to everyone in a game's room. */
export type Emit = <E extends keyof ServerToClientEvents>(
  gameId: string,
  event: E,
  ...args: Parameters<ServerToClientEvents[E]>
) => void;

/** Sends an event to one seat's private channel. */
export type EmitTo = <E extends keyof ServerToClientEvents>(
  gameId: string,
  color: Color,
  event: E,
  ...args: Parameters<ServerToClientEvents[E]>
) => void;

export interface GameManagerOptions {
  graceMs: number;
  turnTimeoutMs: number | null;
  botThinkMs: { min: number; max: number };
  /**
   * Test seam: draw toss rolls from this rng instead of the committed HMAC
   * roll. Unset in production, where every toss is commit-reveal.
   */
  tossRng?: Rng;
  /** Legacy test seam: decides the slot directly, bypassing the roll. */
  tosser?: Tosser;
  /** Drives bot move variety and seat assignment; never tosses. */
  rng: Rng;
  ttlMs: number;
}

const BOT_PLAYER_ID = 'bot';
const other = (c: Color): Color => (c === 'w' ? 'b' : 'w');
const ok = <T>(data: T): Ack<T> => ({ ok: true, data });
const fail = <T>(error: ErrorCode, message: string): Ack<T> => ({ ok: false, error, message });
const snapshot = (s: GameSession): GameSession => structuredClone(s);

/**
 * Owns every game state transition. Transport-agnostic: the socket layer
 * authenticates callers and passes in their seat color.
 */
export class GameManager {
  private readonly timers = new Timers();
  private readonly opts: GameManagerOptions;

  private readonly emitTo: EmitTo;

  constructor(
    private readonly store: GameStore,
    private readonly emit: Emit,
    opts: Partial<GameManagerOptions> = {},
    /** Per-seat channel. Without one, seat events fall back to the room (tests only). */
    emitTo?: EmitTo,
  ) {
    this.emitTo = emitTo ?? ((gameId, _color, event, ...args) => this.emit(gameId, event, ...args));
    this.opts = {
      graceMs: DISCONNECT_GRACE_MS,
      turnTimeoutMs: TURN_TIMEOUT_MS,
      botThinkMs: BOT_THINK_MS,
      rng: cryptoRng,
      ttlMs: GAME_TTL_MS,
      ...opts,
    };
  }

  // ---------- lobby ----------

  create(p: CreateGamePayload, connId: string): Ack<SeatGrant> {
    const now = Date.now();
    let id = newGameCode();
    while (this.store.get(id)) id = newGameCode();

    const color: Color = p.color === 'w' || p.color === 'b' ? p.color : this.opts.rng.int(2) === 0 ? 'w' : 'b';
    const human: PlayerSlot = { playerId: newId(), displayName: p.displayName, isBot: false, connected: true };
    const players: GameSession['players'] = { w: null, b: null };
    players[color] = human;
    if (p.mode === 'bot') {
      players[other(color)] = { playerId: BOT_PLAYER_ID, displayName: 'RiskyBot', isBot: true, connected: true };
    }

    const rules = p.rules ?? CLASSIC_RULES;
    const wallet = startingWallet(rules);
    const session: GameSession = {
      id,
      mode: p.mode,
      rules,
      ...(wallet ? { wallet } : {}),
      modeState: {},
      status: p.mode === 'bot' ? 'awaiting_submission' : 'waiting_for_opponent',
      players,
      startFen: START_FEN,
      fen: START_FEN,
      turn: 'w',
      turnNumber: 1,
      history: [],
      createdAt: now,
      updatedAt: now,
    };
    const token = newToken();
    const record: GameRecord = {
      session,
      tokens: { [color]: token },
      connections: { [color]: connId },
      graceDeadlines: {},
      submissions: new Map(),
      turnSeeds: new Map(),
      betAcks: new Map(),
    };
    this.store.set(record);
    // The bot places its sealed bets before the game starts, so both views open with them.
    if (p.mode === 'bot' && hasMode(rules, 'side_bets')) this.placeBotBets(record, other(color));

    if (p.mode === 'bot') {
      // Defer so the caller can join the room and receive the ack before events flow.
      queueMicrotask(() => {
        this.announceStart(record);
        this.beginTurn(record);
      });
    }
    log.info('created', { gameId: id, mode: p.mode, color, rules: rules.modes, wallet: session.wallet });
    return ok({ gameId: id, playerId: human.playerId, playerToken: token, color });
  }

  join(p: JoinGamePayload, connId: string): Ack<SeatGrant> {
    const record = this.store.get(p.gameId.toUpperCase());
    if (!record) return fail('GAME_NOT_FOUND', 'No game with that code');
    const s = record.session;
    if (s.status === 'finished') return fail('GAME_OVER', 'Game has ended');
    if (s.mode !== 'pvp' || s.status !== 'waiting_for_opponent') return fail('GAME_FULL', 'Game is full');

    const color: Color = s.players.w ? 'b' : 'w';
    const slot: PlayerSlot = { playerId: newId(), displayName: p.displayName, isBot: false, connected: true };
    const token = newToken();
    s.players[color] = slot;
    record.tokens[color] = token;
    record.connections[color] = connId;
    s.status = 'awaiting_submission';
    s.updatedAt = Date.now();

    // The creator may have dropped while waiting; their seat clock starts now.
    const creator = s.players[other(color)];
    if (creator && !creator.connected) this.startGrace(record, other(color));

    queueMicrotask(() => {
      this.announceStart(record);
      this.beginTurn(record);
    });
    log.info('joined', { gameId: s.id, color, rules: s.rules.modes });
    return ok({ gameId: s.id, playerId: slot.playerId, playerToken: token, color });
  }

  /** Resolves a token to its seat color, or null. */
  authenticate(gameId: string, token: string): Color | null {
    const record = this.store.get(gameId);
    if (!record) return null;
    if (record.tokens.w === token) return 'w';
    if (record.tokens.b === token) return 'b';
    return null;
  }

  rejoin(p: RejoinGamePayload, connId: string): Ack<{ session: GameSession; color: Color }> {
    const record = this.store.get(p.gameId);
    if (!record) return fail('GAME_NOT_FOUND', 'No game with that code');
    const color = this.authenticate(p.gameId, p.playerToken);
    if (!color) return fail('UNAUTHORIZED', 'Invalid player token');

    const s = record.session;
    const slot = s.players[color]!;
    const wasDisconnected = !slot.connected;
    record.connections[color] = connId;
    slot.connected = true;
    delete slot.disconnectedAt;
    delete record.graceDeadlines[color];
    this.timers.clear(`${s.id}:grace:${color}`);

    if (s.status === 'paused_disconnect' && s.turn === color) {
      s.status = 'awaiting_submission';
      delete s.graceEndsAt;
      this.startTurnClock(record);
    }
    s.updatedAt = Date.now();
    log.info('rejoined', { gameId: s.id, color, wasDisconnected, status: s.status, turnNumber: s.turnNumber });
    if (wasDisconnected && s.status !== 'finished') this.emit(s.id, 'opponent_reconnected', { gameId: s.id, color });
    return ok({ session: viewFor(s, color), color });
  }

  /** The full session, or one seat's redacted view of it when `color` is given. */
  getState(gameId: string, color?: Color): Ack<{ session: GameSession }> {
    const record = this.store.get(gameId);
    if (!record) return fail('GAME_NOT_FOUND', 'No game with that code');
    return ok({ session: color ? viewFor(record.session, color) : snapshot(record.session) });
  }

  // ---------- turns ----------

  submit(color: Color, sub: MoveSubmission): Ack<{ accepted: true }> {
    const record = this.store.get(sub.gameId);
    if (!record) return fail('GAME_NOT_FOUND', 'No game with that code');
    const cached = record.submissions.get(sub.clientSubmissionId);
    if (cached) return cached;

    const s = record.session;
    if (s.status === 'finished') return fail('GAME_OVER', 'Game has ended');
    if (s.status !== 'awaiting_submission') return fail('GAME_NOT_ACTIVE', `Game is ${s.status}`);
    if (s.turn !== color) return fail('NOT_YOUR_TURN', 'It is not your turn');
    if (sub.turnNumber !== s.turnNumber) return fail('STALE_TURN', `Expected turn ${s.turnNumber}`);

    // Critical section: synchronous from here to the end, so no other submission can interleave.
    const resolved = resolveTurn(
      {
        gameId: s.id,
        turnNumber: s.turnNumber,
        fen: s.fen,
        previousFens: s.history.map((h) => h.fenBefore),
        moveA: sub.moveA,
        moveB: sub.moveB,
        rules: s.rules,
        ...(s.wallet ? { wallet: s.wallet } : {}),
        modeState: s.modeState,
        ...(sub.extras ? { extras: sub.extras } : {}),
        history: s.history,
      },
      this.tossDeps(record, sub),
    );
    if (!resolved.ok) {
      log.info('submission rejected', {
        gameId: s.id,
        color,
        turnNumber: s.turnNumber,
        error: resolved.error,
        message: resolved.message,
        fen: s.fen,
        moveA: sub.moveA,
        moveB: sub.moveB,
        extras: sub.extras ? { ...sub.extras, clientSeed: sub.extras.clientSeed ? '…' : undefined } : undefined,
        wallet: s.wallet,
      });
      return fail(resolved.error, resolved.message);
    }

    const { result } = resolved;
    log.debug('turn resolved', {
      gameId: s.id,
      turnNumber: result.turnNumber,
      mover: result.mover,
      pair: [result.moveA.lan, result.moveB?.lan ?? null],
      executed: result.executed.lan,
      odds: result.odds.A,
      // The seed is revealed in this very result, so its commitment and the roll are safe to log.
      roll: result.coin?.roll,
      method: result.coin?.method,
      effects: result.effects.map((e) => e.kind + ('reason' in e ? `:${e.reason}` : '')),
      walletAfter: result.walletAfter,
      outcome: result.outcome,
    });
    // Revealed in the result now; the secret has no further use.
    record.turnSeeds.delete(s.turnNumber);
    delete s.pendingCommitment;
    this.timers.clear(`${s.id}:turn`);
    delete s.turnDeadline;
    s.history.push(result);
    s.fen = result.fenAfter;
    if (result.walletAfter) s.wallet = result.walletAfter;
    s.modeState = applyModeEffects(s.modeState, result.effects);
    // Derived, never flipped: an All-In bonus ply leaves the same seat to move.
    s.turn = sideToMove(result.fenAfter);
    s.turnNumber += 1;
    s.updatedAt = result.resolvedAt;

    const ack = ok({ accepted: true as const });
    record.submissions.set(sub.clientSubmissionId, ack);

    this.emit(s.id, 'turn_resolved', structuredClone(result));
    if (result.outcome) this.finish(record, result.outcome, true);
    else this.beginTurn(record);
    return ack;
  }

  /**
   * Places a sealed side bet: synchronous (no interleaving with a turn),
   * idempotent per clientBetId. The bettor gets bet_placed on their own
   * channel; both seats get a state_sync of their own (redacted) view.
   */
  placeBet(color: Color, p: PlaceBetPayload): Ack<{ bet: PropBet }> {
    const record = this.store.get(p.gameId);
    if (!record) return fail('GAME_NOT_FOUND', 'No game with that code');
    const key = `${color}:${p.clientBetId}`;
    const cached = record.betAcks.get(key);
    if (cached) return cached;
    const s = record.session;
    if (s.status === 'waiting_for_opponent') return fail('GAME_NOT_ACTIVE', 'The game has not started');
    const req = { kind: p.kind, stake: p.stake, ...(p.params ? { params: p.params } : {}) };
    const bad = validateBet(s, color, req, s.status === 'finished');
    if (bad) {
      log.info('bet rejected', { gameId: s.id, color, ...req, turnNumber: s.turnNumber, error: bad.error, message: bad.message, wallet: s.wallet });
      return fail(bad.error, bad.message);
    }

    const placed = placeBetIn(s, color, req, newId());
    s.modeState = placed.modeState;
    if (s.wallet) s.wallet = applyEffects(s.wallet, placed.effects);
    s.updatedAt = Date.now();
    const ack = ok({ bet: structuredClone(placed.bet) });
    record.betAcks.set(key, ack);
    log.info('bet placed', { gameId: s.id, color, kind: placed.bet.kind, stake: placed.bet.stake, payoutX100: placed.bet.payoutX100, turnNumber: s.turnNumber });

    this.emitTo(s.id, color, 'bet_placed', { gameId: s.id, bet: structuredClone(placed.bet) });
    for (const c of ['w', 'b'] as const) {
      if (s.players[c] && !s.players[c]!.isBot) this.emitTo(s.id, c, 'state_sync', viewFor(s, c));
    }
    return ack;
  }

  resign(gameId: string, color: Color): Ack<Record<string, never>> {
    const record = this.store.get(gameId);
    if (!record) return fail('GAME_NOT_FOUND', 'No game with that code');
    if (record.session.status === 'finished') return fail('GAME_OVER', 'Game has ended');
    this.finish(record, { kind: 'resign', winner: other(color) });
    return ok({});
  }

  // ---------- connections ----------

  /** Called when a socket bound to a seat drops. Ignored if the seat has since rebound. */
  disconnect(gameId: string, color: Color, connId: string): void {
    const record = this.store.get(gameId);
    if (!record || record.connections[color] !== connId) return;
    const s = record.session;
    const slot = s.players[color];
    if (!slot) return;

    delete record.connections[color];
    slot.connected = false;
    slot.disconnectedAt = Date.now();
    s.updatedAt = slot.disconnectedAt;
    if (s.status === 'finished' || s.status === 'waiting_for_opponent') return;

    if (s.mode === 'pvp') this.startGrace(record, color);
    if (s.turn === color) this.pause(record);
  }

  /** Drops stale games. Call periodically. */
  sweep(now = Date.now()): void {
    for (const { session: s } of [...this.store.values()]) {
      if (now - s.updatedAt > this.opts.ttlMs) {
        this.timers.clearPrefix(`${s.id}:`);
        this.store.delete(s.id);
      }
    }
  }

  dispose(): void {
    this.timers.clearAll();
  }

  // ---------- internals ----------

  /** The coin for this turn: the committed HMAC roll, unless a test seam replaces it. */
  private tossDeps(record: GameRecord, sub: MoveSubmission): ResolveDeps {
    if (this.opts.tosser) return { tosser: this.opts.tosser };
    if (this.opts.tossRng) return { rng: this.opts.tossRng, method: 'crypto.randomInt' };
    const s = record.session;
    const serverSeed = record.turnSeeds.get(s.turnNumber);
    if (!serverSeed || !s.pendingCommitment) throw new Error(`No committed seed for ${s.id} turn ${s.turnNumber}`);
    const clientSeed = sub.extras?.clientSeed ?? newClientSeed();
    return {
      rng: hmacRngFor(serverSeed, s.id, s.turnNumber, clientSeed),
      method: 'hmac-commit-reveal',
      proof: { commitment: s.pendingCommitment, serverSeed, clientSeed },
    };
  }

  private placeBotBets(record: GameRecord, color: Color): void {
    for (const req of botBets(record.session, color, this.opts.rng)) {
      if (validateBet(record.session, color, req)) continue;
      const placed = placeBetIn(record.session, color, req, newId());
      record.session.modeState = placed.modeState;
      if (record.session.wallet) record.session.wallet = applyEffects(record.session.wallet, placed.effects);
      log.debug('bot bet placed', { gameId: record.session.id, color, kind: req.kind, stake: req.stake });
    }
  }

  /** Commits this turn's seed before anyone can submit: its hash goes out with turn_started. */
  private commitSeed(record: GameRecord): void {
    const s = record.session;
    if (this.opts.tosser || this.opts.tossRng) return;
    const { seed, commitment } = newServerSeed();
    record.turnSeeds.clear();
    record.turnSeeds.set(s.turnNumber, seed);
    s.pendingCommitment = commitment;
  }

  /** game_started goes to each human seat separately, as that seat's view. */
  private announceStart(record: GameRecord): void {
    const s = record.session;
    for (const c of ['w', 'b'] as const) {
      if (s.players[c] && !s.players[c]!.isBot) this.emitTo(s.id, c, 'game_started', viewFor(s, c));
    }
  }

  private beginTurn(record: GameRecord): void {
    const s = record.session;
    if (s.status === 'finished') return;
    this.commitSeed(record);
    const mover = s.players[s.turn];
    if (mover && !mover.connected) {
      this.pause(record);
    } else {
      s.status = 'awaiting_submission';
      this.startTurnClock(record);
    }
    this.emit(s.id, 'turn_started', {
      gameId: s.id,
      turnNumber: s.turnNumber,
      turn: s.turn,
      status: s.status,
      ...(s.turnDeadline ? { deadline: s.turnDeadline } : {}),
      ...(s.graceEndsAt ? { graceEndsAt: s.graceEndsAt } : {}),
      ...(s.pendingCommitment ? { commitment: s.pendingCommitment } : {}),
    });
    if (mover?.isBot) this.scheduleBot(record);
  }

  private pause(record: GameRecord): void {
    const s = record.session;
    s.status = 'paused_disconnect';
    const deadline = record.graceDeadlines[s.turn];
    if (deadline) s.graceEndsAt = deadline;
    this.timers.clear(`${s.id}:turn`);
    delete s.turnDeadline;
  }

  private startGrace(record: GameRecord, color: Color): void {
    const s = record.session;
    const graceEndsAt = Date.now() + this.opts.graceMs;
    record.graceDeadlines[color] = graceEndsAt;
    log.info('player disconnected; grace started', { gameId: s.id, color, graceEndsAt });
    this.timers.set(`${s.id}:grace:${color}`, this.opts.graceMs, () => this.expireGrace(s.id, color));
    this.emit(s.id, 'opponent_disconnected', { gameId: s.id, color, graceEndsAt });
  }

  private expireGrace(gameId: string, color: Color): void {
    const record = this.store.get(gameId);
    if (!record) return;
    const s = record.session;
    if (s.status === 'finished' || s.players[color]?.connected) return;
    // If both players are gone, the one who owes a move forfeits.
    const bothGone = !s.players[other(color)]?.connected;
    const loser = bothGone ? s.turn : color;
    this.finish(record, { kind: 'abandon', winner: other(loser) });
  }

  private startTurnClock(record: GameRecord): void {
    const { turnTimeoutMs } = this.opts;
    const s = record.session;
    if (turnTimeoutMs === null || s.players[s.turn]?.isBot) return;
    s.turnDeadline = Date.now() + turnTimeoutMs;
    const { turnNumber, turn } = s;
    this.timers.set(`${s.id}:turn`, turnTimeoutMs, () => {
      if (s.status === 'awaiting_submission' && s.turnNumber === turnNumber) {
        this.finish(record, { kind: 'timeout', winner: other(turn) });
      }
    });
  }

  private scheduleBot(record: GameRecord): void {
    const s = record.session;
    const { min, max } = this.opts.botThinkMs;
    const delay = min + mathRng.int(Math.max(1, max - min + 1));
    const { turnNumber, turn } = s;
    this.timers.set(`${s.id}:bot`, delay, () => {
      if (s.status !== 'awaiting_submission' || s.turnNumber !== turnNumber) return;
      // A bot that can't move would stall the game forever: never let that pass silently.
      try {
        const pick = pickBotSubmission(s.fen, s, this.opts.rng, 'greedy');
        const res = this.submit(turn, { gameId: s.id, turnNumber, clientSubmissionId: newId(), ...pick });
        if (!res.ok) log.error('bot submission rejected', { gameId: s.id, turnNumber, fen: s.fen, pick, error: res.error, message: res.message, rules: s.rules.modes, wallet: s.wallet });
      } catch (e) {
        log.error('bot turn threw', { gameId: s.id, turnNumber, fen: s.fen, rules: s.rules.modes, ...errorFields(e) });
      }
    });
  }

  /** `onBoard`: the last turn ended the game and already settled everything in its effects. */
  private finish(record: GameRecord, outcome: GameOutcome, onBoard = false): void {
    const s = record.session;
    const effects = onBoard ? [] : gameOverEffects(s, outcome);
    log.info('game over', { gameId: s.id, outcome, plies: s.history.length, settled: effects.filter((e) => e.kind === 'bet_settled').length, rules: s.rules.modes });
    if (effects.length) {
      if (s.wallet) s.wallet = applyEffects(s.wallet, effects);
      s.modeState = applyModeEffects(s.modeState, effects);
    }
    s.status = 'finished';
    s.outcome = outcome;
    record.turnSeeds.clear();
    delete s.pendingCommitment;
    delete s.graceEndsAt;
    delete s.turnDeadline;
    s.updatedAt = Date.now();
    this.timers.clearPrefix(`${s.id}:`);
    this.emit(s.id, 'game_over', {
      gameId: s.id,
      outcome,
      finalFen: s.fen,
      ...(effects.length ? { effects } : {}),
      ...(s.wallet ? { walletAfter: s.wallet } : {}),
    });
    // Every bet is unsealed once the game is over.
    if (hasMode(s.rules, 'side_bets')) {
      const bets: Partial<Record<Color, PropBet[]>> = {};
      for (const c of ['w', 'b'] as const) {
        const b = s.modeState.bets?.[c];
        if (Array.isArray(b)) bets[c] = structuredClone(b);
      }
      this.emit(s.id, 'bets_revealed', { gameId: s.id, bets });
    }
  }
}
