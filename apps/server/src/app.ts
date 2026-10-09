import { createServer, type Server as HttpServer } from 'node:http';
import cors from 'cors';
import express from 'express';
import { Server } from 'socket.io';
import type { Db } from './db/db';
import { GameManager, type GameManagerOptions } from './game/GameManager';
import { InMemoryGameStore } from './game/GameStore';
import { routes } from './http/routes';
import { createServices, type Services } from './platform';
import { Lobby } from './lobby/Lobby';
import { registerHandlers, LOBBY_ROOM, room, seatRoom, userRoom, type Feature, type GameServer } from './socket/handlers';
import { lobbyFeature } from './socket/features/lobby';
import { sportsbookFeature } from './socket/features/sportsbook';
import { Sportsbook } from './sportsbook/Sportsbook';

export interface App {
  http: HttpServer;
  io: GameServer;
  manager: GameManager;
  services: Services;
  lobby: Lobby;
  sportsbook: Sportsbook;
  close(): Promise<void>;
}

export interface AppOptions extends Partial<GameManagerOptions> {
  /** The platform database; tests leave it out for a fresh in-memory one. */
  db?: Db;
}

export function createApp(opts: AppOptions = {}): App {
  const { db, ...managerOpts } = opts;
  const services = createServices(db);
  const app = express();
  app.use(cors());
  app.use(routes(services));

  const http = createServer(app);
  const io: GameServer = new Server(http, { cors: { origin: '*' } });
  const manager = new GameManager(
    new InMemoryGameStore(),
    (gameId, event, ...args) => io.to(room(gameId)).emit(event, ...args),
    { ...managerOpts, services },
    (gameId, color, event, ...args) => io.to(seatRoom(gameId, color)).emit(event, ...args),
  );
  services.wallet.onBalance((userId, balanceCents) => io.to(userRoom(userId)).emit('balance_updated', { balanceCents }));
  // Live games never survive a restart, so any buy-in still in escrow belongs to a dead game.
  services.wallet.refundAllHeld(new Set());

  const lobby = new Lobby(manager, services, {
    lobby: (snapshot) => io.to(LOBBY_ROOM).emit('lobby_update', snapshot),
    market: (gameId, p) => io.to(room(gameId)).emit('market_update', p),
    online: () => io.engine.clientsCount,
  });
  const sportsbook = new Sportsbook(manager, services, {
    balance: (userId, balanceCents) => io.to(userRoom(userId)).emit('balance_updated', { balanceCents }),
    settled: (userId, p) => io.to(userRoom(userId)).emit('match_bet_settled', p),
  }, lobby);
  manager.hooks = {
    changed: () => lobby.markDirty(),
    turn: (record) => lobby.turn(record),
    finished: (record, outcome) => sportsbook.onFinished(record, outcome),
    voided: (gameId) => sportsbook.voidAll(gameId),
  };

  const features: Feature[] = [lobbyFeature(lobby), sportsbookFeature(sportsbook)];
  registerHandlers(io, manager, services, features);

  const sweep = setInterval(() => manager.sweep(), 60 * 1000);
  sweep.unref();

  return {
    http,
    io,
    manager,
    services,
    lobby,
    sportsbook,
    close: async () => {
      clearInterval(sweep);
      lobby.dispose();
      manager.dispose();
      await io.close();
      services.db.close();
    },
  };
}
