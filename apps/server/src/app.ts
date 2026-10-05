import { createServer, type Server as HttpServer } from 'node:http';
import cors from 'cors';
import express from 'express';
import { Server } from 'socket.io';
import { GameManager, type GameManagerOptions } from './game/GameManager';
import { InMemoryGameStore } from './game/GameStore';
import { routes } from './http/routes';
import { registerHandlers, room, seatRoom, type GameServer } from './socket/handlers';

export interface App {
  http: HttpServer;
  io: GameServer;
  manager: GameManager;
  close(): Promise<void>;
}

export function createApp(opts: Partial<GameManagerOptions> = {}): App {
  const app = express();
  app.use(cors());
  app.use(routes());

  const http = createServer(app);
  const io: GameServer = new Server(http, { cors: { origin: '*' } });
  const manager = new GameManager(
    new InMemoryGameStore(),
    (gameId, event, ...args) => io.to(room(gameId)).emit(event, ...args),
    opts,
    (gameId, color, event, ...args) => io.to(seatRoom(gameId, color)).emit(event, ...args),
  );
  registerHandlers(io, manager);

  const sweep = setInterval(() => manager.sweep(), 10 * 60 * 1000);
  sweep.unref();

  return {
    http,
    io,
    manager,
    close: async () => {
      clearInterval(sweep);
      manager.dispose();
      await io.close();
    },
  };
}
