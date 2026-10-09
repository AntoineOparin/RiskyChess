import { emptySchema, gameRefSchema } from '@risky-chess/shared';
import { isLive, type Lobby } from '../../lobby/Lobby';
import { viewFor } from '../../game/redact';
import { handle, LOBBY_ROOM, room, type Feature } from '../handlers';

/** Lobby room membership and read-only seats in public games. */
export const lobbyFeature =
  (lobby: Lobby): Feature =>
  (socket, { manager, services, seatOf }) => {
    socket.on(
      'join_lobby',
      handle(socket, 'join_lobby', emptySchema, () => {
        void socket.join(LOBBY_ROOM);
        return { ok: true, data: lobby.snapshot() };
      }),
    );

    socket.on(
      'leave_lobby',
      handle(socket, 'leave_lobby', emptySchema, () => {
        void socket.leave(LOBBY_ROOM);
        return { ok: true, data: {} };
      }),
    );

    socket.on(
      'watch_game',
      handle(socket, 'watch_game', gameRefSchema, (p) => {
        const record = manager.record(p.gameId);
        if (!record) return { ok: false, error: 'GAME_NOT_FOUND', message: 'No game with that code' };
        const seat = seatOf(p.gameId) ?? null;
        if (!seat && record.session.visibility !== 'public') return { ok: false, error: 'UNAUTHORIZED', message: 'That table is private' };
        void socket.join(room(p.gameId));
        return {
          ok: true,
          data: {
            session: viewFor(record.session, seat),
            line: isLive(record) ? lobby.market(record)?.line ?? null : null,
            myBets: services.bets.matchBetsOf(socket.data.user.id, { gameId: p.gameId }),
          },
        };
      }),
    );

    socket.on(
      'leave_game',
      handle(socket, 'leave_game', gameRefSchema, (p) => {
        // A seated player stays in the room: their seat events still need to reach them.
        if (!socket.data.seats.has(p.gameId)) void socket.leave(room(p.gameId));
        return { ok: true, data: {} };
      }),
    );
  };
