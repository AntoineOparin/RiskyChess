import { createServer, type Server as HttpServer } from 'node:http';
import cors from 'cors';
import express from 'express';
import { Server } from 'socket.io';
import type { Db } from './db/db';
import { GameManager, type GameManagerOptions } from './game/GameManager';
import { InMemoryGameStore } from './game/GameStore';
import { routes } from './http/routes';
import { createServices, type Services } from './platform';
import { registerHandlers, room, seatRoom, userRoom, type Feature, type GameServer } from './socket/handlers';

export interface App {
  http: HttpServer;
  io: GameServer;
  manager: GameManager;
  services: Services;
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

  const features: Feature[] = [];
  registerHandlers(io, manager, services, features);

  const sweep = setInterval(() => manager.sweep(), 60 * 1000);
  sweep.unref();

  return {
    http,
    io,
    manager,
    services,
    close: async () => {
      clearInterval(sweep);
      manager.dispose();
      await io.close();
      services.db.close();
    },
  };
}
