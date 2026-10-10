import { io as connect, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@risky-chess/shared';

export type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

/** A connected client. */
export async function connectTo(url: string): Promise<Client> {
  const c: Client = connect(url, { transports: ['websocket'], forceNew: true });
  await new Promise<void>((resolve, reject) => {
    c.once('connect', () => resolve());
    c.once('connect_error', (e) => reject(e));
  });
  return c;
}
