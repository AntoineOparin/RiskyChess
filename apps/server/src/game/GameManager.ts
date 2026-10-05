import { mathRng, pickBotPair, resolveTurn, type Rng, type Tosser } from '@gamble/engine';
import {
  BOT_THINK_MS,
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
  type PlayerSlot,
  type RejoinGamePayload,
  type SeatGrant,
  type ServerToClientEvents,
} from '@gamble/shared';
import { cryptoRng, cryptoTosser, newGameCode, newId, newToken } from '../crypto/coin';
import type { GameRecord, GameStore } from './GameStore';
import { Timers } from './timers';

/** Broadcasts an event to everyone in a game's room. */
export type Emit = <E extends keyof ServerToClientEvents>(
  gameId: string,
  event: E,
  ...args: Parameters<ServerToClientEvents[E]>
) => void;

export interface GameManagerOptions {
  graceMs: number;
  turnTimeoutMs: number | null;
  botThinkMs: { min: number; max: number };
  tosser: Tosser;
  /** Drives bot move variety and seat assignment; tosses always use `tosser`. */
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

  constructor(
    private readonly store: GameStore,
    private readonly emit: Emit,
    opts: Partial<GameManagerOptions> = {},
  ) {
    this.opts = {
      graceMs: DISCONNECT_GRACE_MS,
      turnTimeoutMs: TURN_TIMEOUT_MS,
      botThinkMs: BOT_THINK_MS,
      tosser: cryptoTosser,
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
      players[other(color)] = { playerId: BOT_PLAYER_ID, displayName: 'GambleBot', isBot: true, connected: true };
    }

    const session: GameSession = {
      id,
      mode: p.mode,
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
    };
    this.store.set(record);

    if (p.mode === 'bot') {
      // Defer so the caller can join the room and receive the ack before events flow.
      queueMicrotask(() => {
        this.emit(id, 'game_started', snapshot(session));
        this.beginTurn(record);
      });
    }
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
      this.emit(s.id, 'game_started', snapshot(s));
      this.beginTurn(record);
    });
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
    if (wasDisconnected && s.status !== 'finished') this.emit(s.id, 'opponent_reconnected', { gameId: s.id, color });
    return ok({ session: snapshot(s), color });
  }

  getState(gameId: string): Ack<{ session: GameSession }> {
    const record = this.store.get(gameId);
    return record ? ok({ session: snapshot(record.session) }) : fail('GAME_NOT_FOUND', 'No game with that code');
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
      },
      this.opts.tosser,
    );
    if (!resolved.ok) return fail(resolved.error, resolved.message);

    const { result } = resolved;
    this.timers.clear(`${s.id}:turn`);
    delete s.turnDeadline;
    s.history.push(result);
    s.fen = result.fenAfter;
    s.turn = other(color);
    s.turnNumber += 1;
    s.updatedAt = result.resolvedAt;

    const ack = ok({ accepted: true as const });
    record.submissions.set(sub.clientSubmissionId, ack);

    this.emit(s.id, 'turn_resolved', structuredClone(result));
    if (result.outcome) this.finish(record, result.outcome);
    else this.beginTurn(record);
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

  private beginTurn(record: GameRecord): void {
    const s = record.session;
    if (s.status === 'finished') return;
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
      const pair = pickBotPair(s.fen, this.opts.rng, 'greedy');
      this.submit(turn, { gameId: s.id, turnNumber, clientSubmissionId: newId(), ...pair });
    });
  }

  private finish(record: GameRecord, outcome: GameOutcome): void {
    const s = record.session;
    s.status = 'finished';
    s.outcome = outcome;
    delete s.graceEndsAt;
    delete s.turnDeadline;
    s.updatedAt = Date.now();
    this.timers.clearPrefix(`${s.id}:`);
    this.emit(s.id, 'game_over', { gameId: s.id, outcome, finalFen: s.fen });
  }
}
