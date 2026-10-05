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
} from '@gamble/shared';
import type { GameManager } from '../game/GameManager';

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
function handle<P, T>(schema: Schema<P>, fn: (p: P) => Ack<T>) {
  return (raw: unknown, ack: unknown) => {
    const reply = typeof ack === 'function' ? (ack as (r: Ack<T>) => void) : () => {};
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      reply({ ok: false, error: 'INVALID_PAYLOAD', message: parsed.error.issues[0]?.message ?? 'Invalid payload' });
      return;
    }
    try {
      reply(fn(parsed.data));
    } catch (err) {
      console.error(err);
      reply({ ok: false, error: 'INVALID_PAYLOAD', message: 'Internal error' });
    }
  };
}

export function registerHandlers(io: GameServer, manager: GameManager): void {
  io.on('connection', (socket: GameSocket) => {
    socket.data.seats = new Map();

    const seat = (gameId: string, color: Color) => {
      socket.data.seats.set(gameId, color);
      void socket.join(room(gameId));
    };
    const seatOf = (gameId: string) => socket.data.seats.get(gameId);

    socket.on(
      'create_game',
      handle(createGameSchema, (p) => {
        const res = manager.create(p, socket.id);
        if (res.ok) seat(res.data.gameId, res.data.color);
        return res;
      }),
    );

    socket.on(
      'join_game',
      handle(joinGameSchema, (p) => {
        const res = manager.join(p, socket.id);
        if (res.ok) seat(res.data.gameId, res.data.color);
        return res;
      }),
    );

    socket.on(
      'rejoin_game',
      handle(rejoinGameSchema, (p) => {
        const res = manager.rejoin(p, socket.id);
        if (res.ok) seat(p.gameId, res.data.color);
        return res;
      }),
    );

    socket.on(
      'submit_moves',
      handle(moveSubmissionSchema, (p) => {
        const color = seatOf(p.gameId);
        if (!color) return { ok: false, error: 'UNAUTHORIZED', message: 'You are not seated in this game' };
        return manager.submit(color, p);
      }),
    );

    socket.on(
      'resign',
      handle(gameRefSchema, (p) => {
        const color = seatOf(p.gameId);
        if (!color) return { ok: false, error: 'UNAUTHORIZED', message: 'You are not seated in this game' };
        return manager.resign(p.gameId, color);
      }),
    );

    socket.on(
      'request_state',
      handle(gameRefSchema, (p) => {
        if (!seatOf(p.gameId)) return { ok: false, error: 'UNAUTHORIZED', message: 'You are not seated in this game' };
        return manager.getState(p.gameId);
      }),
    );

    socket.on('disconnect', () => {
      for (const [gameId, color] of socket.data.seats) manager.disconnect(gameId, color, socket.id);
    });
  });
}
