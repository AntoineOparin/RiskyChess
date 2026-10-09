import type { Server, Socket } from 'socket.io';
import {
  createGameSchema,
  gameRefSchema,
  joinGameSchema,
  moveSubmissionSchema,
  placeBetSchema,
  rejoinGameSchema,
  type Ack,
  type ClientToServerEvents,
  type Color,
  type ServerToClientEvents,
  type User,
} from '@risky-chess/shared';
import type { Caller, GameManager } from '../game/GameManager';
import { errorFields, logger } from '../log';
import type { Services } from '../platform';

const log = logger('socket');

interface SocketData {
  /** The account behind this connection, resolved from the handshake token. */
  user: User;
  /** gameId → seat this socket holds. */
  seats: Map<string, Color>;
}

export type GameServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
export type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

export const room = (gameId: string) => `game:${gameId}`;
/** A seat's private channel: redacted views and bet acks go only here. */
export const seatRoom = (gameId: string, color: Color) => `game:${gameId}:${color}`;
/** An account's private channel, across every socket it has open. */
export const userRoom = (userId: string) => `user:${userId}`;
export const LOBBY_ROOM = 'lobby';

/** Structural slice of a zod schema, so this package needn't depend on zod directly. */
export interface Schema<P> {
  safeParse(raw: unknown): { success: true; data: P } | { success: false; error: { issues: { message: string }[] } };
}

/** Validates the payload and guarantees the ack is called exactly once, even on throw. */
export function handle<P, T>(socket: GameSocket, event: string, schema: Schema<P>, fn: (p: P) => Ack<T>) {
  return (raw: unknown, ack: unknown) => {
    const reply = typeof ack === 'function' ? (ack as (r: Ack<T>) => void) : () => {};
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]?.message ?? 'Invalid payload';
      log.warn('invalid payload', { event, socket: socket.id, issue, payload: raw });
      reply({ ok: false, error: 'INVALID_PAYLOAD', message: issue });
      return;
    }
    try {
      const res = fn(parsed.data);
      if (!res.ok) log.debug('rejected', { event, socket: socket.id, error: res.error, message: res.message });
      reply(res);
    } catch (err) {
      log.error('handler threw', { event, socket: socket.id, userId: socket.data.user?.id, payload: parsed.data, ...errorFields(err) });
      reply({ ok: false, error: 'INTERNAL', message: 'Internal error' });
    }
  };
}

/** The caller a manager method expects, from a socket. */
export const callerOf = (socket: GameSocket): Caller => ({ userId: socket.data.user.id, username: socket.data.user.username, connId: socket.id });

/** Extra handlers other services register on each connection (lobby, sportsbook, originals). */
export type Feature = (socket: GameSocket, ctx: { manager: GameManager; services: Services; seatOf: (gameId: string) => Color | undefined }) => void;

export function registerHandlers(io: GameServer, manager: GameManager, services: Services, features: Feature[] = []): void {
  // Every socket belongs to an account: the handshake carries the bearer token.
  io.use((socket, next) => {
    const raw = (socket.handshake.auth as { token?: unknown }).token;
    const user = services.auth.authenticate(typeof raw === 'string' ? raw : undefined);
    if (!user) return next(new Error('AUTH_REQUIRED'));
    socket.data.user = user;
    next();
  });

  io.on('connection', (socket: GameSocket) => {
    socket.data.seats = new Map();
    void socket.join(userRoom(socket.data.user.id));
    log.debug('connected', { socket: socket.id, userId: socket.data.user.id });

    const seat = (gameId: string, color: Color) => {
      socket.data.seats.set(gameId, color);
      void socket.join([room(gameId), seatRoom(gameId, color)]);
    };
    /** The seat this socket holds, or the one its account holds if it never (re)joined on this socket. */
    const seatOf = (gameId: string): Color | undefined => {
      const held = socket.data.seats.get(gameId);
      if (held) return held;
      const color = manager.authenticate(gameId, socket.data.user.id);
      if (color) seat(gameId, color);
      return color ?? undefined;
    };

    socket.on(
      'create_game',
      handle(socket, 'create_game', createGameSchema, (p) => {
        const res = manager.create(p, callerOf(socket));
        if (res.ok) seat(res.data.gameId, res.data.color);
        return res;
      }),
    );

    socket.on(
      'join_game',
      handle(socket, 'join_game', joinGameSchema, (p) => {
        const res = manager.join(p, callerOf(socket));
        if (res.ok) seat(res.data.gameId, res.data.color);
        return res;
      }),
    );

    socket.on(
      'rejoin_game',
      handle(socket, 'rejoin_game', rejoinGameSchema, (p) => {
        const res = manager.rejoin({ gameId: p.gameId }, callerOf(socket));
        if (res.ok) seat(p.gameId, res.data.color);
        return res;
      }),
    );

    socket.on(
      'cancel_table',
      handle(socket, 'cancel_table', gameRefSchema, (p) => manager.cancel(p, callerOf(socket))),
    );

    socket.on(
      'submit_moves',
      handle(socket, 'submit_moves', moveSubmissionSchema, (p) => {
        const color = seatOf(p.gameId);
        if (!color) return { ok: false, error: 'UNAUTHORIZED', message: 'You are not seated in this game' };
        return manager.submit(color, p);
      }),
    );

    socket.on(
      'resign',
      handle(socket, 'resign', gameRefSchema, (p) => {
        const color = seatOf(p.gameId);
        if (!color) return { ok: false, error: 'UNAUTHORIZED', message: 'You are not seated in this game' };
        return manager.resign(p.gameId, color);
      }),
    );

    socket.on(
      'request_state',
      handle(socket, 'request_state', gameRefSchema, (p) => {
        // Spectators get the sealed view; only seated accounts see their own bets.
        const color = seatOf(p.gameId) ?? null;
        if (!color && !socket.rooms.has(room(p.gameId))) return { ok: false, error: 'UNAUTHORIZED', message: 'You are not in this game' };
        return manager.getState(p.gameId, color);
      }),
    );

    socket.on(
      'place_bet',
      handle(socket, 'place_bet', placeBetSchema, (p) => {
        const color = seatOf(p.gameId);
        if (!color) return { ok: false, error: 'UNAUTHORIZED', message: 'You are not seated in this game' };
        return manager.placeBet(color, p);
      }),
    );

    for (const feature of features) feature(socket, { manager, services, seatOf });

    socket.on('disconnect', (reason) => {
      log.debug('disconnected', { socket: socket.id, reason, seats: Object.fromEntries(socket.data.seats) });
      for (const [gameId, color] of socket.data.seats) manager.disconnect(gameId, color, socket.id);
    });
  });
}
