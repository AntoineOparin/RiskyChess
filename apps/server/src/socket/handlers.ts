import type { Server, Socket } from 'socket.io';
import {
  createGameSchema,
  gameRefSchema,
  joinGameSchema,
  moveSubmissionSchema,
  rejoinGameSchema,
  type Ack,
  type ClientToServerEvents,
  type Color,
  type ServerToClientEvents,
} from '@risky-chess/shared';
import type { GameManager } from '../game/GameManager';
import { errorFields, logger } from '../log';

const log = logger('socket');

interface SocketData {
  /** gameId → seat this socket holds. */
  seats: Map<string, Color>;
}

export type GameServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

export const room = (gameId: string) => `game:${gameId}`;

/** Structural slice of a zod schema, so this package needn't depend on zod directly. */
interface Schema<P> {
  safeParse(raw: unknown): { success: true; data: P } | { success: false; error: { issues: { message: string }[] } };
}

/** Validates the payload and guarantees the ack is called exactly once, even on throw. */
function handle<P, T>(socket: GameSocket, event: string, schema: Schema<P>, fn: (p: P) => Ack<T>) {
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
      log.error('handler threw', { event, socket: socket.id, seats: Object.fromEntries(socket.data.seats ?? []), payload: parsed.data, ...errorFields(err) });
      reply({ ok: false, error: 'INTERNAL', message: 'Internal error' });
    }
  };
}

export function registerHandlers(io: GameServer, manager: GameManager): void {
  io.on('connection', (socket: GameSocket) => {
    socket.data.seats = new Map();
    log.debug('connected', { socket: socket.id });

    const seat = (gameId: string, color: Color) => {
      socket.data.seats.set(gameId, color);
      void socket.join(room(gameId));
    };
    const seatOf = (gameId: string) => socket.data.seats.get(gameId);
    const unseated = <T>(): Ack<T> => ({ ok: false, error: 'UNAUTHORIZED', message: 'You are not seated in this game' });

    socket.on(
      'create_game',
      handle(socket, 'create_game', createGameSchema, (p) => {
        const res = manager.create(p, socket.id);
        if (res.ok) seat(res.data.gameId, res.data.color);
        return res;
      }),
    );

    socket.on(
      'join_game',
      handle(socket, 'join_game', joinGameSchema, (p) => {
        const res = manager.join(p, socket.id);
        if (res.ok) seat(res.data.gameId, res.data.color);
        return res;
      }),
    );

    socket.on(
      'rejoin_game',
      handle(socket, 'rejoin_game', rejoinGameSchema, (p) => {
        const res = manager.rejoin(p, socket.id);
        if (res.ok) seat(p.gameId, res.data.color);
        return res;
      }),
    );

    socket.on(
      'submit_moves',
      handle(socket, 'submit_moves', moveSubmissionSchema, (p) => {
        const color = seatOf(p.gameId);
        return color ? manager.submit(color, p) : unseated();
      }),
    );

    socket.on(
      'resign',
      handle(socket, 'resign', gameRefSchema, (p) => {
        const color = seatOf(p.gameId);
        return color ? manager.resign(p.gameId, color) : unseated();
      }),
    );

    socket.on(
      'request_state',
      handle(socket, 'request_state', gameRefSchema, (p) => (seatOf(p.gameId) ? manager.getState(p.gameId) : unseated())),
    );

    socket.on('disconnect', (reason) => {
      log.debug('disconnected', { socket: socket.id, reason, seats: Object.fromEntries(socket.data.seats) });
      for (const [gameId, color] of socket.data.seats) manager.disconnect(gameId, color, socket.id);
    });
  });
}
