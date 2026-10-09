import { io as connect, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@risky-chess/shared';
import type { App } from '../app';
import type { Caller } from '../game/GameManager';

export type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * A manager caller for unit tests, derived from a connection id: 'cw' and
 * 'cw2' are the same account on different sockets; 'conn-w' is account 'u-w'.
 */
export const caller = (connId: string): Caller => {
  const userId = `u-${connId.replace(/^conn-/, '').replace(/\d+$/, '')}`;
  return { userId, username: userId, connId };
};

/** Registers an account on the app and returns its bearer token. */
export function registerUser(app: App, username: string): { userId: string; token: string } {
  const out = app.services.auth.register(username);
  if (!out.ok) throw new Error(`register ${username}: ${out.message}`);
  return { userId: out.data.user.id, token: out.data.token };
}

/** A connected client for a fresh account (by name) or an existing one (by token). */
export async function connectAs(app: App, url: string, who: string | { token: string }): Promise<Client & { token: string }> {
  const token = typeof who === 'string' ? registerUser(app, who).token : who.token;
  const c = connect(url, { transports: ['websocket'], forceNew: true, auth: { token } }) as Client & { token: string };
  c.token = token;
  await new Promise<void>((resolve, reject) => {
    c.once('connect', () => resolve());
    c.once('connect_error', (e) => reject(e));
  });
  return c;
}
